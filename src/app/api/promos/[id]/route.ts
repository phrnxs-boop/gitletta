import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

type Params = { params: Promise<{ id: string }> }

function mapPromo(p: any) {
  return {
    id: p.id,
    tenantId: p.tenant_id,
    code: p.code,
    description: p.description,
    type: p.type,
    value: p.value,
    minOrder: p.min_order,
    maxDiscount: p.max_discount,
    usageLimit: p.usage_limit,
    usedCount: p.used_count,
    validFrom: p.valid_from,
    validTo: p.valid_to,
    active: p.active,
    createdAt: p.created_at,
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'promos.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const body = await req.json()
  const data: any = {}
  if (body.code) data.code = body.code.toUpperCase()
  if (body.description !== undefined) data.description = body.description
  if (body.type) data.type = body.type
  if (body.value !== undefined) data.value = body.value
  if (body.minOrder !== undefined) data.min_order = body.minOrder
  if (body.maxDiscount !== undefined) data.max_discount = body.maxDiscount
  if (body.usageLimit !== undefined) data.usage_limit = body.usageLimit
  if (body.validTo !== undefined) data.valid_to = body.validTo ? new Date(body.validTo).toISOString() : null
  if (body.active !== undefined) data.active = body.active
  const { data: promo, error } = await supabaseAdmin()
    .from('promo_codes')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) return json({ error: error.message }, 500)
  return json(mapPromo(promo))
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'promos.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const { error } = await supabaseAdmin().from('promo_codes').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ success: true })
}
