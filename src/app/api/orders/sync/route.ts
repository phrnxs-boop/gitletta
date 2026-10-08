import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

export const dynamic = 'force-dynamic'

// ---- Row -> legacy camelCase mappers ----

function mapOrderItem(row: any) {
  return {
    id: row.id,
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    notes: row.notes,
    status: row.status,
  }
}

function mapOrder(row: any) {
  const table = Array.isArray(row.table) ? row.table[0] : row.table
  const servedBy = Array.isArray(row.servedBy) ? row.servedBy[0] : row.servedBy
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderNumber: row.order_number,
    tableId: row.table_id,
    tableSessionId: row.table_session_id,
    orderType: row.order_type,
    status: row.status,
    itemsTotal: row.items_total,
    discount: row.discount,
    tax: row.tax,
    serviceCharge: row.service_charge,
    total: row.total,
    promoCodeId: row.promo_code_id,
    promoCode: row.promo_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    notes: row.notes,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    servedById: row.served_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    items: Array.isArray(row.items) ? row.items.map(mapOrderItem) : [],
    table: table
      ? {
          id: table.id,
          tenantId: table.tenant_id,
          name: table.name,
          seats: table.seats,
          area: table.area,
          qrToken: table.qr_token,
          active: table.active,
          createdAt: table.created_at,
        }
      : null,
    servedBy: servedBy ? { id: servedBy.id, name: servedBy.name } : null,
  }
}

export async function GET(req: NextRequest) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const url = new URL(req.url)
  const since = url.searchParams.get('since')

  const admin = supabaseAdmin()

  // Incremental poll: orders changed after `since`.
  let changedQuery = admin
    .from('orders')
    .select('*, items:order_items(*), table:tables(*), servedBy:profiles(id,name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (since) {
    const sinceDate = new Date(since)
    if (!isNaN(sinceDate.getTime())) {
      changedQuery = changedQuery.gt('updated_at', sinceDate.toISOString())
    }
  }

  const [{ data: changedOrders }, { data: allOrders }] = await Promise.all([
    changedQuery,
    admin
      .from('orders')
      .select('id, status, total, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const orders = (changedOrders || []).map(mapOrder)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todaysOrders = (allOrders || []).filter((o) => new Date(o.created_at) >= today)
  const revenue = todaysOrders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((s, o) => s + o.total, 0)
  const activeOrders = (allOrders || []).filter(
    (o) => !['COMPLETED', 'CANCELLED'].includes(o.status)
  ).length

  return json({
    orders,
    summary: {
      revenue: +revenue.toFixed(2),
      ordersToday: todaysOrders.length,
      activeOrders,
    },
    serverTime: new Date().toISOString(),
  })
}
