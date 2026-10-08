'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppDataProvider, useApp } from './data-context'
import { Sidebar, MobileMoreSheet } from './sidebar'
import { Header } from './header'
import { useStore } from '@/lib/store'
import { initTheme } from '@/lib/theme'
import { DashboardView } from '@/components/views/dashboard'
import { OrdersView } from '@/components/views/orders'
import { AnalyticsView } from '@/components/views/analytics'
import { MenuView } from '@/components/views/menu'
import { QrView } from '@/components/views/qr'
import { PromosView } from '@/components/views/promos'
import { RolesView } from '@/components/views/roles'
import { SecurityView } from '@/components/views/security'
import { SettingsView } from '@/components/views/settings'

function ViewRouter() {
  const { view } = useStore()
  switch (view) {
    case 'dashboard': return <DashboardView />
    case 'orders': return <OrdersView />
    case 'analytics': return <AnalyticsView />
    case 'menu': return <MenuView />
    case 'qr': return <QrView />
    case 'promos': return <PromosView />
    case 'roles': return <RolesView />
    case 'security': return <SecurityView />
    case 'settings': return <SettingsView />
    default: return <DashboardView />
  }
}

const VIEW_KEYS = new Set<string>([
  'dashboard', 'orders', 'analytics', 'promos', 'qr',
  'menu', 'settings', 'security', 'roles',
])

function ShellContent() {
  const { data, loading, error } = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const setView = useStore((s) => s.setView)

  // Deep links: /?view=orders used to always render the dashboard, because the
  // view lives in the zustand store and nothing ever seeded it from the URL.
  // Applied once per distinct param value — re-applying on every render would
  // fight the sidebar, which changes the store without touching the URL.
  const appliedViewRef = useRef<string | null>(null)
  useEffect(() => {
    const requested = searchParams.get('view')
    if (!requested || requested === appliedViewRef.current) return
    appliedViewRef.current = requested
    if (VIEW_KEYS.has(requested)) setView(requested as Parameters<typeof setView>[0])
  }, [searchParams, setView])

  // Initialize theme from localStorage on mount
  useEffect(() => {
    initTheme()
  }, [])

  // No tenant in DB — send to onboarding wizard
  useEffect(() => {
    if (error === 'NO_TENANT') {
      router.replace('/?view=onboarding')
    }
  }, [error, router])

  if (loading && !data) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center pulse-ring">
            <div className="w-7 h-7 rounded-lg bg-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your restaurant…</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <p className="text-destructive font-medium mb-2">Failed to load</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        {/* main fills remaining height — navigation is via the hamburger menu in the header */}
        <main className="flex-1 overflow-hidden min-h-0">
          <ViewRouter />
        </main>
      </div>
      <MobileMoreSheet />
    </div>
  )
}

export function AppShell() {
  return (
    <AppDataProvider>
      <ShellContent />
    </AppDataProvider>
  )
}
