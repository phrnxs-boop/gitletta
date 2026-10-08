import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

function mapTenant(t: any) {
  if (!t) return null
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    logo: t.logo,
    tagline: t.tagline,
    currency: t.currency,
    currencySymbol: t.currency_symbol,
    address: t.address,
    phone: t.phone,
    email: t.email,
    taxRate: t.tax_rate,
    serviceCharge: t.service_charge,
    plan: t.plan,
    active: t.active,
    onboardingDone: t.onboarding_done,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }
}

/** GET /api/tenants — list every tenant (used by the header switcher). */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'settings.view' })
  if (!g.ok) return g.response
  const { data, error } = await supabaseAdmin()
    .from('tenants')
    .select('id, name, slug, tagline, plan, active')
    .order('created_at', { ascending: true })
  if (error) return json({ error: error.message }, 500)
  return json(data ?? [])
}

/** PATCH /api/tenants — update the caller's own tenant profile fields. */
export async function PATCH(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const body = await req.json()
  const src = body?.tenant ?? body ?? {}

  const update: Record<string, any> = {}
  if (src.name !== undefined) update.name = src.name
  if (src.tagline !== undefined) update.tagline = src.tagline
  if (src.logo !== undefined) update.logo = src.logo
  if (src.currency !== undefined) update.currency = src.currency
  if (src.currencySymbol !== undefined) update.currency_symbol = src.currencySymbol
  if (src.address !== undefined) update.address = src.address
  if (src.phone !== undefined) update.phone = src.phone
  if (src.email !== undefined) update.email = src.email
  if (src.taxRate !== undefined) update.tax_rate = src.taxRate
  if (src.serviceCharge !== undefined) update.service_charge = src.serviceCharge

  if (Object.keys(update).length === 0) {
    return json({ error: 'No tenant fields to update' }, 400)
  }

  const { data, error } = await supabaseAdmin()
    .from('tenants')
    .update(update)
    .eq('id', tenantId)
    .select()
    .single()
  if (error) return json({ error: error.message }, 500)

  return json(mapTenant(data))
}
