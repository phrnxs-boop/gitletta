"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, Mail, Loader2 } from 'lucide-react'
import { edgeFetch } from '@/lib/edge'

export default function SuperAdminLogin() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    
    try {
      // We use Supabase OTP (Magic Link/Code) via edgeFetch to an auth endpoint
      // This triggers the email to be sent to the provided email address
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!res.ok) throw new Error('Failed to send sign-in code. Please check the email.')
      setStep('code')
    } catch (e: any) {
      setMessage({ text: e.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!res.ok) throw new Error('Invalid sign-in code. Please try again.')
      
      // Redirect to dashboard after successful verification
      window.location.href = '/superadmin'
    } catch (e: any) {
      setMessage({ text: e.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">Super Admin Access</CardTitle>
          <CardDescription>
            {step === 'email' 
              ? 'Secure system-wide access. Please enter your admin email.' 
              : 'A verification code has been sent to your email.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={step === 'email' ? handleEmailSubmit : handleCodeSubmit} className="space-y-4">
            {step === 'email' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input 
                    type="email" 
                    placeholder="phrnx@icloud.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input 
                    type="text" 
                    placeholder="Enter 6-digit code" 
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-10 text-center tracking-widest font-mono"
                    required
                  />
                </div>
                <Button 
                  variant="link" 
                  className="text-xs text-slate-500"
                  onClick={(e) => { e.preventDefault(); setStep('email'); }}
                >
                  Change email
                </Button>
              </div>
            )}

            {message && (
              <div className={`p-3 rounded-md text-sm ${message.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                {message.text}
              </div>
            )}

            <Button className="w-full py-6 text-lg font-semibold transition-all hover:scale-[1.02]" disabled={loading}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
              ) : (
                step === 'email' ? 'Send Sign-in Code' : 'Verify & Enter'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center pb-6">
          <p className="text-xs text-slate-400">
            Secure System Gateway &bull; v1.0
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
