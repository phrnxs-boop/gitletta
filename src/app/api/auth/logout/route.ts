import { createClient } from '@/lib/supabase/server'
import { json } from '@/lib/tenant'

/**
 * POST /api/auth/logout
 * Ends the Supabase Auth session (clears the auth cookies).
 */
export async function POST() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) return json({ error: error.message }, 500)
  return json({ success: true })
}
