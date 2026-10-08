import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthUrl } from '@/lib/google-reviews'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

/**
 * GET /api/google-reviews/connect
 * Returns the Google OAuth URL for connecting a Business Profile.
 * If no real Google credentials are configured, returns demoMode: true.
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const hasCreds = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
  const admin = supabaseAdmin()

  if (!hasCreds) {
    // Demo mode — create a demo connection so the UI is functional
    const { data: existing, error: findError } = await admin
      .from('google_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()
    if (findError) return json({ error: findError.message }, 500)

    let conn = existing
    if (!conn) {
      const { data, error } = await admin
        .from('google_connections')
        .insert({
          tenant_id: tenantId,
          access_token: 'demo-token',
          refresh_token: 'demo-refresh',
          token_expires_at: new Date(Date.now() + 86400000).toISOString(),
          location_name: 'Jaegar Resto (Demo)',
          enabled: true,
          auto_sync: true,
          sync_interval_mins: 60,
          show_public: true,
          min_rating_filter: 0,
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      conn = data
    }
    return json({ demoMode: true, connected: true, connectionId: conn.id })
  }

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/google-reviews/callback`
  const authUrl = getAuthUrl(redirectUri, tenantId)

  return json({ demoMode: false, authUrl })
}

/**
 * DELETE /api/google-reviews/connect
 * Disconnects the Google Business Profile (deletes the connection + reviews).
 * This is the ONLY action that removes Google data — never triggered by table-session end.
 */
export async function DELETE(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const admin = supabaseAdmin()
  const { error: reviewsError } = await admin.from('google_reviews').delete().eq('tenant_id', tenantId)
  if (reviewsError) return json({ error: reviewsError.message }, 500)
  const { error: connectionsError } = await admin.from('google_connections').delete().eq('tenant_id', tenantId)
  if (connectionsError) return json({ error: connectionsError.message }, 500)

  return json({ success: true })
}
