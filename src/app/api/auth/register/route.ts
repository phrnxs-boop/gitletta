import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json, PERMISSION_KEYS } from '@/lib/tenant'

/** Default system roles seeded for every new tenant. */
const DEFAULT_ROLES = [
  {
    name: 'Owner',
    description: 'Full access to everything',
    permissions: [...PERMISSION_KEYS].join(','),
    is_system: true,
    color: '#ff7e6b',
  },
  {
    name: 'Manager',
    description: 'Runs the floor',
    permissions:
      'dashboard.view,orders.view,orders.manage,menu.view,menu.manage,tables.view,tables.manage,promos.view,promos.manage,analytics.view,qr.manage,staff.view',
    is_system: true,
    color: '#60a5fa',
  },
  {
    name: 'Waiter',
    description: 'Takes and serves orders',
    permissions: 'orders.view,orders.manage,menu.view,tables.view',
    is_system: true,
    color: '#4ade80',
  },
  {
    name: 'Cashier',
    description: 'Handles billing and payments',
    permissions: 'orders.view,orders.manage,orders.refund,menu.view,tables.view',
    is_system: true,
    color: '#fbbf24',
  },
  {
    name: 'Kitchen',
    description: 'Sees and advances the order queue',
    permissions: 'orders.view,orders.manage,menu.view',
    is_system: true,
    color: '#c084fc',
  },
]

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'restaurant'
  )
}

/**
 * POST /api/auth/register
 * Body: { name, email, password, restaurantName }
 * Creates the auth user (Supabase Auth), a tenant, the default system roles,
 * and the owner's profile row. The session cookie is persisted by the server
 * client on successful sign-up.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, password, restaurantName } = body

    if (!email || !password || !name) {
      return json({ error: 'Name, email, and password are required' }, 400)
    }

    const cleanEmail = String(email).toLowerCase().trim()
    const cleanName = String(name).trim()

    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: cleanName } },
    })

    if (authError) {
      if (/already|registered|exists/i.test(authError.message || '')) {
        return json({ error: 'An account with this email already exists' }, 400)
      }
      return json({ error: authError.message || 'Registration failed' }, 500)
    }

    const authUser = authData?.user
    // Supabase returns a user with an empty identities array for an address
    // that already exists (enumeration protection). Treat that as a duplicate.
    if (!authUser || (Array.isArray(authUser.identities) && authUser.identities.length === 0)) {
      return json({ error: 'An account with this email already exists' }, 400)
    }

    const admin = supabaseAdmin()

    // Derive a unique slug from the restaurant name.
    const cleanRestName = (restaurantName || `${cleanName}'s Restaurant`).trim()
    const baseSlug = slugify(cleanRestName)
    let slug = baseSlug
    for (let i = 0; i < 5; i++) {
      const { data: existing, error: slugError } = await admin
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (slugError) return json({ error: slugError.message }, 500)
      if (!existing) break
      slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`
    }

    // Create the tenant.
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .insert({
        name: cleanRestName,
        slug,
        plan: 'pro',
        // India-first defaults. The onboarding flow can change these, but a new
        // restaurant must not start out priced in dollars.
        currency: 'INR',
        currency_symbol: '₹',
        active: true,
      })
      .select()
      .single()
    if (tenantError) return json({ error: tenantError.message }, 500)

    // Create the default system roles.
    const { data: roles, error: rolesError } = await admin
      .from('roles')
      .insert(DEFAULT_ROLES.map((r) => ({ ...r, tenant_id: tenant.id })))
      .select()
    if (rolesError) return json({ error: rolesError.message }, 500)

    const ownerRole = (roles ?? []).find((r) => r.name === 'Owner')

    // Create the owner's profile, keyed by the auth user id.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .insert({
        id: authUser.id,
        tenant_id: tenant.id,
        name: cleanName,
        email: cleanEmail,
        role: 'OWNER',
        role_id: ownerRole?.id ?? null,
        active: true,
      })
      .select()
      .single()
    if (profileError) return json({ error: profileError.message }, 500)

    // Log the security event.
    const { error: logError } = await admin.from('security_logs').insert({
      tenant_id: tenant.id,
      user_id: profile.id,
      action: 'REGISTER',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      meta: 'Registered new account and created tenant',
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
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        currencySymbol: tenant.currency_symbol,
      },
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    return json({ error: error.message || 'Registration failed' }, 500)
  }
}
