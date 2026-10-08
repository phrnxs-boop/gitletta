import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Google Reviews integration library.
 *
 * Handles:
 *  - OAuth token management (refresh when expired)
 *  - Fetching reviews from the Google Business Profile API
 *  - Replying to reviews (where supported by the Google API)
 *  - Error handling + rate-limit awareness
 *
 * SECURITY & ISOLATION:
 *  - Google connection/review data is stored on the Tenant, NOT on TableSession.
 *  - Ending a customer table session NEVER touches Google reviews.
 *  - OAuth tokens are stored per-tenant in the GoogleConnection table.
 *  - In production, tokens should be encrypted at rest (KMS / app-level cipher).
 *
 * GOOGLE API CONFIG:
 *  - Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET env vars for OAuth.
 *  - Scopes: business.businessManage (reviews read+reply)
 *  - Rate limit: Google Business Profile API ~10 read-modify-write requests/sec per user.
 *    We throttle syncs to syncIntervalMins (default 60 min) per connection.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_BMP_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const GOOGLE_BM_BASE = 'https://mybusiness.googleapis.com/v4'

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_at: number // epoch ms
}

/**
 * Exchange an authorization code for tokens (OAuth callback).
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens | { error: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { error: 'Google OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)' }
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await res.json()
  if (!res.ok) {
    return { error: data.error_description || data.error || 'Token exchange failed' }
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens | { error: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { error: 'Google OAuth not configured' }
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await res.json()
  if (!res.ok) {
    return { error: data.error_description || data.error || 'Token refresh failed' }
  }

  return {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}

/**
 * Get a valid access token for a tenant's Google connection, refreshing if needed.
 * Updates the stored token if refreshed.
 */
export async function getValidAccessToken(connectionId: string): Promise<{ token: string } | { error: string }> {
  const admin = supabaseAdmin()
  const { data: conn, error } = await admin
    .from('google_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!conn) return { error: 'Google connection not found' }
  if (!conn.enabled) return { error: 'Google connection is disabled' }

  const now = Date.now()
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0

  // Token still valid (with 60s buffer)
  if (expiresAt - now > 60000) {
    return { token: conn.access_token }
  }

  // Need to refresh
  if (!conn.refresh_token) {
    return { error: 'Refresh token missing — re-connect Google Business Profile' }
  }

  const refreshed = await refreshAccessToken(conn.refresh_token)
  if ('error' in refreshed) {
    // Mark the connection with the error
    await admin
      .from('google_connections')
      .update({ last_sync_error: refreshed.error })
      .eq('id', connectionId)
    return { error: refreshed.error }
  }

  await admin
    .from('google_connections')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(refreshed.expires_at).toISOString(),
      last_sync_error: null,
    })
    .eq('id', connectionId)

  return { token: refreshed.access_token }
}

/**
 * Sync reviews from Google Business Profile for a tenant.
 * Respects the syncIntervalMins throttle — won't re-sync too frequently.
 *
 * In demo mode (no real Google credentials configured), this seeds
 * sample reviews so the UI is fully functional for testing.
 */
