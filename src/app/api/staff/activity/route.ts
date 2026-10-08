import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

/** Recursively convert snake_case DB keys to camelCase response keys. */
function toCamel(v: any): any {
  if (Array.isArray(v)) return v.map(toCamel)
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      const key = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
      out[key] = toCamel(val)
    }
    return out
  }
  return v
}

/**
 * GET /api/staff/activity?staffId=
 * Returns staff activity/audit log. If staffId is provided, filters to that staff member.
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'staff.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const url = new URL(req.url)
  const staffId = url.searchParams.get('staffId')
  const admin = supabaseAdmin()

  let query = admin
    .from('staff_activities')
    .select('*, staff:staff(name, employee_id)')
    .eq('tenant_id', tenantId)

  if (staffId) query = query.eq('staff_id', staffId)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100)

  if (error) return json({ error: error.message }, 500)

  return json(toCamel(data ?? []))
}
