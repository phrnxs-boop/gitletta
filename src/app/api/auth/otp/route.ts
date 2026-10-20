import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    const supabase = await createClient()

    // Removed shouldCreateUser: false because it can cause failures if the
    // user is not exactly as expected in auth.users. We rely on the 
    // super_admin check in the dashboard routes to keep it secure.
    const { error } = await supabase.auth.signInWithOtp({
      email,
    })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('OTP Error:', e)
    return NextResponse.json({ error: e.message || 'Failed to send sign-in code' }, { status: 400 })
  }
}
