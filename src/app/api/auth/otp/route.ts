import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    const supabase = await createClient()

    // To force a 6-digit code instead of a magic link, we must use
    // the sign-in with OTP method but we need to ensure the project
    // is configured for "OTP" rather than "Magic Link".
    // In the API, this is handled by the Auth settings in the Supabase dashboard.
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
