'use client'

import { createContext, useContext, useCallback, useState, useEffect, useRef, ReactNode } from 'react'
import { edgeFetch } from '@/lib/edge'

export interface Tenant {
  id: string
  name: string
  slug: string
  tagline: string | null
  logo: string | null
  currency: string
  currencySymbol: string
  address: string | null
  phone: string | null
  email: string | null
  taxRate: number
  serviceCharge: number
  plan: string
}

export interface User {
  id: string
  name: string
  email: string
  role: string
  avatar?: string | null
  roleId?: string | null
  twoFactorEnabled?: boolean
}

export interface Role {
  id: string
  name: string
  description: string | null
  permissions: string
  isSystem: boolean
  color: string
}

export interface Staff {
  id: string
  name: string
  employeeId: string
  roleId: string | null
  active: boolean
  avatar?: string | null
  role?: Role | null
  lockedUntil?: string | null
  lastLogin?: string | null
  createdAt?: string
}

export interface Category {
  id: string
  name: string
  icon: string | null
  sortOrder: number
  _count?: { menuItems: number }
}

export interface MenuItem {
  id: string
  categoryId: string
  name: string
  description: string | null
  price: number
  image: string | null
  available: boolean
  prepTime: number
  tags: string | null
  calories: number | null
  rating: number
  category?: Category
}

export interface OrderItem {
  id: string
  menuItemId: string
  name: string
  price: number
  quantity: number
  notes: string | null
  status: string
}

export interface Order {
  id: string
  orderNumber: number
  tableId: string | null
  orderType: string
  status: string
  itemsTotal: number
  discount: number
  tax: number
  serviceCharge: number
  total: number
  promoCode: string | null
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  paymentMethod: string | null
  paymentStatus: string
  createdAt: string
  completedAt: string | null
  servedById: string | null
  items: OrderItem[]
  table?: { id: string; name: string; seats: number; area: string } | null
  servedBy?: { id: string; name: string } | null
}

export interface Table {
  id: string
  name: string
  seats: number
  area: string
  qrToken: string
  active: boolean
  currentStatus?: string
  _count?: { orders: number }
}

export interface Reservation {
  id: string
  tableId: string | null
  name: string
  phone: string
  email: string | null
  partySize: number
  date: string
  time: string
  status: string
  occasion: string | null
  notes: string | null
  createdAt: string
  table?: { id: string; name: string } | null
}

export interface PromoCode {
  id: string
  code: string
  description: string | null
  type: string
  value: number
  minOrder: number
  maxDiscount: number
  usageLimit: number
  usedCount: number
  validFrom: string
  validTo: string | null
  active: boolean
}

export interface Session {
  id: string
  userId: string
  token: string
  device: string | null
  browser: string | null
  ip: string | null
  location: string | null
  current: boolean
  lastActive: string
  createdAt: string
  user?: { id: string; name: string; email: string }
}

export interface SecurityLog {
  id: string
  userId: string | null
  action: string
  ip: string | null
  userAgent: string | null
  meta: string | null
  createdAt: string
  user?: { id: string; name: string; email: string } | null
}

export interface AppData {
  tenant: Tenant
  settings: Record<string, string>
  currentUser: User
  currentStaff?: {
    id: string
    name: string
    employeeId: string
    role: string
    avatar?: string | null
  } | null
  staffPermissions?: string[]
  /** The caller's effective permissions: every key for an owner, the role's list for staff. */
  permissions?: string[]
  users: (User & { roleRef?: Role | null })[]
  roles: Role[]
  staff: Staff[]
  categories: Category[]
  menuItems: MenuItem[]
  tables: Table[]
  orders: Order[]
  reservations: Reservation[]
  promos: PromoCode[]
  sessions: Session[]
  securityLogs: SecurityLog[]
  summary: {
    revenue: number
    ordersToday: number
    activeOrders: number
    totalTables: number
    totalMenuItems: number
    pendingReservations: number
  }
}

import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export function playOrderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // 1st chime tone (G5)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(784, now)
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.04)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.35)

    // 2nd chime tone (C6)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1046.5, now + 0.12)
    gain2.gain.setValueAtTime(0, now + 0.12)
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.16)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.6)
  } catch {
    // Audio autoplay restrictions before interaction — silently ignored
  }
}

