import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

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

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'promos.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const { data, error } = await supabaseAdmin()
    .from('promo_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) return json({ error: error.message }, 500)
  return json((data ?? []).map(mapPromo))
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'promos.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()
  const { data, error } = await supabaseAdmin()
    .from('promo_codes')
    .insert({
      tenant_id: tenantId,
      code: body.code.toUpperCase(),
      description: body.description,
      type: body.type || 'PERCENTAGE',
      value: body.value,
      min_order: body.minOrder || 0,
      max_discount: body.maxDiscount || 0,
      usage_limit: body.usageLimit || 0,
      valid_to: body.validTo ? new Date(body.validTo).toISOString() : null,
      active: body.active !== false,
    })
    .select()
    .single()
  if (error) return json({ error: error.message }, 500)
  return json(mapPromo(data), 201)
}
