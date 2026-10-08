import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'

/**
 * GET /api/auth/me
 * Resolves the signed-in owner from the Supabase Auth session and returns their
 * profile + tenant + role. Returns 401 when there is no session.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return json({ authenticated: false }, 401)
    }

    const admin = supabaseAdmin()

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) return json({ error: profileError.message }, 500)
    if (!profile || !profile.active) {
      return json({ authenticated: false }, 401)
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

    return json({
      authenticated: true,
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
  } catch {
    return json({ authenticated: false }, 401)
  }
}
