import { supabaseAdmin } from '@/lib/supabase/admin'
import { syncReviews } from '@/lib/google-reviews'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

/**
 * POST /api/google-reviews/sync
 * Manually triggers a review sync (respecting the throttle).
 */
export async function POST(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const { data: conn, error } = await supabaseAdmin()
    .from('google_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!conn) return json({ error: 'No Google connection' }, 404)

  const result = await syncReviews(conn.id)
  return json(result, result.error ? 400 : 200)
}
