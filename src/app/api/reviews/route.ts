import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard, publicTenantId } from '@/lib/session'

function mapReview(r: any) {
  const table = Array.isArray(r.table) ? r.table[0] : r.table
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tableId: r.table_id,
    rating: r.rating,
    authorName: r.author_name,
    comment: r.comment,
    tags: r.tags,
    createdAt: r.created_at,
    table: table
      ? {
          id: table.id,
          tenantId: table.tenant_id,
          name: table.name,
          seats: table.seats,
          area: table.area,
          qrToken: table.qr_token,
          active: table.active,
          createdAt: table.created_at,
        }
      : null,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const tenantId = body.tenantId || (await publicTenantId(req))

    if (!tenantId) {
      return json({ error: 'Restaurant not found' }, 404)
    }

    const rating = Math.min(5, Math.max(1, Number(body.rating) || 5))
    const authorName = (body.authorName || 'Guest').trim()
    const comment = (body.comment || '').trim()
    const tags = Array.isArray(body.tags) ? body.tags.join(', ') : (body.tags || '')
    const tableId = body.tableId || null

    const { data: review, error } = await supabaseAdmin()
      .from('customer_reviews')
      .insert({
        tenant_id: tenantId,
        table_id: tableId,
        rating,
        author_name: authorName,
        comment: comment || null,
        tags: tags || null,
      })
      .select()
      .single()
    if (error) return json({ error: error.message }, 500)

    return json({ success: true, review: mapReview(review) }, 201)
  } catch (error: any) {
    console.error('Error submitting review:', error)
    return json({ error: 'Failed to submit review' }, 500)
  }
}

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  try {
    const tenantId = g.session.tenantId

    const { data, error } = await supabaseAdmin()
      .from('customer_reviews')
      .select('*, table:tables(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return json({ reviews: [] })

    return json({ reviews: (data ?? []).map(mapReview) })
  } catch {
    return json({ reviews: [] })
  }
}
