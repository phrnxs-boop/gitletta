import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { endTableSession } from '@/lib/table-session'
import { publishOrderEvent } from '@/lib/order-events'

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

const ORDER_SELECT = '*, items:order_items(*), table:tables(*), servedBy:profiles(id,name)'

export async function GET(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  const { id } = await params

  const { data, error } = await supabaseAdmin()
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)
  if (!data) return json({ error: 'Not found' }, 404)
  return json(mapOrder(data))
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const body = await req.json()

  const admin = supabaseAdmin()
  const data: any = {}
  if (body.status) {
    data.status = body.status
    if (body.status === 'COMPLETED') {
      data.completed_at = new Date().toISOString()
      data.payment_status = 'PAID'
    }
  }
  if (body.paymentMethod) data.payment_method = body.paymentMethod
  if (body.paymentStatus) data.payment_status = body.paymentStatus
  if (body.tableId !== undefined) data.table_id = body.tableId || null
  if (body.customerName !== undefined) data.customer_name = body.customerName
  if (body.notes !== undefined) data.notes = body.notes

  const { data: updated, error: updateError } = await admin
    .from('orders')
    .update(data)
    .eq('id', id)
    .select(ORDER_SELECT)
    .single()

  if (updateError || !updated) {
    return json({ error: updateError?.message || 'Failed to update order' }, 500)
  }

  const order = mapOrder(updated)

  // If order was marked COMPLETED for a table, instantly end any active session
  // for that table. Best-effort — a failure must not fail the request.
  if (order.status === 'COMPLETED' && order.tableId) {
    try {
      await endTableSession({ tenantId: order.tenantId, tableId: order.tableId })
    } catch (e) {
      console.error('Failed to end table session on order completion:', e)
    }
  }

  try {
    publishOrderEvent({
      type: 'ORDER_UPDATED',
      tenantId: order.tenantId,
      order,
    })
    if (order.status === 'COMPLETED' && order.tableId) {
      publishOrderEvent({
        type: 'SESSION_ENDED',
        tenantId: order.tenantId,
        order: { id: order.id, tableId: order.tableId, status: 'COMPLETED' },
      })
    }
  } catch (e) {
    console.error('Failed to publish order updated event:', e)
  }

  return json(order)
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const { id } = await params

  const admin = supabaseAdmin()
  const { data: order } = await admin
    .from('orders')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (order) {
    await admin.from('orders').delete().eq('id', id)
    try {
      publishOrderEvent({
        type: 'ORDER_DELETED',
        tenantId: order.tenant_id,
        order: { id },
      })
    } catch {}
  }

  return json({ success: true })
}