interface AppContextValue {
  data: AppData | null
  loading: boolean
  error: string | null
  tenantId: string | null
  setTenantId: (id: string) => void
  refresh: () => Promise<void>
  addOrUpdateOrder: (order: Order, notify?: boolean) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantIdState] = useState<string | null>(null)
  const recentNotifiedIds = useRef<Set<string>>(new Set())
  const lastSyncTimeRef = useRef<string>(new Date().toISOString())

  const refresh = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const headers: Record<string, string> = {}
      if (tenantId) headers['x-tenant-id'] = tenantId
      const res = await edgeFetch('/api/bootstrap', { headers })
      if (res.status === 404) {
        setError('NO_TENANT')
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json)
      lastSyncTimeRef.current = new Date().toISOString()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addOrUpdateOrder = useCallback((order: Order, shouldNotify: boolean = false) => {
    if (!order || !order.id) return

    let isBrandNew = false

    setData((prev) => {
      if (!prev) return prev
      const existingIdx = prev.orders.findIndex((o) => o.id === order.id)
      let nextOrders = [...prev.orders]

      if (existingIdx >= 0) {
        // Merge updated order
        nextOrders[existingIdx] = { ...nextOrders[existingIdx], ...order }
      } else {
        // Prepend brand new order
        isBrandNew = true
        nextOrders = [order, ...prev.orders]
      }

      // Re-calculate today summary
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todaysOrders = nextOrders.filter((o) => new Date(o.createdAt) >= today)
      const revenue = todaysOrders
        .filter((o) => o.status === 'COMPLETED')
        .reduce((sum, o) => sum + o.total, 0)
      const activeOrders = nextOrders.filter(
        (o) => !['COMPLETED', 'CANCELLED'].includes(o.status)
      ).length

      // Update table status if dine-in
      let nextTables = prev.tables
      if (order.tableId) {
        nextTables = prev.tables.map((t) =>
          t.id === order.tableId
            ? { ...t, currentStatus: order.status === 'COMPLETED' ? 'AVAILABLE' : 'OCCUPIED' }
            : t
        )
      }

      return {
        ...prev,
        orders: nextOrders,
        tables: nextTables,
        summary: {
          ...prev.summary,
          revenue: +revenue.toFixed(2),
          ordersToday: todaysOrders.length,
          activeOrders,
        },
      }
    })

    // If new order arrived, trigger audio chime and toast notification
    if (shouldNotify && !recentNotifiedIds.current.has(order.id)) {
      recentNotifiedIds.current.add(order.id)
      setTimeout(() => recentNotifiedIds.current.delete(order.id), 60000)

      playOrderChime()
      const tableName = order.table?.name || 'Table'
      const cs = order.total ? '₹' : ''
      toast.success(`🔔 New Order #${order.orderNumber} (${tableName})`, {
        description: `${order.items?.length || 1} items · Total: ${cs}${order.total?.toFixed(2) || '0.00'}`,
        duration: 5000,
      })
    }
  }, [])

  // Real-time synchronization, in three layers:
  //   1. Supabase Realtime (Postgres Changes) — instant, cross-device
  //   2. BroadcastChannel — instant, cross-tab in the same browser
  //   3. Periodic delta sync — safety net if the socket drops
  useEffect(() => {
    const activeTenantId = tenantId || data?.tenant?.id
    if (!activeTenantId) return

    let bc: BroadcastChannel | null = null
    let pollTimer: NodeJS.Timeout | null = null
    let realtimeDebounce: NodeJS.Timeout | null = null
    let isCancelled = false

    // 1. Cross-Tab Broadcast Channel (instantaneous local sync)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('swixo_orders_sync')
        bc.onmessage = (event) => {
          if (!event.data || isCancelled) return
          if (event.data.tenantId && event.data.tenantId !== activeTenantId) return
          if (event.data.type === 'ORDER_CREATED' || event.data.type === 'ORDER_UPDATED') {
            addOrUpdateOrder(event.data.order, event.data.type === 'ORDER_CREATED')
          }
        }
      }
    } catch {
      // ignore
    }

    // 3. Fallback Periodic Delta Sync (every 4 seconds) to guarantee no missed orders
    const runDeltaSync = async () => {
      if (isCancelled) return
      try {
        const since = lastSyncTimeRef.current
        const res = await edgeFetch(`/api/orders/sync?tenantId=${encodeURIComponent(activeTenantId)}&since=${encodeURIComponent(since)}`)
        if (res.ok) {
          const json = await res.json()
          if (json.orders && Array.isArray(json.orders)) {
            for (const ord of json.orders) {
              addOrUpdateOrder(ord, true)
            }
          }
          if (json.serverTime) {
            lastSyncTimeRef.current = json.serverTime
          }
        }
      } catch {
        // ignore network hiccups
      }
    }

    // 2. Supabase Realtime — the socket tells us *that* something changed; the
    //    delta sync above then fetches the authoritative row with its joins.
    //    Debounced because a single order write touches orders + order_items.
    const supabase = createClient()
    const channel = supabase
      .channel(`orders:${activeTenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        () => {
          if (isCancelled) return
          if (realtimeDebounce) clearTimeout(realtimeDebounce)
          realtimeDebounce = setTimeout(runDeltaSync, 150)
        }
      )
      .subscribe()

    pollTimer = setInterval(runDeltaSync, 4000)

    return () => {
      isCancelled = true
      if (bc) bc.close()
      if (realtimeDebounce) clearTimeout(realtimeDebounce)
      void supabase.removeChannel(channel)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [tenantId, data?.tenant?.id, addOrUpdateOrder])

  const setTenantId = useCallback((id: string) => {
    setTenantIdState(id)
  }, [])

  return (
    <AppContext.Provider value={{ data, loading, error, tenantId, setTenantId, refresh, addOrUpdateOrder }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppDataProvider')
  return ctx
}
