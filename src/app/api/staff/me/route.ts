import { validateStaffSession, staffTokenFromRequest } from '@/lib/staff-auth'
import { json } from '@/lib/tenant'
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
 * GET /api/staff/me
 * Returns the currently logged-in staff member + their permissions + tenant bootstrap data.
 * Used by the staff dashboard to determine which modules to show.
 */
export async function GET(req: Request) {
  const token = staffTokenFromRequest(req)

  if (!token) {
    return json({ authenticated: false }, 401)
  }

  const result = await validateStaffSession(token)
  if (!result.ok) {
    return json({ authenticated: false, error: result.error }, 401)
  }

  const staff = result.staff
  const permissions = result.permissions
  const tenantId = staff.tenant_id
  const admin = supabaseAdmin()

  // Fetch tenant data for the dashboard (menu, categories, tables, orders, etc.)
  const [tenantRes, categoriesRes, menuRes, tablesRes, ordersRes, rolesRes] = await Promise.all([
    admin.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
    admin.from('categories').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
    admin
      .from('menu_items')
      .select('*, category:categories(*)')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    admin.from('tables').select('*').eq('tenant_id', tenantId).order('name', { ascending: true }),
    admin
      .from('orders')
      .select('*, items:order_items(*), table:tables(*), servedBy:profiles(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('roles').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
  ])

  if (tenantRes.error) return json({ error: tenantRes.error.message }, 500)
  if (categoriesRes.error) return json({ error: categoriesRes.error.message }, 500)
  if (menuRes.error) return json({ error: menuRes.error.message }, 500)
  if (tablesRes.error) return json({ error: tablesRes.error.message }, 500)
  if (ordersRes.error) return json({ error: ordersRes.error.message }, 500)
  if (rolesRes.error) return json({ error: rolesRes.error.message }, 500)

  const tenant = toCamel(tenantRes.data)
  const categories = toCamel(categoriesRes.data ?? [])
  const menuItems = toCamel(menuRes.data ?? [])
  const tables = toCamel(tablesRes.data ?? [])
  const orders = toCamel(ordersRes.data ?? [])
  const roles = toCamel(rolesRes.data ?? [])

  const isOwnerOrSystem = staff.role?.is_system || staff.role?.name === 'Owner'
  const hasPerm = (p: string) => Boolean(isOwnerOrSystem) || permissions.includes(p)

  // Determine which modules the staff can access based on permissions
  const modules = {
    dashboard: hasPerm('dashboard.view'),
    orders: hasPerm('orders.view') || hasPerm('orders.manage'),
    analytics: hasPerm('analytics.view'),
    menu: hasPerm('menu.view') || hasPerm('menu.manage'),
    qr: hasPerm('tables.view') || hasPerm('tables.manage') || hasPerm('qr.manage'),
    promos: hasPerm('promos.view') || hasPerm('promos.manage'),
    roles: hasPerm('roles.view') || hasPerm('roles.manage') || hasPerm('staff.view') || hasPerm('staff.manage'),
    security: hasPerm('security.view') || hasPerm('security.manage'),
    settings: hasPerm('settings.view') || hasPerm('settings.manage'),
  }

  // Today's summary
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todaysOrders = orders.filter((o: any) => new Date(o.createdAt) >= today)
  const revenue = todaysOrders.filter((o: any) => o.status === 'COMPLETED').reduce((s: number, o: any) => s + o.total, 0)
  const activeOrders = orders.filter((o: any) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length

  return json({
    authenticated: true,
    staff: {
      id: staff.id,
      name: staff.name,
      employeeId: staff.employee_id,
      role: staff.role?.name || 'Staff',
      roleId: staff.role_id,
      avatar: staff.avatar,
    },
    permissions,
    modules,
    tenant,
    categories,
    menuItems,
    tables,
    orders,
    roles,
    summary: {
      revenue: +revenue.toFixed(2),
      ordersToday: todaysOrders.length,
      activeOrders,
      totalTables: tables.length,
      totalMenuItems: menuItems.length,
    },
  })
}
