import { supabaseAdmin } from '@/lib/supabase/admin'
import { replyToReview } from '@/lib/google-reviews'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

/**
 * POST /api/google-reviews/respond
 * Reply to a Google review.
 * Body: { reviewId, reply }
 */
export async function POST(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const body = await req.json()
  const { reviewId, reply } = body

  if (!reviewId || !reply?.trim()) {
    return json({ error: 'reviewId and reply are required' }, 400)
  }

  const { data: conn, error } = await supabaseAdmin()
    .from('google_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!conn) return json({ error: 'No Google connection' }, 404)

  const result = await replyToReview(conn.id, reviewId, reply.trim())
  if (!result.ok) {
    return json({ error: result.error }, 400)
  }

  return json({ success: true })
}
