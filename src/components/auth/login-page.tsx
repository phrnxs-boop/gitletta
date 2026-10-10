'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, ArrowRight, Loader2, Shield, Mail, Lock, User, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'
import { edgeFetch } from '@/lib/edge'
import { createClient } from '@/lib/supabase/client'

/**
 * Owner auth moved to a stateless edge function: it returns the Supabase
 * `session` (access + refresh tokens) instead of setting cookies. We hand that
 * straight to the browser Supabase client so `edgeFetch` can read
 * `access_token` on every subsequent request. If the edge function didn't
 * include a session (older deployments / password-only fallback), we sign in
 * with the password directly against Supabase Auth.
 */
async function establishBrowserSession(
  session: { access_token: string; refresh_token: string } | null,
  email: string,
  password: string,
): Promise<void> {
  const supabase = createClient()
  if (session?.access_token && session?.refresh_token) {
    await supabase.auth.setSession(session)
    return
  }
  await supabase.auth.signInWithPassword({ email, password })
}

export function LoginPage() {
  const searchParams = useSearchParams()
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'

  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [name, setName] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Check if already logged in
  useEffect(() => {
    edgeFetch('/api/auth/me').then(res => {
      if (res.ok) {
        window.location.href = '/?view=dashboard'
      }
    }).catch(() => {})
  }, [])

  const signIn = async (em: string, pw: string) => {
    setError('')
    setLoading(true)
    try {
      const res = await edgeFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: em.trim(), password: pw }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }
      await establishBrowserSession(data.session, em.trim(), pw)
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}!`)
      setTimeout(() => {
        window.location.href = '/?view=dashboard'
      }, 500)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'register') {
      if (!name.trim() || !email.trim() || !password.trim()) {
        setError('Please fill in your name, email, and password')
        return
      }
      setLoading(true)
      try {
        const res = await edgeFetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            restaurantName: restaurantName.trim() || undefined,
            email: email.trim(),
            password,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Registration failed')
          return
        }
        await establishBrowserSession(data.session, email.trim(), password)
        toast.success(`Account created! Starting restaurant setup…`)
        setTimeout(() => {
          window.location.href = '/?view=onboarding'
        }, 500)
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    } else {
      if (!email.trim() || !password.trim()) {
        setError('Please enter your email and password')
        return
      }
      await signIn(email, password)
    }
  }

  // Seeded demo restaurant (see supabase/migrations/0004_seed_demo_tenant.sql).
  // A real Supabase Auth account, so the demo path exercises the same code as
  // a normal sign-in.
  const DEMO_EMAIL = 'owner@jaegarresto.in'
  const DEMO_PASSWORD = 'jaegar1234'

  const quickLogin = async (em: string) => {
    setMode('login')
    setEmail(em)
    setPassword(DEMO_PASSWORD)
    await signIn(em, DEMO_PASSWORD)
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-background lg:grid lg:grid-cols-[3fr_2fr]">

      {/* ── Branding ───────────────────────────────────────────────────────
          Three fifths on desktop. Hidden on small screens, where the same
          mark and headline reappear as a compact header above the card —
          a half-screen brand panel on a phone would push the form off it. */}
      <aside className="relative hidden lg:flex flex-col gap-6 xl:gap-8 overflow-hidden bg-secondary/30 border-r border-border p-10 xl:p-12">
        <div className="absolute -top-40 -left-32 w-[560px] h-[560px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-glow-primary">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <span className="text-lg font-bold tracking-tight">Swixo</span>
        </div>

        <h1 className="relative shrink-0 text-3xl xl:text-[2.4rem] font-bold tracking-tight leading-[1.15] max-w-[16ch]">
          Run the whole restaurant
          <span className="text-primary"> from one screen.</span>
        </h1>

        {/* The shots take whatever height is left and crop from the top rather
            than pushing past the panel — so the page never needs to scroll,
            whatever the window height. */}
        <div className="relative flex-1 min-h-0">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/20">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-secondary/40 px-3 py-2">
              <span className="size-2 rounded-full bg-muted-foreground/30" />
              <span className="size-2 rounded-full bg-muted-foreground/30" />
              <span className="size-2 rounded-full bg-muted-foreground/30" />
            </div>
            <img
              src="/screenshots/orders.webp"
              alt="The live order board"
              width={1600}
              height={800}
              loading="eager"
              className="min-h-0 w-full flex-1 object-cover object-top"
            />
          </div>

          {/* the phone hangs off the desk shot's bottom-right corner, overlapping the
              frame rather than the content inside it */}
          <div className="absolute -bottom-5 -right-5 w-[92px] xl:w-[104px] overflow-hidden rounded-[1.3rem] border border-border bg-card p-1.5 shadow-2xl shadow-black/40">
            <img
              src="/screenshots/mobile-menu.webp"
              alt="The diner menu on a phone"
              width={780}
              height={1688}
              loading="lazy"
              className="block w-full rounded-[1rem]"
            />
          </div>
        </div>

        <p className="relative flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          Secure authentication · Multitenant isolation
        </p>
      </aside>

      {/* ── Sign in / sign up ──────────────────────────────────────────────
          Two fifths on desktop; full width with a compact brand header on
          small screens. */}
      {/* overflow-y-auto is a safety valve: on a short window the form stays
          reachable instead of being clipped, and on a normal one there is no bar. */}
      <main className="relative flex h-full items-center justify-center overflow-y-auto px-4 py-8 sm:px-6 lg:px-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[420px] h-[300px] bg-primary/5 rounded-full blur-3xl pointer-events-none lg:hidden" />

        <div className="relative w-full max-w-sm">
          {/* Compact branding, small screens only */}
          <div className="text-center mb-6 lg:hidden">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-hover items-center justify-center shadow-glow-primary mb-3">
              <span className="text-white font-bold text-2xl">S</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === 'register' ? 'Create your Swixo Account' : 'Welcome to Swixo'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'register'
                ? 'Sign up to configure your restaurant in minutes'
                : 'Sign in to access your restaurant dashboard'}
            </p>
          </div>

        {/* Card */}
        <div className="card-premium rounded-3xl border border-border p-6 shadow-elevated">
          <div className="hidden lg:block mb-5">
            <h2 className="text-lg font-bold tracking-tight">
              {mode === 'register' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {mode === 'register'
                ? 'Set up your restaurant in a few minutes.'
                : 'Sign in to your restaurant dashboard.'}
            </p>
          </div>
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 mb-5 bg-secondary/60 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('login'); setError('') }}
              className={cn(
                'py-2 text-xs font-semibold rounded-lg transition-all',
                mode === 'login'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError('') }}
              className={cn(
                'py-2 text-xs font-semibold rounded-lg transition-all',
                mode === 'register'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                {/* Full Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs text-muted-foreground">Your Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Mercer"
                      className="pl-9 bg-secondary/50 border-border"
                      required
                    />
                  </div>
                </div>

                {/* Restaurant Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="restaurantName" className="text-xs text-muted-foreground">Restaurant Name</Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="restaurantName"
                      type="text"
                      value={restaurantName}
                      onChange={(e) => setRestaurantName(e.target.value)}
                      placeholder="e.g. Bella Bistro (optional)"
                      className="pl-9 bg-secondary/50 border-border"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="pl-9 bg-secondary/50 border-border"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/?view=reset-password' }}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10 bg-secondary/50 border-border"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-primary to-primary-hover hover:shadow-glow-primary transition-premium border-0 font-semibold"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {mode === 'register' ? 'Creating account…' : 'Signing in…'}</>
              ) : (
                <>
                  {mode === 'register' ? 'Start Restaurant Setup' : 'Sign In'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </form>

        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-xs text-muted-foreground">
            {mode === 'register' ? 'Already have an account? ' : 'New to Swixo? '}
            <button
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register')
                setError('')
              }}
              className="text-primary hover:underline font-medium"
            >
              {mode === 'register' ? 'Sign in here →' : 'Create an account →'}
            </button>
          </p>
          {/* The branding panel carries this line on desktop, so it appears
              here only when that panel is hidden. */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground lg:hidden">
            <Shield className="h-3 w-3" />
            Secure authentication · Multitenant isolation
          </div>
        </div>
        </div>
      </main>
    </div>
  )
}

function QuickLoginBtn({
  label,
  email,
  onClick,
}: {
  label: string
  email: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full px-3 py-2 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/70 transition-all text-xs text-left"
    >
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">{email}</span>
    </button>
  )
}
