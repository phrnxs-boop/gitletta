import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Credentials are validated by Supabase Auth. A successful sign-in persists the
 * session cookie automatically through the server client, so no manual cookie
 * wiring is needed here. We then load the owner's profile + tenant + role via
 * the privileged client and return the legacy response shape.
 */
export async function POST(req: Request) {
  const body = await req.json()
  const { email, password } = body

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, 400)
  }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: String(email).toLowerCase().trim(),
    password,
  })

  if (authError || !authData?.user) {
    return json({ error: 'Invalid email or password' }, 401)
  }

  const admin = supabaseAdmin()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError) return json({ error: profileError.message }, 500)
  if (!profile) return json({ error: 'Invalid email or password' }, 401)

  if (!profile.active) {
    return json({ error: 'Your account has been deactivated. Contact your manager.' }, 403)
  }

  const [tenantRes, roleRes] = await Promise.all([
    admin.from('tenants').select('*').eq('id', profile.tenant_id).maybeSingle(),
    profile.role_id
      ? admin.from('roles').select('*').eq('id', profile.role_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (tenantRes.error) return json({ error: tenantRes.error.message }, 500)
  if (roleRes.error) return json({ error: roleRes.error.message }, 500)

  const tenant = tenantRes.data
  const role = roleRes.data

  // Update last login timestamp.
  const { error: updateError } = await admin
    .from('profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', profile.id)
  if (updateError) return json({ error: updateError.message }, 500)

  // Log the security event.
  const { error: logError } = await admin.from('security_logs').insert({
    tenant_id: profile.tenant_id,
    user_id: profile.id,
    action: 'LOGIN',
    ip: req.headers.get('x-forwarded-for') || 'unknown',
    user_agent: req.headers.get('user-agent') || 'unknown',
    meta: `Login via email/password`,
  })
  if (logError) return json({ error: logError.message }, 500)

  return json({
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      roleId: profile.role_id,
      tenantId: profile.tenant_id,
      avatar: profile.avatar,
    },
    tenant: tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          tagline: tenant.tagline,
          currencySymbol: tenant.currency_symbol,
        }
      : null,
    role: role
      ? {
          id: role.id,
          name: role.name,
          permissions: role.permissions,
        }
      : null,
  })
}
