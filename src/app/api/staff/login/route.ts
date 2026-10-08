import { authenticateStaff } from '@/lib/staff-auth'
import { json } from '@/lib/tenant'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Find a tenant by exact id, then by exact slug. Two sequential, escaped
 * lookups (never interpolate user input into an `.or()` filter).
 */
async function findTenant(idOrSlug: string) {
  const admin = supabaseAdmin()
  const { data: byId } = await admin.from('tenants').select('*').eq('id', idOrSlug).maybeSingle()
  if (byId) return byId
  const { data: bySlug } = await admin.from('tenants').select('*').eq('slug', idOrSlug).maybeSingle()
  return bySlug ?? null
}

/**
 * GET /api/staff/login?tenant=<slug|id>
 * Returns the restaurant name + active staff list (names + employeeIds only, no PIN data).
 * This is for the staff login screen — shows who can log in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const admin = supabaseAdmin()

  let tenant: any = null

  // 1. Explicit ?tenant= slug/id
  const tenantSlug = url.searchParams.get('tenant')
  if (tenantSlug) tenant = await findTenant(tenantSlug)

  // 2. x-tenant-id header
  if (!tenant) {
    const headerId = req.headers.get('x-tenant-id')
    if (headerId) tenant = await findTenant(headerId)
  }

  // 3. Signed-in owner session (Supabase Auth)
  if (!tenant) {
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await admin
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.tenant_id) {
          const { data } = await admin
            .from('tenants')
            .select('*')
            .eq('id', profile.tenant_id)
            .maybeSingle()
          if (data) tenant = data
        }
      }
    } catch {
      // No owner session — fall through.
    }
  }

  // 4. Prefer a tenant that actually has active staff members.
  if (!tenant) {
    const { data: staffMember } = await admin
      .from('staff')
      .select('tenant_id')
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    if (staffMember?.tenant_id) {
      const { data } = await admin
        .from('tenants')
        .select('*')
        .eq('id', staffMember.tenant_id)
        .maybeSingle()
      if (data) tenant = data
    }
  }

  // 5. Fallback to newest tenant.
  if (!tenant) {
    const { data } = await admin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    tenant = data ?? null
  }

  if (!tenant) return json({ error: 'Restaurant not found' }, 404)

  const [staffRes, tenantsRes] = await Promise.all([
    admin
      .from('staff')
      .select('id, name, employee_id, avatar')
      .eq('tenant_id', tenant.id)
      .eq('active', true)
      .order('name', { ascending: true }),
    admin.from('tenants').select('id, name, slug, logo').order('name', { ascending: true }),
  ])

  if (staffRes.error) return json({ error: staffRes.error.message }, 500)
  if (tenantsRes.error) return json({ error: tenantsRes.error.message }, 500)

  const staff = (staffRes.data ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    employeeId: s.employee_id,
    avatar: s.avatar,
  }))

  return json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      logo: tenant.logo,
    },
    staff,
    availableTenants: tenantsRes.data ?? [],
  })
}

/**
 * POST /api/staff/login
 * Body: { tenantId, employeeId, pin }
 * Authenticates staff with PIN, creates session, sets HTTP-only cookie.
 */
export async function POST(req: Request) {
  const body = await req.json()
  const { tenantId, employeeId, pin } = body

  if (!tenantId || !employeeId || !pin) {
    return json({ error: 'Missing required fields' }, 400)
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ error: 'PIN must be exactly 4 digits' }, 400)
  }

  const result = await authenticateStaff(tenantId, employeeId, pin)
  if (!result.ok) {
    return json({ error: result.error, lockedUntil: result.lockedUntil }, 401)
  }

  // Set HTTP-only cookie
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set('tablo-staff-session', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60, // 12 hours
    path: '/',
  })

  return json({
    staff: {
      id: result.staff.id,
      name: result.staff.name,
      employeeId: result.staff.employee_id,
      role: result.staff.role?.name || 'Staff',
      roleId: result.staff.role_id,
    },
    token: result.token,
  })
}
