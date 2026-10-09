'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LayoutGrid,
  Receipt,
  BarChart3,
  BookOpen,
  QrCode,
  Ticket,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Loader2,
  ShieldAlert,
  Menu as MenuIcon,
  X,
} from 'lucide-react'
import { AppDataProvider, useApp } from '@/components/app/data-context'
import { useStore, type ViewKey } from '@/lib/store'
import { staffFetch } from '@/lib/edge'
import { DashboardView } from '@/components/views/dashboard'
import { OrdersView } from '@/components/views/orders'
import { MenuView } from '@/components/views/menu'
import { QrView } from '@/components/views/qr'
import { AnalyticsView } from '@/components/views/analytics'
import { PromosView } from '@/components/views/promos'
import { RolesView } from '@/components/views/roles'
import { SecurityView } from '@/components/views/security'
import { SettingsView } from '@/components/views/settings'

interface StaffData {
  staff: {
    id: string
    name: string
    employeeId: string
    role: string
    roleId: string
    avatar: string | null
  }
  permissions: string[]
  modules: Record<string, boolean>
  tenant: any
}

const MODULE_ICONS: Record<string, any> = {
  dashboard: LayoutGrid,
  orders: Receipt,
  menu: BookOpen,
  qr: QrCode,
  analytics: BarChart3,
  promos: Ticket,
  roles: Users,
  security: ShieldCheck,
  settings: Settings,
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'POS',
  orders: 'Orders',
  menu: 'Menu',
  qr: 'Tables & QR',
  analytics: 'Analytics',
  promos: 'Promos',
  roles: 'Roles & Staff',
  security: 'Security',
  settings: 'Settings',
}

function StaffDashboardInner() {
  const [data, setData] = useState<StaffData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeModule, setActiveModule] = useState<string>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { setView } = useStore()
  const { data: appData } = useApp()

  useEffect(() => {
    staffFetch('/api/staff/me')
      .then(async (res) => {
        if (!res.ok) {
          window.location.href = '/?view=staff-login'
          return
        }
        const json = await res.json()
        setData(json)
        // Find first available module granted by role permissions
        const firstModule =
          Object.entries(json.modules).find(([_, v]) => v)?.[0] || 'dashboard'
        setActiveModule(firstModule)
        setView(firstModule as ViewKey)
      })
      .catch(() => {
        window.location.href = '/?view=staff-login'
      })
      .finally(() => setLoading(false))
  }, [setView])

  const handleLogout = async () => {
    try {
      await staffFetch('/api/staff/logout', { method: 'POST' })
    } finally {
      window.location.href = '/?view=staff-login'
    }
  }

  const handleSelectModule = (key: string) => {
    setActiveModule(key)
    setView(key as ViewKey)
    setMobileMenuOpen(false)
  }

  if (loading || !data) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Loading your role workspace…</p>
        </div>
      </div>
    )
  }

  const { staff, modules, tenant } = data
  const tenantName = tenant?.name || appData?.tenant?.name || 'Restaurant'
  const availableModules = Object.entries(modules).filter(([_, v]) => v)

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Desktop Sidebar — module icons based on assigned role permissions */}
      <aside className="hidden md:flex flex-col items-center gap-1 w-[76px] shrink-0 border-r border-border bg-sidebar py-4 z-20">
        <div className="mb-3 w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-glow-primary">
          <span className="text-white font-bold text-xl">{tenantName[0]}</span>
        </div>
        <nav className="flex-1 flex flex-col gap-1.5 px-2 w-full items-center">
          {availableModules.map(([key]) => {
            const Icon = MODULE_ICONS[key] || LayoutGrid
            const active = activeModule === key
            return (
              <button
                key={key}
                onClick={() => handleSelectModule(key)}
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-xl transition-premium group',
                  active
                    ? 'bg-primary/15 text-primary shadow-glow-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
                aria-label={MODULE_LABELS[key]}
                title={MODULE_LABELS[key]}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                {active && (
                  <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-7 w-1 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title="Sign out of staff account"
        >
          <LogOut className="h-[22px] w-[22px]" />
        </button>
      </aside>

      {/* Main container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="flex items-center justify-between gap-3 px-3.5 md:px-6 h-16 border-b border-border glass-strong sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold truncate">
                {MODULE_LABELS[activeModule] || 'Dashboard'}
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block truncate">
                {tenantName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Badge
              variant="secondary"
              className="bg-primary/15 text-primary border border-primary/25 font-semibold px-2.5 py-0.5"
            >
              {staff.role}
            </Badge>

            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 pl-1.5 pr-2.5 py-1">
              <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/30">
                {staff.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="text-xs font-semibold">{staff.name}</span>
                <span className="text-[10px] text-muted-foreground">{staff.employeeId}</span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 w-9 p-0"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative flex flex-col w-72 max-w-[80vw] bg-card border-r border-border p-4 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-sm">
                    {tenantName[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm leading-none">{tenantName}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{staff.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-1">
                {availableModules.map(([key]) => {
                  const Icon = MODULE_ICONS[key] || LayoutGrid
                  const active = activeModule === key
                  return (
                    <button
                      key={key}
                      onClick={() => handleSelectModule(key)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary text-white shadow-glow-primary'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{MODULE_LABELS[key]}</span>
                    </button>
                  )
                })}
              </div>

              <div className="pt-3 border-t border-border">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Real working module views powered by AppDataProvider */}
        <main className="flex-1 overflow-hidden min-h-0 relative">
          {activeModule === 'dashboard' && modules.dashboard && <DashboardView />}
          {activeModule === 'orders' && modules.orders && <OrdersView />}
          {activeModule === 'menu' && modules.menu && <MenuView />}
          {activeModule === 'qr' && modules.qr && <QrView />}
          {activeModule === 'analytics' && modules.analytics && <AnalyticsView />}
          {activeModule === 'promos' && modules.promos && <PromosView />}
          {activeModule === 'roles' && modules.roles && <RolesView />}
          {activeModule === 'security' && modules.security && <SecurityView />}
          {activeModule === 'settings' && modules.settings && <SettingsView />}

          {!modules[activeModule] && (
            <div className="h-full flex items-center justify-center p-4 md:p-6">
              <Card className="max-w-md p-4 md:p-6 text-center rounded-2xl border-border bg-card">
                <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold">Access Restricted</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your assigned role ({staff.role}) does not have permission to access {MODULE_LABELS[activeModule] || activeModule}.
                </p>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export function StaffDashboard() {
  return (
    <AppDataProvider>
      <StaffDashboardInner />
    </AppDataProvider>
  )
}
