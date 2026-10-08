import { endTableSession } from '@/lib/table-session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { publishOrderEvent } from '@/lib/order-events'

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
  }
}

/**
 * POST /api/table-session/end
 * Staff-only: ends active table session(s) for the current tenant.
 * Body: { tableId?, sessionId? } — if neither, ends ALL active sessions for the tenant.
 * Marks sessions as ENDED (does NOT delete — historical orders are preserved).
 */
export async function POST(req: Request) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const body = await req.json().catch(() => ({}))
  const { tableId, sessionId } = body

  const result = await endTableSession({ tenantId, tableId, sessionId })
  if (!result.ok) {
    return json({ error: result.error }, result.status)
  }

  try {
    publishOrderEvent({
      type: 'SESSION_ENDED',
      tenantId,
      order: { tableId, sessionId, status: 'ENDED' },
    })
  } catch {}

  return json({ success: true, ended: result.ended })
}

/**
 * GET /api/table-session/end?tableId=
 * Staff-only: list active sessions for a table (so staff can see/end them).
 */
export async function GET(req: Request) {
  const g = await guard(req, { permission: 'tables.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const url = new URL(req.url)
  const tableId = url.searchParams.get('tableId')

  let query = supabaseAdmin()
    .from('table_sessions')
    .select('*, table:tables(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (tableId) query = query.eq('table_id', tableId)

  const { data, error } = await query
  if (error) return json({ error: error.message }, 500)

  return json((data || []).map(mapSession))
}
