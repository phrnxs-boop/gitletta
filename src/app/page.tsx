'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { edgeFetch } from '@/lib/edge'
import { AppShell } from '@/components/app/app-shell'
import { PublicMenu } from '@/components/public/public-menu'
import { LandingPage } from '@/components/landing/landing-page'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { LoginPage } from '@/components/auth/login-page'
import { StaffLoginPage } from '@/components/staff/staff-login'
import { StaffDashboard } from '@/components/staff/staff-dashboard'

// Views that require a logged-in owner session
const PROTECTED_VIEWS = ['onboarding', 'dashboard', '']

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    edgeFetch('/api/auth/me').then(res => {
      if (!res.ok) {
        router.replace('/?view=login')
      } else {
        setChecked(true)
      }
    }).catch(() => router.replace('/?view=login'))
  }, [router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center pulse-ring">
            <div className="w-6 h-6 rounded-md bg-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Checking session…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function PageContent() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? ''

  // Public views — no auth required
  if (view === 'public-menu' || searchParams.has('table')) return <PublicMenu />
  if (view === 'landing') return <LandingPage />
  if (view === 'login') return <LoginPage />
  if (view === 'staff-login') return <StaffLoginPage />
  if (view === 'staff-dashboard') return <StaffDashboard />

  // Default (/) → landing page
  if (view === '') return <LandingPage />

  // Protected views
  if (view === 'onboarding') {
    return (
      <AuthGate>
        <OnboardingFlow />
      </AuthGate>
    )
  }

  // Dashboard + any other view → full app shell (also handles NO_TENANT → onboarding redirect)
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center pulse-ring">
            <div className="w-6 h-6 rounded-md bg-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    }>
      <PageContent />
    </Suspense>
  )
}
