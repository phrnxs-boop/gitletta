import { endStaffSession, staffTokenFromRequest } from '@/lib/staff-auth'
import { json } from '@/lib/tenant'

/**
 * POST /api/staff/logout
 * Clears the staff session cookie and ends the session.
 */
export async function POST(req: Request) {
  const token = staffTokenFromRequest(req)

  if (token) {
    await endStaffSession(token)
  }

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete('tablo-staff-session')
  return json({ success: true })
}
