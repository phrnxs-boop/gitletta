'use client'

import { useState } from 'react'
import { useApp } from './data-context'
import { useStore } from '@/lib/store'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Search, Bell, ChevronDown, Building2, Check, Plus, Menu as MenuIcon } from 'lucide-react'
import { toast } from 'sonner'

export function Header() {
  const { data, setTenantId, refresh } = useApp()
  const { view, setSidebarOpen, setView, setSettingsTab } = useStore()
  const [tenants, setTenants] = useState<any[] | null>(null)
  const [openTenants, setOpenTenants] = useState(false)

  const openSettingsTab = (tab: string) => {
    setSettingsTab(tab)
    setView('settings')
  }

  const loadTenants = async () => {
    const res = await fetch('/api/tenants')
    const json = await res.json()
    setTenants(json)
  }

  const switchTenant = async (id: string, name: string) => {
    setTenantId(id)
    setOpenTenants(false)
    toast.success(`Switched to ${name}`)
    setTimeout(() => refresh(), 50)
  }

  if (!data) return null
  const { tenant, currentUser } = data

  const titles: Record<string, string> = {
    dashboard: 'Point of Sale',
    orders: 'Orders',
    analytics: 'Analytics',
    menu: 'Menu Management',
    qr: 'QR Codes',
    promos: 'Promo Codes',
    roles: 'Role Access',
    security: 'Security',
    settings: 'Settings',
  }

  return (
    <header className="flex items-center justify-between gap-2 md:gap-3 px-4 md:px-6 h-16 border-b border-border glass-strong sticky top-0 z-30">
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — opens main menu side panel (mobile only) */}
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open main menu"
          className="md:hidden shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border border-border bg-secondary/40 hover:bg-secondary hover:border-primary/30 transition-premium"
        >
          <MenuIcon className="h-5 w-5 text-foreground" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-semibold truncate tracking-tight">{titles[view] || 'Swixo'}</h1>
          <p className="text-xs text-muted-foreground hidden sm:block truncate">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
        {/* Search — desktop only */}
        <div className="hidden lg:flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2 w-56 xl:w-64">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        </div>

        {/* Tenant switcher */}
        <DropdownMenu open={openTenants} onOpenChange={(o) => { setOpenTenants(o); if (o && !tenants) loadTenants() }}>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 hover:bg-secondary px-2.5 sm:px-3 py-2 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">{tenant.name}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Switch restaurant</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(tenants || []).map((t) => (
              <DropdownMenuItem
                key={t.id}
                onClick={() => switchTenant(t.id, t.name)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.plan} plan</span>
                </div>
                {t.id === tenant.id && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-primary cursor-pointer">
              <Plus className="h-4 w-4 mr-2" /> Add restaurant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications — hide on small screens to avoid cramping */}
        <button className="relative h-9 w-9 rounded-xl border border-border bg-secondary/40 hover:bg-secondary items-center justify-center transition-colors hidden sm:flex">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
        </button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 hover:bg-secondary pl-1.5 pr-2 py-1 transition-colors">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-medium">{currentUser.name}</span>
              <span className="text-[10px] text-muted-foreground">{currentUser.role}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{currentUser.name}</span>
                <span className="text-xs text-muted-foreground">{currentUser.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openSettingsTab('profile')} className="cursor-pointer">
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettingsTab('preferences')} className="cursor-pointer">
              Preferences
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive cursor-pointer" onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                window.location.href = '/?view=login'
              })
            }}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
