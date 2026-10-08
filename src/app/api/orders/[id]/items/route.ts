import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

type Params = { params: Promise<{ id: string }> }

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
  }
}

/** Recompute an order's totals from its current items, matching the old logic. */
async function recalcOrderTotals(orderId: string) {
  const admin = supabaseAdmin()

  const { data: order } = await admin
    .from('orders')
    .select('tenant_id, discount')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return

  const { data: items } = await admin
    .from('order_items')
    .select('price, quantity')
    .eq('order_id', orderId)

  const itemsTotal = (items || []).reduce((s, i) => s + i.price * i.quantity, 0)

  const { data: tenant } = await admin
    .from('tenants')
    .select('tax_rate, service_charge')
    .eq('id', order.tenant_id)
    .maybeSingle()

  const taxRate = (tenant?.tax_rate ?? 8) / 100
  const serviceRate = (tenant?.service_charge ?? 0) / 100
  const discount = order.discount || 0
  const tax = +((itemsTotal - discount) * taxRate).toFixed(2)
  const serviceCharge = +(itemsTotal * serviceRate).toFixed(2)
  const total = +(itemsTotal - discount + tax + serviceCharge).toFixed(2)

  await admin
    .from('orders')
    .update({
      items_total: +itemsTotal.toFixed(2),
      tax,
      service_charge: serviceCharge,
      total,
    })
    .eq('id', orderId)
}

// Add item to existing order
export async function POST(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const { id: orderId } = await params
  const body = await req.json()
  const admin = supabaseAdmin()

  const { data: mi, error: miError } = await admin
    .from('menu_items')
    .select('id, name, price')
    .eq('id', body.menuItemId)
    .maybeSingle()

  if (miError) return json({ error: miError.message }, 500)
  if (!mi) return json({ error: 'Menu item not found' }, 404)

  const { data: item, error: itemError } = await admin
    .from('order_items')
    .insert({
      order_id: orderId,
      menu_item_id: mi.id,
      name: mi.name,
      price: mi.price,
      quantity: body.quantity || 1,
      notes: body.notes,
      status: 'PENDING',
    })
    .select()
    .single()

  if (itemError || !item) {
    return json({ error: itemError?.message || 'Failed to add item' }, 500)
  }

  await recalcOrderTotals(orderId)

  return json(mapOrderItem(item), 201)
}

// Update item quantity / remove
export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const { id: orderId } = await params
  const body = await req.json()
  const admin = supabaseAdmin()

  if (body.itemId) {
    if (body.action === 'remove') {
      await admin.from('order_items').delete().eq('id', body.itemId)
    } else if (body.quantity) {
      await admin.from('order_items').update({ quantity: body.quantity }).eq('id', body.itemId)
    }
  }

  await recalcOrderTotals(orderId)

  const { data: order } = await admin
    .from('orders')
    .select('*, items:order_items(*), table:tables(*)')
    .eq('id', orderId)
    .maybeSingle()

  if (order) return json(mapOrder(order))
  return json({ error: 'Order not found' }, 404)
}
