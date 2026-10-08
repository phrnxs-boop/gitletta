import { json } from '@/lib/tenant'

/**
 * GET /api/public-menu
 *
 * SECURITY: This endpoint is now CLOSED. The menu is only accessible via the
 * session-validated endpoint: GET /api/table-session/validate?tenantId=&tableId=&sessionToken=
 *
 * Any direct access to /api/public-menu is rejected. Customers MUST scan the
 * physical table QR code (POST /api/table-session) to obtain a session token first.
 */
export async function GET() {
  return json(
    {
      error: 'Menu access requires an active table session. Please scan the QR code on your table.',
      sessionStatus: 'INVALID',
    },
    401
  )
}
