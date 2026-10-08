import { hashPin } from '@/lib/staff-auth'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

/** Extract an embedded one-to-many count (`activities(count)`). */
function embedCount(v: any): number {
  if (Array.isArray(v)) return v[0]?.count ?? 0
  return v?.count ?? 0
}

/**
 * GET /api/staff/manage
 * Owner-only: returns all staff accounts for the tenant (no PIN data).
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'staff.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const admin = supabaseAdmin()

  const { data, error } = await admin
    .from('staff')
    .select('*, role:roles(*), activities:staff_activities(count)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) return json({ error: error.message }, 500)

  return json(
    (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      employeeId: s.employee_id,
      active: s.active,
      roleId: s.role_id,
      roleName: s.role?.name || '—',
      roleColor: s.role?.color || '#9aa3b2',
      avatar: s.avatar,
      failedAttempts: s.failed_attempts,
      lockedUntil: s.locked_until,
      lastLogin: s.last_login,
      activityCount: embedCount(s.activities),
      createdAt: s.created_at,
    })),
  )
}

/**
 * POST /api/staff/manage
 * Owner-only: creates a new staff account.
 * Body: { name, employeeId, roleId, pin, active }
 */
export async function POST(req: Request) {
  const g = await guard(req, { permission: 'staff.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()
  const { name, employeeId, roleId, pin, active } = body
  const admin = supabaseAdmin()

  if (!name?.trim() || !employeeId?.trim() || !pin) {
    return json({ error: 'Name, employee ID, and PIN are required' }, 400)
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ error: 'PIN must be exactly 4 digits' }, 400)
  }

  // Check for duplicate employeeId
  const { data: existing } = await admin
    .from('staff')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId.trim())
    .maybeSingle()
  if (existing) {
    return json({ error: 'Employee ID already exists' }, 400)
  }

  const { hash, salt } = hashPin(pin)

  const { data: staff, error } = await admin
    .from('staff')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      employee_id: employeeId.trim(),
      role_id: roleId || null,
      pin_hash: hash,
      pin_salt: salt,
      active: active !== false,
    })
    .select('*, role:roles(*)')
    .single()

  if (error) return json({ error: error.message }, 500)

  return json(
    {
      id: staff.id,
      name: staff.name,
      employeeId: staff.employee_id,
      roleId: staff.role_id,
      roleName: staff.role?.name || '—',
      active: staff.active,
    },
    201,
  )
}
