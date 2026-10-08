import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/staff/manage/[id]
 * Owner-only: updates a staff account (name, role, active status).
 * Body: { name?, roleId?, active? }
 */
export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'staff.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const tenantId = g.session.tenantId
  const body = await req.json()
  const admin = supabaseAdmin()

  // Verify staff belongs to this tenant
  const { data: staff } = await admin
    .from('staff')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!staff) return json({ error: 'Staff not found' }, 404)

  const data: any = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.roleId !== undefined) data.role_id = body.roleId || null
  if (body.active !== undefined) {
    data.active = body.active
    // Reset lockout when reactivating
    if (body.active) {
      data.failed_attempts = 0
      data.locked_until = null
    }
  }

  const { data: updated, error } = await admin
    .from('staff')
    .update(data)
    .eq('id', id)
    .select('*, role:roles(*)')
    .single()

  if (error) return json({ error: error.message }, 500)

  return json({
    id: updated.id,
    name: updated.name,
    employeeId: updated.employee_id,
    roleId: updated.role_id,
    roleName: updated.role?.name || '—',
    active: updated.active,
  })
}

/**
 * DELETE /api/staff/manage/[id]
 * Owner-only: deletes a staff account (and all related sessions/activities).
 */
export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'staff.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const tenantId = g.session.tenantId
  const admin = supabaseAdmin()

  const { data: staff } = await admin
    .from('staff')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!staff) return json({ error: 'Staff not found' }, 404)

  const { error } = await admin.from('staff').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)

  return json({ success: true })
}
