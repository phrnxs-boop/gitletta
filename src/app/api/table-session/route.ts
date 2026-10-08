import { activateTableSession } from '@/lib/table-session'
import { json } from '@/lib/tenant'

/**
 * POST /api/table-session
 * Called when a customer scans a table QR code.
 * Body: { qrToken, deviceFp? }
 * Validates the QR against the DB and creates a NEW active session.
 * Returns the session token + tenant/table info (used for all subsequent requests).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { qrToken, deviceFp } = body

  const result = await activateTableSession({ qrToken, deviceFp })
  if (!result.ok) {
    return json({ error: result.error }, result.status)
  }

  return json({
    sessionToken: result.data.session.token,
    sessionId: result.data.session.id,
    status: result.data.session.status,
    tenant: result.data.tenant,
    table: result.data.table,
  }, 201)
}
