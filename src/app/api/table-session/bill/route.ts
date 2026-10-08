import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

/**
 * GET /api/table-session/bill
 * Resolves the latest order for a customer table session so the customer
 * can view their bill even after the session has ended.
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  try {
    const admin = supabaseAdmin()
    const url = new URL(req.url)
    const orderIdParam = url.searchParams.get('orderId')
    const sessionToken = url.searchParams.get('sessionToken')
    const tableIdParam = url.searchParams.get('tableId')
    const tenantIdParam = url.searchParams.get('tenantId')
    const qrTokenParam =
      url.searchParams.get('qrToken') || url.searchParams.get('qr') || url.searchParams.get('table')

    const latestFor = async (filters: Record<string, string>) => {
      let q = admin
        .from('orders')
        .select('id, order_number')
        .order('created_at', { ascending: false })
        .limit(1)
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      const { data } = await q.maybeSingle()
      return data
    }

    // 1. Direct orderId lookup
    if (orderIdParam) {
      const { data: order } = await admin
        .from('orders')
        .select('id, order_number')
        .eq('id', orderIdParam)
        .maybeSingle()
      if (order) {
        return json({ ok: true, orderId: order.id, orderNumber: order.order_number })
      }
    }

    // 1b. Direct qrToken lookup from QR scan
    if (qrTokenParam) {
      const { data: table } = await admin
        .from('tables')
        .select('id, tenant_id')
        .eq('qr_token', qrTokenParam)
        .maybeSingle()
      if (table) {
        const order = await latestFor({ table_id: table.id, tenant_id: table.tenant_id })
        if (order) {
          return json({ ok: true, orderId: order.id, orderNumber: order.order_number })
        }
      }
    }

    // 2. Lookup by sessionToken
    if (sessionToken) {
      const { data: session } = await admin
        .from('table_sessions')
        .select('id, tenant_id, table_id')
        .eq('token', sessionToken)
        .maybeSingle()

      if (session) {
        // First check orders tied directly to this session id
        let order = await latestFor({ table_session_id: session.id })

        // If not tied to tableSessionId, check orders for this table and tenant
        if (!order) {
          order = await latestFor({ tenant_id: session.tenant_id, table_id: session.table_id })
        }

        if (order) {
          return json({ ok: true, orderId: order.id, orderNumber: order.order_number })
        }
      }
    }

    // 3. Lookup by tableId
    if (tableIdParam) {
      const { data: table } = await admin
        .from('tables')
        .select('id, tenant_id')
        .eq('id', tableIdParam)
        .maybeSingle()
      const tenantId = table?.tenant_id || tenantIdParam || g.session.tenantId

      let order = await latestFor(
        tenantId ? { table_id: tableIdParam, tenant_id: tenantId } : { table_id: tableIdParam }
      )

      if (!order) {
        order = await latestFor({ table_id: tableIdParam })
      }

      if (order) {
        return json({ ok: true, orderId: order.id, orderNumber: order.order_number })
      }
    }

    // 4. Fallback: if tenantId is available, get the latest order for that tenant
    const tenantId = tenantIdParam || g.session.tenantId
    if (tenantId) {
      const latestOrder = await latestFor({ tenant_id: tenantId })
      if (latestOrder) {
        return json({ ok: true, orderId: latestOrder.id, orderNumber: latestOrder.order_number })
      }
    }

    // 5. Global fallback: latest order in the system
    const { data: anyLatestOrder } = await admin
      .from('orders')
      .select('id, order_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anyLatestOrder) {
      return json({ ok: true, orderId: anyLatestOrder.id, orderNumber: anyLatestOrder.order_number })
    }

    return json({ ok: false, error: 'No bill found' }, 404)
  } catch (error: any) {
    console.error('Error finding bill for session:', error)
    return json({ ok: false, error: 'Failed to retrieve bill' }, 500)
  }
}
