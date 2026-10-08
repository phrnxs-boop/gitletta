import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

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

async function loadSettings(tenantId: string): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin()
    .from('settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
  const settingsMap: Record<string, string> = {}
  for (const s of data ?? []) settingsMap[s.key] = s.value
  return settingsMap
}

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'settings.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const { data: tenant, error: tenantError } = await supabaseAdmin()
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError) return json({ error: tenantError.message }, 500)

  const { data: settings, error: settingsError } = await supabaseAdmin()
    .from('settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
  if (settingsError) return json({ error: settingsError.message }, 500)

  const settingsMap: Record<string, string> = {}
  for (const s of settings ?? []) settingsMap[s.key] = s.value
  return json({ tenant: mapTenant(tenant), settings: settingsMap })
}

export async function PUT(req: Request) {
  const g = await guard(req, { permission: 'settings.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()
  const admin = supabaseAdmin()

  if (body.tenant) {
    const { error } = await admin
      .from('tenants')
      .update({
        name: body.tenant.name,
        tagline: body.tenant.tagline,
        address: body.tenant.address,
        phone: body.tenant.phone,
        email: body.tenant.email,
        currency: body.tenant.currency,
        currency_symbol: body.tenant.currencySymbol,
        tax_rate: body.tenant.taxRate,
        service_charge: body.tenant.serviceCharge,
        logo: body.tenant.logo,
      })
      .eq('id', tenantId)
    if (error) return json({ error: error.message }, 500)
  }

  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      const { error } = await admin
        .from('settings')
        .upsert(
          { tenant_id: tenantId, key, value: String(value) },
          { onConflict: 'tenant_id,key' },
        )
      if (error) return json({ error: error.message }, 500)
    }
  }

  // log it
  const { error: logError } = await admin.from('security_logs').insert({
    tenant_id: tenantId,
    action: 'SETTINGS_CHANGE',
    meta: 'Updated restaurant settings',
    ip: '192.168.1.10',
    user_agent: 'Chrome on macOS',
  })
  if (logError) return json({ error: logError.message }, 500)

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError) return json({ error: tenantError.message }, 500)

  const settingsMap = await loadSettings(tenantId)
  return json({ tenant: mapTenant(tenant), settings: settingsMap })
}
