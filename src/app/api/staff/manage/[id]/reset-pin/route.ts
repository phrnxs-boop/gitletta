import { hashPin } from '@/lib/staff-auth'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/staff/manage/[id]/reset-pin
 * Owner-only: resets a staff member's PIN.
 * Body: { pin }
 */
export async function POST(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'staff.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const tenantId = g.session.tenantId
  const body = await req.json()
  const { pin } = body
  const admin = supabaseAdmin()

  if (!pin || !/^\d{4}$/.test(pin)) {
    return json({ error: 'PIN must be exactly 4 digits' }, 400)
  }

  const { data: staff } = await admin
    .from('staff')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!staff) return json({ error: 'Staff not found' }, 404)

  const { hash, salt } = hashPin(pin)

  const { error } = await admin
    .from('staff')
    .update({
      pin_hash: hash,
      pin_salt: salt,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq('id', id)

  if (error) return json({ error: error.message }, 500)

  // Log the reset
  const { error: logError } = await admin.from('staff_activities').insert({
    staff_id: id,
    tenant_id: tenantId,
    action: 'PIN_RESET',
    meta: 'PIN reset by owner',
  })

  if (logError) return json({ error: logError.message }, 500)

  return json({ success: true })
}
