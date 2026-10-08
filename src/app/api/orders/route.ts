import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { validateTableSession } from '@/lib/table-session'
import { publishOrderEvent } from '@/lib/order-events'

// ---- Row -> legacy camelCase mappers (responses must keep the old shape) ----

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

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')

  let query = supabaseAdmin()
    .from('orders')
    .select(ORDER_SELECT)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && status !== 'all') query = query.eq('status', status)
  if (type && type !== 'all') query = query.eq('order_type', type)

  const { data, error } = await query
  if (error) return json({ error: error.message }, 500)

  return json((data || []).map(mapOrder))
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      orderType,
      items,
      promoCode,
      customerName,
      customerPhone,
      notes,
      servedById,
      tableSessionToken,
    } = body

    const admin = supabaseAdmin()

    // ── 1. Customer order via scanned table QR code ────────────────────────
    // Prices are recomputed server-side by `place_order`; the client's prices
    // are never trusted. `validateTableSession` runs first so the exact
    // 401/403 contract the public menu relies on is preserved.
    if (tableSessionToken) {
      const sessionResult = await validateTableSession({ sessionToken: tableSessionToken })
      if (!sessionResult.ok) {
        return json({ error: sessionResult.error }, sessionResult.status)
      }

      const { data: rpcData, error: rpcError } = await admin.rpc('place_order', {
        p_session_token: tableSessionToken,
        p_items: (items || []).map((it: any) => ({
          menuItemId: it.menuItemId,
          quantity: Math.max(1, Number(it.quantity) || 1),
          notes: it.notes || null,
        })),
        p_customer_name: customerName || null,
        p_customer_phone: customerPhone || null,
        p_notes: notes || null,
        p_order_type: orderType || 'DINE_IN',
        p_promo_code: promoCode || null,
      })

      if (rpcError) {
        const msg = rpcError.message || ''
        if (msg.includes('EMPTY_CART')) return json({ error: 'No valid items in order' }, 400)
        if (msg.includes('ITEM_UNAVAILABLE')) {
          return json({ error: 'One or more items are no longer available' }, 400)
        }
        if (msg.includes('INVALID_SESSION') || msg.includes('SESSION_REQUIRED')) {
          return json(
            { error: 'Session ended. Please scan the table QR code again to continue.' },
            403,
          )
        }
        return json({ error: msg || 'Failed to place order' }, 500)
      }

      const orderId = (rpcData as any)?.order_id
      const { data: orderRow, error: fetchError } = await admin
        .from('orders')
        .select(ORDER_SELECT)
        .eq('id', orderId)
        .single()

      if (fetchError || !orderRow) {
        return json({ error: fetchError?.message || 'Failed to load order' }, 500)
      }

      const order = mapOrder(orderRow)
      try {
        publishOrderEvent({ type: 'ORDER_CREATED', tenantId: order.tenantId, order })
      } catch (e) {
        console.error('Failed to publish order event:', e)
      }

      return json(order, 201)
    }

    // ── 2. POS / Staff / Dashboard order ───────────────────────────────────
    const g = await guard(req, { permission: 'orders.manage' })
    if (!g.ok) return g.response
    const tenantId = g.session.tenantId

    let tableId: string | null = null
    let tableSessionId: string | null = null

    if (body.tableId) {
      tableId = body.tableId
      const { data: activeSession } = await admin
        .from('table_sessions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('table_id', tableId)
        .eq('status', 'ACTIVE')
        .maybeSingle()
      if (activeSession) {
        tableSessionId = activeSession.id
      }
    }

    // Verify servedById if provided
    let validServedById: string | null = null
    if (servedById) {
      const { data: user } = await admin
        .from('profiles')
        .select('id')
        .eq('id', servedById)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (user) validServedById = user.id
    }

    // Compute item totals from the database (never from client prices)
    let itemsTotal = 0
    const itemData: any[] = []
    for (const it of items || []) {
      const { data: mi } = await admin
        .from('menu_items')
        .select('id, tenant_id, name, price')
        .eq('id', it.menuItemId)
        .maybeSingle()
      if (!mi) continue
      if (mi.tenant_id !== tenantId) continue // ensure item belongs to this tenant
      const qty = Math.max(1, Number(it.quantity) || 1)
      itemsTotal += mi.price * qty
      itemData.push({
        menu_item_id: mi.id,
        name: mi.name,
        price: mi.price,
        quantity: qty,
        notes: it.notes || null,
        status: 'PENDING',
      })
    }

    if (itemData.length === 0) {
      return json({ error: 'No valid items in order' }, 400)
    }

    const { data: tenant } = await admin
      .from('tenants')
      .select('tax_rate, service_charge')
      .eq('id', tenantId)
      .maybeSingle()
    const taxRate = (tenant?.tax_rate ?? 8) / 100
    const serviceRate = (tenant?.service_charge ?? 0) / 100

    let discount = 0
    let promoCodeId: string | undefined
    let promoCodeStr: string | undefined
    if (promoCode) {
      const { data: promo } = await admin
        .from('promo_codes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('code', promoCode)
        .eq('active', true)
        .maybeSingle()

      if (promo) {
        if (promo.type === 'PERCENTAGE') {
          discount = (itemsTotal * promo.value) / 100
          if (promo.max_discount > 0) discount = Math.min(discount, promo.max_discount)
        } else {
          discount = promo.value
        }
        if (itemsTotal >= promo.min_order) {
          promoCodeId = promo.id
          promoCodeStr = promo.code
          await admin
            .from('promo_codes')
            .update({ used_count: (promo.used_count ?? 0) + 1 })
            .eq('id', promo.id)
        } else {
          discount = 0
        }
      }
    }

    const tax = +((itemsTotal - discount) * taxRate).toFixed(2)
    const serviceCharge = +(itemsTotal * serviceRate).toFixed(2)
    const total = +(itemsTotal - discount + tax + serviceCharge).toFixed(2)

    // id / order_number / timestamps are filled by the database.
    const { data: created, error: orderError } = await admin
      .from('orders')
      .insert({
        tenant_id: tenantId,
        table_id: tableId,
        table_session_id: tableSessionId,
        order_type: orderType || 'DINE_IN',
        status: 'PENDING',
        items_total: +itemsTotal.toFixed(2),
        discount: +discount.toFixed(2),
        tax,
        service_charge: serviceCharge,
        total,
        promo_code_id: promoCodeId,
        promo_code: promoCodeStr,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        notes: notes || null,
        served_by_id: validServedById,
      })
      .select()
      .single()

    if (orderError || !created) {
      return json({ error: orderError?.message || 'Failed to place order' }, 500)
    }

    const { error: itemsError } = await admin
      .from('order_items')
      .insert(itemData.map((it) => ({ ...it, order_id: created.id })))

    if (itemsError) return json({ error: itemsError.message }, 500)

    const { data: orderRow, error: fetchError } = await admin
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', created.id)
      .single()

    if (fetchError || !orderRow) {
      return json({ error: fetchError?.message || 'Failed to load order' }, 500)
    }

    const order = mapOrder(orderRow)

    // Publish real-time order event for connected dashboard clients
    try {
      publishOrderEvent({ type: 'ORDER_CREATED', tenantId, order })
    } catch (e) {
      console.error('Failed to publish order event:', e)
    }

    return json(order, 201)
  } catch (error: any) {
    console.error('Order creation error:', error)
    return json({ error: error.message || 'Failed to place order' }, 500)
  }
}
