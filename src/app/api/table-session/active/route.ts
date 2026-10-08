import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

// ---- Row -> legacy camelCase mappers ----

function mapTable(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    seats: row.seats,
    area: row.area,
    qrToken: row.qr_token,
    active: row.active,
    createdAt: row.created_at,
  }
}

function mapSession(row: any) {
  const table = Array.isArray(row.table) ? row.table[0] : row.table
  const orders = row.order_rows || []
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tableId: row.table_id,
    token: row.token,
    status: row.status,
    deviceFp: row.device_fp,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    table: table ? mapTable(table) : null,
    _count: { orders: Array.isArray(orders) ? orders.length : 0 },
  }
}

/**
 * GET /api/table-session/active
 * Staff-only: returns all currently ACTIVE sessions for the tenant,
 * grouped by table. Used by the QR view to show "End Session" buttons.
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'tables.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const { data, error } = await supabaseAdmin()
    .from('table_sessions')
    .select('*, table:tables(*), order_rows:orders(id)')
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })

  if (error) return json({ error: error.message }, 500)

  const sessions = (data || []).map(mapSession)

  // group by tableId
  const byTable: Record<string, { id: string; tableId: string; table: any; sessions: any[] }> = {}
  for (const s of sessions) {
    if (!byTable[s.tableId]) {
      byTable[s.tableId] = { id: s.id, tableId: s.tableId, table: s.table, sessions: [] }
    }
    byTable[s.tableId].sessions.push(s)
  }

  return json(Object.values(byTable))
}