export async function syncReviews(connectionId: string): Promise<{ synced: number; error?: string }> {
  const admin = supabaseAdmin()
  const { data: conn, error } = await admin
    .from('google_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle()
  if (error) return { synced: 0, error: error.message }
  if (!conn) return { synced: 0, error: 'Connection not found' }
  if (!conn.enabled) return { synced: 0, error: 'Connection disabled' }

  // Throttle: don't sync more often than syncIntervalMins (unless forced)
  if (conn.last_synced_at) {
    const elapsed = Date.now() - new Date(conn.last_synced_at).getTime()
    const minElapsed = (conn.sync_interval_mins ?? 60) * 60 * 1000
    if (elapsed < minElapsed) {
      return { synced: 0, error: `Throttled — next sync available in ${Math.ceil((minElapsed - elapsed) / 60000)} min` }
    }
  }

  // Demo mode: if no real Google credentials, seed sample reviews
  const hasCreds = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
  if (!hasCreds || !conn.location_id) {
    return seedDemoReviews(conn.tenant_id, connectionId)
  }

  // Real Google API call
  const tokenResult = await getValidAccessToken(connectionId)
  if ('error' in tokenResult) {
    await admin
      .from('google_connections')
      .update({ last_sync_error: tokenResult.error })
      .eq('id', connectionId)
    return { synced: 0, error: tokenResult.error }
  }

  try {
    // Fetch reviews from Google Business Profile API
    // GET /v1/locations/{locationId}/reviews
    const res = await fetch(
      `${GOOGLE_BM_BASE}/accounts/${conn.account_name}/locations/${conn.location_id}/reviews?pageSize=50`,
      { headers: { authorization: `Bearer ${tokenResult.token}` } }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err.error?.message || `Google API error (${res.status})`
      await admin
        .from('google_connections')
        .update({ last_sync_error: msg, last_synced_at: new Date().toISOString() })
        .eq('id', connectionId)
      return { synced: 0, error: msg }
    }

    const data = await res.json()
    const reviews = data.reviews || []
    let count = 0

    for (const r of reviews) {
      const reviewId = r.reviewId || r.name?.split('/').pop()
      if (!reviewId) continue

      const { error: upsertError } = await admin
        .from('google_reviews')
        .upsert(
          {
            tenant_id: conn.tenant_id,
            connection_id: connectionId,
            google_review_id: reviewId,
            author_name: r.reviewer?.displayName || 'Anonymous',
            author_photo_url: r.reviewer?.profilePhotoUrl || null,
            rating: r.starRating ? parseInt(r.starRating) : 5,
            comment: r.comment || null,
            create_time: r.createTime ? new Date(r.createTime).toISOString() : null,
            update_time: r.updateTime ? new Date(r.updateTime).toISOString() : null,
            reply: r.reviewReply?.comment || null,
            reply_time: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime).toISOString() : null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,google_review_id' }
        )
      if (upsertError) throw new Error(upsertError.message)
      count++
    }

    await admin
      .from('google_connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('id', connectionId)

    return { synced: count }
  } catch (e: any) {
    const msg = e?.message || 'Sync failed'
    await admin
      .from('google_connections')
      .update({ last_sync_error: msg, last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)
    return { synced: 0, error: msg }
  }
}

/**
 * Reply to a Google review (where supported by the Google API).
 * Requires the connection to have a valid access token.
 */
export async function replyToReview(connectionId: string, reviewId: string, replyText: string): Promise<{ ok: boolean; error?: string }> {
  const admin = supabaseAdmin()
  const { data: conn, error } = await admin
    .from('google_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!conn) return { ok: false, error: 'Connection not found' }

  // Find the local review record
  const { data: review, error: reviewError } = await admin
    .from('google_reviews')
    .select('*')
    .eq('connection_id', connectionId)
    .eq('id', reviewId)
    .maybeSingle()
  if (reviewError) return { ok: false, error: reviewError.message }
  if (!review) return { ok: false, error: 'Review not found' }

  const hasCreds = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET

  if (!hasCreds || !conn.location_id) {
    // Demo mode: just store the reply locally
    const { error: updateError } = await admin
      .from('google_reviews')
      .update({ reply: replyText, reply_time: new Date().toISOString() })
      .eq('id', reviewId)
    if (updateError) return { ok: false, error: updateError.message }
    return { ok: true }
  }

  // Real Google API call
  const tokenResult = await getValidAccessToken(connectionId)
  if ('error' in tokenResult) return { ok: false, error: tokenResult.error }

  try {
    const res = await fetch(
      `${GOOGLE_BM_BASE}/accounts/${conn.account_name}/locations/${conn.location_id}/reviews/${review.google_review_id}/reply`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokenResult.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ comment: replyText }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: err.error?.message || `Google API error (${res.status})` }
    }

    const { error: updateError } = await admin
      .from('google_reviews')
      .update({ reply: replyText, reply_time: new Date().toISOString() })
      .eq('id', reviewId)
    if (updateError) return { ok: false, error: updateError.message }

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Reply failed' }
  }
}

/**
 * Seed demo reviews for testing when real Google credentials aren't configured.
 * This makes the UI fully functional without an actual Google connection.
 */
async function seedDemoReviews(tenantId: string, connectionId: string): Promise<{ synced: number }> {
  const admin = supabaseAdmin()
  const { count: existing } = await admin
    .from('google_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('connection_id', connectionId)
  if ((existing ?? 0) > 0) {
    // Already seeded — just update sync time
    await admin
      .from('google_connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('id', connectionId)
    return { synced: 0 }
  }

  const sampleReviews = [
    { authorName: 'Sarah Mitchell', rating: 5, comment: 'Absolutely incredible dining experience! The truffle carbonara was divine and the service was impeccable. Will definitely be back.', daysAgo: 2 },
    { authorName: 'James Chen', rating: 4, comment: 'Great food and atmosphere. The spicy ramen was flavorful but could use a bit more heat. Overall a solid experience.', daysAgo: 5 },
    { authorName: 'Priya Sharma', rating: 5, comment: 'Best restaurant in the city! The margherita pizza was authentic and the staff was so welcoming. Highly recommend the desserts too.', daysAgo: 8 },
    { authorName: 'Michael Rodriguez', rating: 3, comment: 'Decent place but the wait time was longer than expected. Food was good once it arrived. The beef bourguignon was tender.', daysAgo: 12 },
    { authorName: 'Emma Thompson', rating: 5, comment: 'Celebrated my anniversary here and it was perfect. The molten lava cake was to die for. Thank you for making it special!', daysAgo: 15 },
    { authorName: 'David Kim', rating: 4, comment: 'Solid sushi selection. The dragon roll was fresh and well-presented. Would have given 5 stars if not for the slightly slow service.', daysAgo: 18 },
  ]

  let count = 0
  for (const r of sampleReviews) {
    const createTime = new Date()
    createTime.setDate(createTime.getDate() - r.daysAgo)

    await admin.from('google_reviews').insert({
      tenant_id: tenantId,
      connection_id: connectionId,
      google_review_id: `demo-${Date.now()}-${count}`,
      author_name: r.authorName,
      rating: r.rating,
      comment: r.comment,
      create_time: createTime.toISOString(),
      update_time: createTime.toISOString(),
      reply: r.rating >= 4 ? `Thank you so much, ${r.authorName.split(' ')[0]}! We appreciate your kind words and hope to see you again soon.` : null,
      reply_time: r.rating >= 4 ? new Date(createTime.getTime() + 86400000).toISOString() : null,
    })
    count++
  }

  await admin
    .from('google_connections')
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq('id', connectionId)

  return { synced: count }
}

/**
 * Get the OAuth authorization URL for connecting a Google Business Profile.
 */
export function getAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    // In demo mode, return a placeholder — the UI will handle this gracefully
    return ''
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
