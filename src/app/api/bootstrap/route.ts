import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { staffTokenFromRequest, validateStaffSession } from '@/lib/staff-auth'

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

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'dashboard.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const admin = supabaseAdmin()

  const { data: tenantRow, error: tenantError } = await admin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError) return json({ error: tenantError.message }, 500)
  if (!tenantRow) return json({ error: 'Tenant not found' }, 404)

  const [
    usersRes,
    rolesRes,
    categoriesRes,
    menuRes,
    tablesRes,
    ordersRes,
    reservationsRes,
    promosRes,
    securityLogsRes,
    staffRes,
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('*, roleRef:roles(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
    admin.from('roles').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
    admin.from('categories').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
    admin
      .from('menu_items')
      .select('*, category:categories(*)')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true }),
    admin.from('tables').select('*').eq('tenant_id', tenantId).order('name', { ascending: true }),
    admin
      .from('orders')
      .select('*, items:order_items(*), table:tables(*), servedBy:profiles(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('reservations')
      .select('*, table:tables(*)')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: true }),
    admin.from('promo_codes').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    admin
      .from('security_logs')
      .select('*, user:profiles(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('staff').select('*, role:roles(*)').eq('tenant_id', tenantId).order('name', { ascending: true }),
  ])

  if (usersRes.error) return json({ error: usersRes.error.message }, 500)
  if (rolesRes.error) return json({ error: rolesRes.error.message }, 500)
  if (categoriesRes.error) return json({ error: categoriesRes.error.message }, 500)
  if (menuRes.error) return json({ error: menuRes.error.message }, 500)
  if (tablesRes.error) return json({ error: tablesRes.error.message }, 500)
  if (ordersRes.error) return json({ error: ordersRes.error.message }, 500)
  if (reservationsRes.error) return json({ error: reservationsRes.error.message }, 500)
  if (promosRes.error) return json({ error: promosRes.error.message }, 500)
  if (securityLogsRes.error) return json({ error: securityLogsRes.error.message }, 500)
  if (staffRes.error) return json({ error: staffRes.error.message }, 500)

  // Owner sessions belong to the profiles of this tenant.
  const profileIds = (usersRes.data ?? []).map((u: any) => u.id)
  let sessionsData: any[] = []
  if (profileIds.length > 0) {
    const { data: sessions, error: sessionsError } = await admin
      .from('user_sessions')
      .select('*, user:profiles(*)')
      .in('user_id', profileIds)
      .order('last_active', { ascending: false })
    if (sessionsError) return json({ error: sessionsError.message }, 500)
    sessionsData = sessions ?? []
  }

  const { data: settingsRows, error: settingsError } = await admin
    .from('settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
  if (settingsError) return json({ error: settingsError.message }, 500)

  const settingsMap: Record<string, string> = {}
  for (const s of settingsRows ?? []) settingsMap[s.key] = s.value

  const tenant = toCamel(tenantRow)
  const users = toCamel(usersRes.data ?? [])
  const roles = toCamel(rolesRes.data ?? [])
  const categories = toCamel(categoriesRes.data ?? [])
  const menuItems = toCamel(menuRes.data ?? [])
  const tables = toCamel(tablesRes.data ?? [])
  const orders = toCamel(ordersRes.data ?? [])
  const reservations = toCamel(reservationsRes.data ?? [])
  const promos = toCamel(promosRes.data ?? [])
  const sessions = toCamel(sessionsData)
  const securityLogs = toCamel(securityLogsRes.data ?? [])
  const staff = toCamel(staffRes.data ?? [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todaysOrders = orders.filter((o: any) => new Date(o.createdAt) >= today)
  const revenue = todaysOrders
    .filter((o: any) => o.status === 'COMPLETED')
    .reduce((s: number, o: any) => s + o.total, 0)
  const activeOrders = orders.filter(
    (o: any) => !['COMPLETED', 'CANCELLED'].includes(o.status),
  ).length

  // Check if this request is from a staff session.
  let currentStaff: any = null
  let staffPermissions: string[] = []
  const staffToken = staffTokenFromRequest(req)
  if (staffToken) {
    try {
      const result = await validateStaffSession(staffToken)
      if (result.ok) {
        staffPermissions = result.permissions
        currentStaff = {
          id: result.staff.id,
          name: result.staff.name,
          employeeId: result.staff.employee_id,
          role: result.staff.role?.name || 'Staff',
          avatar: result.staff.avatar,
        }
      }
    } catch {
      // ignore invalid staff session
    }
  }

  const currentUser =
    users[0] ||
    (currentStaff
      ? {
          id: currentStaff.id,
          name: currentStaff.name,
          email: `${currentStaff.employeeId}@staff.local`,
          role: currentStaff.role,
        }
      : null)

  return json({
    tenant,
    settings: settingsMap,
    currentUser,
    currentStaff,
    staffPermissions,
    users,
    roles,
    staff,
    categories,
    menuItems,
    tables,
    orders,
    reservations,
    promos,
    sessions,
    securityLogs,
    summary: {
      revenue: +revenue.toFixed(2),
      ordersToday: todaysOrders.length,
      activeOrders,
      totalTables: tables.length,
      totalMenuItems: menuItems.length,
      pendingReservations: reservations.filter((r: any) => r.status === 'PENDING').length,
    },
  })
}
