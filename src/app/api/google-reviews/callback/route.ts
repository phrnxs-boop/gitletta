import { supabaseAdmin } from '@/lib/supabase/admin'
import { exchangeCodeForTokens, syncReviews } from '@/lib/google-reviews'
import { json } from '@/lib/tenant'

/**
 * GET /api/google-reviews/callback?code=&state=
 * OAuth callback — exchanges the code for tokens, stores them, and syncs reviews.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // tenantId
  const error = url.searchParams.get('error')

  if (error) {
    return Response.redirect(`${url.origin}/?google_error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return json({ error: 'Missing code or state' }, 400)
  }

  const redirectUri = `${url.origin}/api/google-reviews/callback`
  const tokens = await exchangeCodeForTokens(code, redirectUri)
  if ('error' in tokens) {
    return json({ error: tokens.error }, 400)
  }

  const admin = supabaseAdmin()

  // Store the connection
  const { data: existing, error: findError } = await admin
    .from('google_connections')
    .select('*')
    .eq('tenant_id', state)
    .limit(1)
    .maybeSingle()
  if (findError) return json({ error: findError.message }, 500)

  let conn
  if (existing) {
    const { data, error: updateError } = await admin
      .from('google_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || existing.refresh_token,
        token_expires_at: new Date(tokens.expires_at).toISOString(),
        enabled: true,
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (updateError) return json({ error: updateError.message }, 500)
    conn = data
  } else {
    const { data, error: insertError } = await admin
      .from('google_connections')
      .insert({
        tenant_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(tokens.expires_at).toISOString(),
        enabled: true,
      })
      .select()
      .single()
    if (insertError) return json({ error: insertError.message }, 500)
    conn = data
  }

  // Initial sync
  await syncReviews(conn.id)

  // Redirect back to the app (settings → google reviews tab)
  return Response.redirect(`${url.origin}/?google_connected=true`)
}
