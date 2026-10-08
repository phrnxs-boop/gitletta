import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

function mapGoogleReview(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    connectionId: r.connection_id,
    googleReviewId: r.google_review_id,
    authorName: r.author_name,
    authorPhotoUrl: r.author_photo_url,
    rating: r.rating,
    comment: r.comment,
    commentTranslated: r.comment_translated,
    createTime: r.create_time,
    updateTime: r.update_time,
    reply: r.reply,
    replyTime: r.reply_time,
    flagged: r.flagged,
    syncedAt: r.synced_at,
  }
}

function mapConnection(c: any) {
  return {
    id: c.id,
    tenantId: c.tenant_id,
    accessToken: c.access_token,
    refreshToken: c.refresh_token,
    tokenExpiresAt: c.token_expires_at,
    accountName: c.account_name,
    locationName: c.location_name,
    locationId: c.location_id,
    placeId: c.place_id,
    enabled: c.enabled,
    autoSync: c.auto_sync,
    syncIntervalMins: c.sync_interval_mins,
    showPublic: c.show_public,
    minRatingFilter: c.min_rating_filter,
    lastSyncedAt: c.last_synced_at,
    lastSyncError: c.last_sync_error,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }
}

/**
 * GET /api/google-reviews/settings
 * Returns the Google connection + reviews + settings for the tenant.
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'settings.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const admin = supabaseAdmin()
  const { data: conn, error } = await admin
    .from('google_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)

  if (!conn) {
    return json({ connected: false, reviews: [], settings: null })
  }

  const { data: reviews, error: reviewsError } = await admin
    .from('google_reviews')
    .select('*')
    .eq('connection_id', conn.id)
    .order('create_time', { ascending: false })
    .limit(50)
  if (reviewsError) return json({ error: reviewsError.message }, 500)

  return json({
    connected: true,
    connection: {
      id: conn.id,
      locationName: conn.location_name,
      enabled: conn.enabled,
      autoSync: conn.auto_sync,
      syncIntervalMins: conn.sync_interval_mins,
      showPublic: conn.show_public,
      minRatingFilter: conn.min_rating_filter,
      lastSyncedAt: conn.last_synced_at,
      lastSyncError: conn.last_sync_error,
      createdAt: conn.created_at,
    },
    reviews: (reviews ?? []).map(mapGoogleReview),
  })
}

/**
 * PUT /api/google-reviews/settings
 * Updates the Google connection settings.
 * Body: { enabled?, autoSync?, syncIntervalMins?, showPublic?, minRatingFilter? }
 */
export async function PUT(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const admin = supabaseAdmin()
  const body = await req.json()
  const { data: conn, error } = await admin
    .from('google_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!conn) return json({ error: 'No Google connection' }, 404)

  const data: any = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (typeof body.autoSync === 'boolean') data.auto_sync = body.autoSync
  if (typeof body.syncIntervalMins === 'number') data.sync_interval_mins = body.syncIntervalMins
  if (typeof body.showPublic === 'boolean') data.show_public = body.showPublic
  if (typeof body.minRatingFilter === 'number') data.min_rating_filter = body.minRatingFilter

  const { data: updated, error: updateError } = await admin
    .from('google_connections')
    .update(data)
    .eq('id', conn.id)
    .select()
    .single()
  if (updateError) return json({ error: updateError.message }, 500)

  return json({ success: true, connection: mapConnection(updated) })
}
