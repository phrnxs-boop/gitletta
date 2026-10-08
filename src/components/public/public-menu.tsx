'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ShoppingBag,
  Plus,
  Minus,
  X,
  Check,
  Clock,
  Star,
  Utensils,
  Search,
  Phone,
  MapPin,
  Loader2,
  ChevronUp,
  Sparkles,
  Flame,
  Leaf,
  Trash2,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BillDialog } from '@/components/shared/bill-dialog'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

// ---------- Types ----------
type Tenant = {
  id: string
  name: string
  tagline?: string | null
  logo?: string | null
  currencySymbol: string
  address?: string | null
  phone?: string | null
  taxRate?: number | null
  serviceCharge?: number | null
}

type TableObj = {
  id: string
  name: string
  seats: number
  area: string
} | null

type Category = {
  id: string
  name: string
  icon?: string | null
}

type MenuItem = {
  id: string
  categoryId: string
  name: string
  description?: string | null
  price: number
  image?: string | null
  prepTime: number
  tags?: string | null
  calories?: number | null
  rating: number
  category?: { id: string; name: string; icon?: string | null } | null
}

type CartItem = {
  menuItemId: string
  name: string
  price: number
  image?: string | null
  quantity: number
  notes?: string
  prepTime?: number
}

type PlacedOrder = {
  orderNumber: number
  total: number
  table?: { name: string } | null
}

// ---------- Constants ----------
const CORAL = '#f97316'
const CORAL_DARK = '#c43d1a'
const INK = '#1a1d29'
const PAPER = '#fafaf7'
const MUTED = '#71778a'

// ---------- Helpers ----------
function formatPrice(amount: number, symbol: string) {
  return `${symbol}${amount.toFixed(2)}`
}

function parseTags(tags?: string | null): string[] {
  if (!tags) return []
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function tagMeta(tag: string): { label: string; icon?: React.ReactNode; cls: string } {
  const t = tag.toLowerCase()
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none'
  switch (t) {
    case 'spicy':
      return { label: 'Spicy', icon: <Flame className="size-2.5" />, cls: `${base} bg-red-50 text-red-600` }
    case 'veg':
      return { label: 'Veg', icon: <Leaf className="size-2.5" />, cls: `${base} bg-emerald-50 text-emerald-600` }
    case 'vegan':
      return { label: 'Vegan', icon: <Leaf className="size-2.5" />, cls: `${base} bg-green-50 text-green-700` }
    case 'new':
      return { label: 'New', icon: <Sparkles className="size-2.5" />, cls: `${base} bg-amber-50 text-amber-600` }
    case 'bestseller':
      return { label: 'Bestseller', icon: <Star className="size-2.5 fill-current" />, cls: `${base} bg-orange-50 text-orange-600` }
    case 'non-veg':
      return { label: 'Non-Veg', cls: `${base} bg-rose-50 text-rose-600` }
    case 'jain':
      return { label: 'Jain', icon: <Sparkles className="size-2.5" />, cls: `${base} bg-amber-50 text-amber-700` }
    case 'gluten-free':
      return { label: 'GF', cls: `${base} bg-purple-50 text-purple-600` }
    default:
      return { label: tag.toUpperCase(), cls: `${base} bg-slate-100 text-slate-600` }
  }
}

// ---------- Main Component ----------
export function PublicMenu() {
  const searchParams = useSearchParams()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [table, setTable] = useState<TableObj>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [social, setSocial] = useState<{ instagram?: string; facebook?: string; youtube?: string }>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // session state: 'activating' | 'active' | 'ended' | 'invalid'
  const [sessionState, setSessionState] = useState<'activating' | 'active' | 'ended' | 'invalid'>('activating')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [sessionTenantId, setSessionTenantId] = useState<string | null>(null)
  const [sessionTableId, setSessionTableId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')

  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null)
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)
  const [billOrderId, setBillOrderId] = useState<string | null>(null)
  const [billOpen, setBillOpen] = useState(false)

  const pillsRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // ----- Session-gated menu access -----
  // The backend is the source of truth. We NEVER show the menu based on the URL
  // alone. The customer must scan the QR (qrToken in URL) to activate a session,
  // and we re-validate the session on every load (including refresh).
  useEffect(() => {
    let cancelled = false
    async function activateAndLoad() {
      try {
        setLoading(true)
        setError(null)
        setSessionState('activating')

        const params = new URLSearchParams(window.location.search)
        const qrToken = params.get('table') // this is the table's physical qrToken

        if (!qrToken) {
          // No QR token in URL → cannot activate a session → locked
          if (!cancelled) setSessionState('invalid')
          return
        }

        // 1. Activate a session by POSTing the qrToken to the backend.
        //    The backend validates the QR against the DB and creates a NEW session.
        //    We cache the session token in sessionStorage (UX only — NOT for security;
        //    the backend re-validates on every request).
        const storageKey = `table-session-${qrToken}`
        let cachedToken: string | null = null
        let cachedTenantId: string | null = null
        let cachedTableId: string | null = null
        try {
          const raw = sessionStorage.getItem(storageKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            cachedToken = parsed.token
            cachedTenantId = parsed.tenantId
            cachedTableId = parsed.tableId
          }
        } catch { /* ignore */ }

        let token = cachedToken
        let tenantId = cachedTenantId
        let tableId = cachedTableId

        // If we have a cached session token, validate it first (handles refresh).
        // If it's ended/invalid, we'll activate a new one using the qrToken.
        if (token && tenantId && tableId) {
          const vRes = await edgeFetch(`/api/table-session/validate?tenantId=${encodeURIComponent(tenantId)}&tableId=${encodeURIComponent(tableId)}&sessionToken=${encodeURIComponent(token)}`)
          if (vRes.ok) {
            const data = await vRes.json()
            if (cancelled) return
            if (data.sessionStatus === 'ACTIVE') {
              setSessionToken(token)
              setSessionTenantId(tenantId)
              setSessionTableId(tableId)
              setTenant(data.tenant)
              setTable(data.table)
              setCategories(data.categories || [])
              setMenuItems(data.menuItems || [])
              setSocial(data.social || {})
              setSessionState('active')
              setLoading(false)
              return
            }
          }
          // session invalid/ended — clear cache and fall through to activate new
          sessionStorage.removeItem(storageKey)
          token = null
        }

        // 2. No valid cached session — activate a new one using the QR token.
        //    This is the "scan the QR" step. Only a valid qrToken works.
        const actRes = await edgeFetch('/api/table-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ qrToken }),
        })
        if (!actRes.ok) {
          const err = await actRes.json().catch(() => ({}))
          if (cancelled) return
          setError(err.error || 'Failed to activate table session')
          setSessionState('invalid')
          setLoading(false)
          return
        }
        const actData = await actRes.json()
        if (cancelled) return

        token = actData.sessionToken
        tenantId = actData.tenant.id
        tableId = actData.table.id

        // cache (UX only)
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ token, tenantId, tableId }))
        } catch { /* ignore */ }

        setSessionToken(token)
        setSessionTenantId(tenantId)
        setSessionTableId(tableId)
        setTenant(actData.tenant)
        setTable(actData.table)
        setSessionState('active')
        const mRes = await edgeFetch(`/api/table-session/validate?tenantId=${encodeURIComponent(tenantId || '')}&tableId=${encodeURIComponent(tableId || '')}&sessionToken=${encodeURIComponent(token || '')}`)
        if (!mRes.ok) {
          const err = await mRes.json().catch(() => ({}))
          if (cancelled) return
          if (err.sessionStatus === 'INVALID' || mRes.status === 403) {
            setSessionState('ended')
          } else {
            setError(err.error || 'Failed to load menu')
            setSessionState('invalid')
          }
          setLoading(false)
          return
        }
        const mData = await mRes.json()
        if (cancelled) return
        setCategories(mData.categories || [])
        setMenuItems(mData.menuItems || [])
        setSocial(mData.social || {})
        setLoading(false)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Something went wrong')
          setSessionState('invalid')
          setLoading(false)
        }
      }
    }
    activateAndLoad()
    return () => {
      cancelled = true
    }
  }, [])

  // ----- Cart persistence (keyed by SESSION, not just table) -----
  // Switching tables / re-scanning creates a new session → fresh cart.
  const cartKey = useMemo(() => {
    if (!sessionToken) return null
    return `public-cart-session-${sessionToken}`
  }, [sessionToken])

  // load
  useEffect(() => {
    if (!cartKey) return
    try {
      const raw = localStorage.getItem(cartKey)
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[]
        if (Array.isArray(parsed)) setCart(parsed)
      }
    } catch {
      /* ignore */
    }
  }, [cartKey])

  // save
  useEffect(() => {
    if (!cartKey) return
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart))
    } catch {
      /* ignore */
    }
  }, [cart, cartKey])

  // ----- Cart actions -----
  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id)
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          quantity: 1,
          prepTime: item.prepTime,
        },
      ]
    })
    toast.success(`${item.name} added`, {
      duration: 1500,
    })
  }

  function decrement(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id)
      if (!existing) return prev
      if (existing.quantity <= 1) {
        return prev.filter((c) => c.menuItemId !== item.id)
      }
      return prev.map((c) =>
        c.menuItemId === item.id ? { ...c, quantity: c.quantity - 1 } : c
      )
    })
  }

  function setItemNotes(menuItemId: string, notes: string) {
    setCart((prev) =>
      prev.map((c) => (c.menuItemId === menuItemId ? { ...c, notes } : c))
    )
  }

  function removeFromCart(menuItemId: string) {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId))
  }

  function clearCart() {
    setCart([])
  }

  // ===== Instant Session End Listeners (BroadcastChannel + SSE + Heartbeat) =====
  // When restaurant staff marks an order COMPLETED, the customer menu ends instantly without any delay.
  useEffect(() => {
    if (sessionState !== 'active') return

    const targetTableId = sessionTableId || table?.id
    const targetTenantId = sessionTenantId || tenant?.id

    // 1. Same-device / cross-tab instant broadcast (0ms delay)
    let bc: BroadcastChannel | null = null
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      bc = new BroadcastChannel('swixo_orders_sync')
      bc.onmessage = (e) => {
        const msg = e.data
        if (!msg) return
        if (
          msg.type === 'SESSION_ENDED' &&
          (!msg.tableId || !targetTableId || msg.tableId === targetTableId)
        ) {
          setSessionState('ended')
          setCartOpen(false)
        } else if (
          msg.type === 'ORDER_UPDATED' &&
          msg.order?.status === 'COMPLETED' &&
          (!msg.order?.tableId || !targetTableId || msg.order.tableId === targetTableId)
        ) {
          setSessionState('ended')
          setCartOpen(false)
        }
      }
    }

    // 2. Fast Heartbeat Poll (1.5s fallback safety net)
    const interval = setInterval(async () => {
      if (!sessionToken) return
      try {
        const tId = targetTenantId || ''
        const tblId = targetTableId || ''
        const res = await edgeFetch(
          `/api/table-session/validate?tenantId=${encodeURIComponent(tId)}&tableId=${encodeURIComponent(
            tblId
          )}&sessionToken=${encodeURIComponent(sessionToken)}`
        )
        if (res.status === 401 || res.status === 403 || !res.ok) {
          setSessionState('ended')
          setCartOpen(false)
          return
        }
        const data = await res.json()
        if (data.sessionStatus !== 'ACTIVE') {
          setSessionState('ended')
          setCartOpen(false)
        }
      } catch {}
    }, 1500)

    return () => {
      if (bc) bc.close()
      clearInterval(interval)
    }
  }, [sessionState, sessionToken, sessionTenantId, sessionTableId, tenant?.id, table?.id])

  // ----- Derived values -----
  const currency = tenant?.currencySymbol || '$'
  const taxRate = (tenant?.taxRate ?? 8) / 100
  const serviceRate = (tenant?.serviceCharge ?? 0) / 100

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0)
  const itemsTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const tax = +(itemsTotal * taxRate).toFixed(2)
  const service = +(itemsTotal * serviceRate).toFixed(2)
  const grandTotal = +(itemsTotal + tax + service).toFixed(2)

  const estimatedPrep = useMemo(() => {
    if (cart.length === 0) return 0
    // sum of prep times (with light queue consideration)
    const sum = cart.reduce((s, c) => s + (c.prepTime || 15) * c.quantity, 0)
    return Math.max(15, Math.min(sum, 60))
  }, [cart])

  // ----- Filtering & grouping -----
  const filteredItems = useMemo(() => {
    let items = menuItems
    if (activeCat !== 'all') {
      items = items.filter((i) => i.categoryId === activeCat)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q) ||
          (i.tags || '').toLowerCase().includes(q)
      )
    }
    return items
  }, [menuItems, activeCat, search])

  const groupedSections = useMemo(() => {
    // If searching, group as a single "Search Results" section
    if (search.trim()) {
      return [{ category: null, items: filteredItems }]
    }
    // If a specific category is selected, only show that section
    if (activeCat !== 'all') {
      const cat = categories.find((c) => c.id === activeCat)
      if (!cat) return []
      return [{ category: cat, items: filteredItems }]
    }
    // Otherwise show all category sections that have items
    return categories
      .map((category) => ({
        category,
        items: filteredItems.filter((i) => i.categoryId === category.id),
      }))
      .filter((s) => s.items.length > 0)
  }, [filteredItems, categories, activeCat, search])

  // ----- Scroll to section (when category pill tapped) -----
  function selectCategory(id: string) {
    setActiveCat(id)
    // small delay so DOM updates (filter) then scroll
    requestAnimationFrame(() => {
      const el = sectionRefs.current[id === 'all' ? 'all' : id]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }

  // ----- Place order (requires active session) -----
  async function placeOrder() {
    if (!cart.length) return
    if (!sessionToken) {
      setSessionState('ended')
      return
    }
    setPlacing(true)
    try {
      const res = await edgeFetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tableSessionToken: sessionToken, // backend validates this; derives table+tenant
          orderType: 'DINE_IN',
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
            notes: c.notes || '',
          })),
        }),
      })
      if (res.status === 401 || res.status === 403) {
        // session ended/invalid → lock the menu
        const err = await res.json().catch(() => ({}))
        setSessionState('ended')
        setCartOpen(false)
        throw new Error(err.error || 'Session ended')
      }
      if (!res.ok) throw new Error('Failed to place order')
      const order = await res.json()
      if (order?.id) {
        setPlacedOrderId(order.id)
        try {
          sessionStorage.setItem('swixo_last_order_id', order.id)
        } catch {}
      }

      // Broadcast immediately across browser tabs/windows
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('swixo_orders_sync')
          bc.postMessage({
            type: 'ORDER_CREATED',
            tenantId: tenant?.id || sessionTenantId,
            order,
            timestamp: new Date().toISOString(),
          })
          bc.close()
        }
      } catch {
        /* ignore */
      }

      setPlacedOrder({
        orderNumber: order.orderNumber,
        total: order.total,
        table: order.table,
      })
      clearCart()
      toast.success('Order placed!', { duration: 2500 })
    } catch (e: any) {
      toast.error(e?.message || 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  function closeSheet() {
    setCartOpen(false)
    // small delay so the closing animation finishes before clearing success state
    setTimeout(() => {
      setPlacedOrder(null)
    }, 350)
  }

  // Handle opening bill modal
  const handleOpenBill = async () => {
    try {
      const q = new URLSearchParams()
      if (placedOrderId) {
        q.set('orderId', placedOrderId)
      } else {
        try {
          const savedId = sessionStorage.getItem('swixo_last_order_id')
          if (savedId) q.set('orderId', savedId)
        } catch {}
      }
      if (sessionToken) q.set('sessionToken', sessionToken)
      const tblId = sessionTableId || table?.id
      if (tblId) q.set('tableId', tblId)
      const tntId = sessionTenantId || tenant?.id
      if (tntId) q.set('tenantId', tntId)

      if (typeof window !== 'undefined') {
        const qr = new URLSearchParams(window.location.search).get('table')
        if (qr) q.set('qrToken', qr)
      }

      const res = await edgeFetch(`/api/table-session/bill?${q.toString()}`)
      const data = await res.json()
      if (data.ok && data.orderId) {
        setBillOrderId(data.orderId)
        setBillOpen(true)
      } else {
        toast.info('No bill found for this session')
      }
    } catch {
      toast.error('Failed to load bill')
    }
  }

  // ---------- Loading state ----------
  // ---------- Session ended / invalid → LOCKED screen ----------
  if (sessionState === 'ended' || sessionState === 'invalid') {
    const ended = sessionState === 'ended'
    return (
      <div className="min-h-screen bg-[#fafaf7] text-[#1a1d29] flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-[440px] w-full text-center rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-slate-100">
          <div className="mx-auto size-16 rounded-2xl flex items-center justify-center shadow-xs" style={{ background: ended ? '#fef3c7' : '#fee2e2' }}>
            {ended ? (
              <svg className="size-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v-2m0 2H8m4 0h4M12 3l8 4v5c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V7l8-4z" />
              </svg>
            ) : (
              <svg className="size-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.5.5-2 2-2s2 .5 2 2M5 11h14M12 3l8 4v5c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V7l8-4z" />
              </svg>
            )}
          </div>

          {ended && (
            <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-50 border border-slate-200/90 shadow-2xs">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-xs font-bold text-slate-800 tracking-tight">Google Reviews</span>
              <div className="flex items-center text-amber-500 text-xs">
                <span>★</span>
                <span className="text-[11px] font-bold ml-0.5 text-slate-700">5.0</span>
              </div>
            </div>
          )}

          <h2 className={cn("text-xl font-bold tracking-tight", ended ? "mt-2" : "mt-4")}>
            {ended ? 'Your table session has ended.' : 'Menu access requires a table session.'}
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
            {ended
              ? 'Please scan the QR code on your table to continue viewing the menu and placing orders.'
              : 'This menu is only accessible by scanning the QR code on your restaurant table.'}
          </p>

          {ended && (
            <SessionReviewCard
              tenantId={tenant?.id || sessionTenantId}
              tableId={table?.id || sessionTableId}
              sessionToken={sessionToken}
              sessionTenantId={sessionTenantId}
              sessionTableId={sessionTableId}
              onViewBill={handleOpenBill}
            />
          )}

          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-400 leading-relaxed border border-slate-100">
            For security, menu access cannot be restored by refreshing the page, using browser history, or copying the URL. Only scanning the table QR code activates a new session.
          </div>
        </div>

        {/* In-app bill modal */}
        <BillDialog
          orderId={billOrderId}
          open={billOpen}
          onOpenChange={setBillOpen}
        />
      </div>
    )
  }

  // ---------- Activating session → loading skeleton ----------
  if (loading || sessionState === 'activating') {
    return (
      <div className="min-h-screen bg-[#fafaf7] text-[#1a1d29]">
        <div className="max-w-md mx-auto px-4 pt-6">
          <Skeleton className="h-16 w-16 rounded-2xl bg-[#eeeae3]" />
          <Skeleton className="mt-4 h-7 w-3/4 bg-[#eeeae3]" />
          <Skeleton className="mt-2 h-4 w-1/2 bg-[#eeeae3]" />
          <Skeleton className="mt-4 h-12 w-full rounded-2xl bg-[#eeeae3]" />
          <div className="mt-4 flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-full bg-[#eeeae3]" />
            ))}
          </div>
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex gap-4 rounded-2xl bg-white p-3 shadow-sm"
              >
                <Skeleton className="size-20 rounded-xl bg-[#eeeae3]" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-2/3 bg-[#eeeae3]" />
                  <Skeleton className="h-3 w-full bg-[#eeeae3]" />
                  <Skeleton className="h-3 w-1/3 bg-[#eeeae3]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ---------- Error state ----------
  if (error || !tenant) {
    return (
      <div className="min-h-screen bg-[#fafaf7] text-[#1a1d29] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center rounded-3xl bg-white p-8 shadow-sm">
          <div className="mx-auto size-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <X className="size-7 text-red-500" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Menu unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">
            {error || 'We could not load this restaurant’s menu. Please try again.'}
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-6 w-full text-white"
            style={{ background: CORAL }}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  // ---------- Main render ----------
  return (
    <div
      className="min-h-screen bg-[#fafaf7] text-[#1a1d29]"
      style={{ paddingBottom: cart.length ? 96 : 0 }}
    >
      <div className="max-w-md mx-auto relative">
        {/* ===== Sticky header ===== */}
        <header className="sticky top-0 z-30 bg-[#fafaf7]/95 backdrop-blur-md border-b border-[#eeeae3]">
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {tenant.logo ? (
                  <img
                    src={tenant.logo}
                    alt={tenant.name}
                    className="size-12 rounded-2xl object-cover ring-1 ring-black/5"
                  />
                ) : (
                  <div
                    className="size-12 rounded-2xl flex items-center justify-center text-white shadow-sm"
                    style={{ background: CORAL }}
                  >
                    <Utensils className="size-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-xl font-bold leading-tight truncate">
                    {tenant.name}
                  </h1>
                  {tenant.tagline && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {tenant.tagline}
                    </p>
                  )}
                </div>
              </div>

              {tenant.phone && (
                <a
                  href={`tel:${tenant.phone}`}
                  className="shrink-0 size-10 rounded-full bg-white shadow-sm border border-[#eeeae3] flex items-center justify-center text-[#1a1d29] hover:bg-[#f5f1e8] transition"
                  aria-label="Call restaurant"
                >
                  <Phone className="size-4" />
                </a>
              )}
            </div>

            {/* Table card */}
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-sm border border-[#eeeae3]">
              {table ? (
                <>
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-700">
                    🍽️ {table.name} · {table.area} · {table.seats} seats
                  </span>
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span className="text-slate-700">Takeaway order</span>
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes…"
                className="pl-9 pr-9 h-11 rounded-full bg-white border-[#eeeae3] focus-visible:ring-[#f97316]/30 focus-visible:border-[#f97316]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div
            ref={pillsRef}
            className="px-4 pb-3 overflow-x-auto no-scrollbar"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="flex gap-2 w-max">
              <CategoryPill
                active={activeCat === 'all'}
                onClick={() => selectCategory('all')}
                icon="🍽️"
                label="All"
              />
              {categories.map((c) => (
                <CategoryPill
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => selectCategory(c.id)}
                  icon={c.icon || '🍴'}
                  label={c.name}
                />
              ))}
            </div>
          </div>
        </header>

        {/* ===== Menu sections ===== */}
        <main className="px-4 py-4">
          {groupedSections.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto size-14 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                <Search className="size-6 text-slate-400" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                No dishes found
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Try a different search or category.
              </p>
              {search && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setActiveCat('all')
                  }}
                  className="mt-3 text-[#f97316] hover:text-[#c43d1a] hover:bg-[#f97316]/10"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            groupedSections.map((section, idx) => {
              const key =
                section.category?.id || (search.trim() ? 'search' : 'all')
              return (
                <section
                  key={key}
                  ref={(el) => {
                    sectionRefs.current[key] = el
                  }}
                  className={idx > 0 ? 'mt-8' : ''}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">
                      {section.category?.icon || (search.trim() ? '🔎' : '🍽️')}
                    </span>
                    <h2 className="text-lg font-bold tracking-tight">
                      {search.trim()
                        ? `Search results (${section.items.length})`
                        : section.category?.name || 'Menu'}
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {section.items.map((item) => {
                      const inCart = cart.find((c) => c.menuItemId === item.id)
                      return (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          currency={currency}
                          inCartQty={inCart?.quantity || 0}
                          onAdd={() => addToCart(item)}
                          onDecrement={() => decrement(item)}
                        />
                      )
                    })}
                  </div>
                </section>
              )
            })
          )}

          {/* Footer info */}
          <footer className="mt-12 pb-8 text-center">
            <Separator className="my-6 bg-[#eeeae3]" />
            {tenant.address && (
              <div className="flex items-start justify-center gap-1.5 text-xs text-slate-500">
                <MapPin className="size-3.5 mt-0.5 shrink-0" />
                <span className="max-w-[260px]">{tenant.address}</span>
              </div>
            )}
            {tenant.phone && (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <Phone className="size-3.5" />
                <span>{tenant.phone}</span>
              </div>
            )}
            {/* Social media icons */}
            {(social.instagram || social.facebook || social.youtube) && (
              <div className="mt-4 flex items-center justify-center gap-3">
                {social.instagram && (
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1a1d29] text-white hover:scale-110 transition-transform" aria-label="Instagram">
                    <svg className="size-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </a>
                )}
                {social.facebook && (
                  <a href={social.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1a1d29] text-white hover:scale-110 transition-transform" aria-label="Facebook">
                    <svg className="size-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                )}
                {social.youtube && (
                  <a href={social.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1a1d29] text-white hover:scale-110 transition-transform" aria-label="YouTube">
                    <svg className="size-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </a>
                )}
              </div>
            )}
            <p className="mt-4 text-[10px] uppercase tracking-widest text-slate-400">
              Powered by Swixo
            </p>
          </footer>
        </main>

        {/* ===== Floating cart button ===== */}
        {cart.length > 0 && !cartOpen && (
          <button
            onClick={() => setCartOpen(true)}
            className="fixed bottom-24 right-1/2 translate-x-[15.5rem] sm:translate-x-[16rem] z-40 size-12 rounded-full shadow-lg flex items-center justify-center text-white transition-transform active:scale-95"
            style={{ background: INK }}
            aria-label="Open cart"
          >
            <ShoppingBag className="size-5" />
            {cartCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-[#fafaf7]"
                style={{ background: CORAL }}
              >
                {cartCount}
              </span>
            )}
          </button>
        )}

        {/* ===== Sticky cart bar ===== */}
        {cart.length > 0 && !cartOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-40">
            <div className="max-w-md mx-auto px-4 pb-4 pt-2">
              <button
                onClick={() => setCartOpen(true)}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-white shadow-xl transition-transform active:scale-[0.98]"
                style={{ background: CORAL }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="size-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                    {cartCount}
                  </span>
                  <span className="text-sm font-semibold">
                    {cartCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {formatPrice(grandTotal, currency)}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    View Order
                    <ChevronUp className="size-4" />
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ===== Cart sheet ===== */}
        <Sheet open={cartOpen} onOpenChange={(o) => (o ? setCartOpen(true) : closeSheet())}>
          <SheetContent
            side="bottom"
            hideCloseButton
            className="max-w-md mx-auto rounded-t-3xl p-0 border-0 bg-[#fafaf7] max-h-[92vh] flex flex-col"
          >
            {placedOrder ? (
              <SuccessView
                order={placedOrder}
                tableName={table?.name}
                estimatedPrep={estimatedPrep}
                currency={currency}
                onClose={closeSheet}
              />
            ) : cart.length === 0 ? (
              <EmptyCart onClose={closeSheet} />
            ) : (
              <>
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-[#eeeae3]">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="text-lg font-bold flex items-center gap-2">
                      <ShoppingBag className="size-5" style={{ color: CORAL }} />
                      Your Order
                    </SheetTitle>
                    <button
                      onClick={closeSheet}
                      className="size-8 rounded-full bg-[#f0ebe1] flex items-center justify-center text-slate-500 hover:bg-[#e6e0d3] transition"
                      aria-label="Close cart"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <SheetDescription className="text-xs">
                    {table ? (
                      <>
                        🍽️ {table.name} · {table.area} · Dine-in
                      </>
                    ) : (
                      <>Takeaway order</>
                    )}
                  </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-5 py-4 space-y-4">
                    {cart.map((c) => (
                      <CartLine
                        key={c.menuItemId}
                        item={c}
                        currency={currency}
                        onAdd={() => {
                          const mi = menuItems.find((m) => m.id === c.menuItemId)
                          if (mi) addToCart(mi)
                        }}
                        onDecrement={() => {
                          const mi = menuItems.find((m) => m.id === c.menuItemId)
                          if (mi) decrement(mi)
                        }}
                        onRemove={() => removeFromCart(c.menuItemId)}
                        onNotesChange={(n) => setItemNotes(c.menuItemId, n)}
                      />
                    ))}

                    {/* Suggested note */}
                    <div className="rounded-2xl bg-[#fff4f0] border border-[#ffe0d6] p-3 text-xs text-[#7a4a3a] flex items-start gap-2">
                      <Sparkles className="size-3.5 mt-0.5 shrink-0" style={{ color: CORAL }} />
                      <span>
                        Add notes for the kitchen — allergies, spice level, or
                        special requests.
                      </span>
                    </div>
                  </div>
                </ScrollArea>

                {/* Totals + place order */}
                <div className="border-t border-[#eeeae3] bg-white px-5 pt-4 pb-5 space-y-3 rounded-b-3xl">
                  <div className="space-y-1.5 text-sm">
                    <Row label="Subtotal" value={formatPrice(itemsTotal, currency)} />
                    {service > 0 && (
                      <Row
                        label={`Service (${Math.round(serviceRate * 100)}%)`}
                        value={formatPrice(service, currency)}
                      />
                    )}
                    <Row
                      label={`Tax (${Math.round(taxRate * 100)}%)`}
                      value={formatPrice(tax, currency)}
                    />
                    <Separator className="my-2 bg-[#eeeae3]" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-lg">
                        {formatPrice(grandTotal, currency)}
                      </span>
                    </div>
                    {estimatedPrep > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
                        <Clock className="size-3.5" />
                        <span>
                          Estimated prep time ~{estimatedPrep} min
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={placeOrder}
                    disabled={placing}
                    className="w-full h-12 text-white text-base font-semibold rounded-2xl"
                    style={{ background: CORAL }}
                  >
                    {placing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Placing order…
                      </>
                    ) : (
                      <>
                        Place Order · {formatPrice(grandTotal, currency)}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Bill dialog modal */}
        <BillDialog
          orderId={billOrderId}
          open={billOpen}
          onOpenChange={setBillOpen}
        />
      </div>
    </div>
  )
}

// ---------- Sub-components ----------
function CategoryPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold transition-all',
        active
          ? 'text-white shadow-sm'
          : 'bg-white text-slate-600 border border-[#eeeae3] hover:bg-[#f5f1e8]'
      )}
      style={active ? { background: CORAL } : undefined}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function MenuItemCard({
  item,
  currency,
  inCartQty,
  onAdd,
  onDecrement,
}: {
  item: MenuItem
  currency: string
  inCartQty: number
  onAdd: () => void
  onDecrement: () => void
}) {
  const tags = parseTags(item.tags)
  return (
    <article className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-[#f0ebe1] hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative shrink-0">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="size-20 sm:size-22 rounded-xl object-cover ring-1 ring-black/5"
            loading="lazy"
          />
        ) : (
          <div className="size-20 rounded-xl bg-[#f5f1e8] flex items-center justify-center">
            <Utensils className="size-6 text-slate-300" />
          </div>
        )}
        {item.rating >= 4.7 && (
          <span className="absolute -top-1 -left-1 rounded-full bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-sm flex items-center gap-0.5">
            <Star className="size-2.5 fill-current" />
            Top
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2">
            {item.name}
          </h3>
        </div>
        {item.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-slate-600">
              {item.rating.toFixed(1)}
            </span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Clock className="size-3" />
            {item.prepTime}m
          </span>
          {item.calories ? (
            <span className="inline-flex items-center gap-0.5">
              <Flame className="size-3" />
              {item.calories} cal
            </span>
          ) : null}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.slice(0, 3).map((t) => {
              const meta = tagMeta(t)
              return (
                <span key={t} className={meta.cls}>
                  {meta.icon}
                  {meta.label}
                </span>
              )
            })}
          </div>
        )}

        {/* Price + action */}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className="font-bold text-base" style={{ color: INK }}>
            {formatPrice(item.price, currency)}
          </span>
          {inCartQty === 0 ? (
            <button
              onClick={onAdd}
              className="size-8 rounded-full text-white shadow-sm flex items-center justify-center transition-transform active:scale-90"
              style={{ background: CORAL }}
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus className="size-4" />
            </button>
          ) : (
            <div
              className="flex items-center gap-1 rounded-full p-1 text-white"
              style={{ background: CORAL }}
            >
              <button
                onClick={onDecrement}
                className="size-7 rounded-full bg-white/20 flex items-center justify-center transition active:scale-90"
                aria-label="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-5 text-center text-xs font-bold tabular-nums">
                {inCartQty}
              </span>
              <button
                onClick={onAdd}
                className="size-7 rounded-full bg-white/20 flex items-center justify-center transition active:scale-90"
                aria-label="Increase quantity"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function CartLine({
  item,
  currency,
  onAdd,
  onDecrement,
  onRemove,
  onNotesChange,
}: {
  item: CartItem
  currency: string
  onAdd: () => void
  onDecrement: () => void
  onRemove: () => void
  onNotesChange: (n: string) => void
}) {
  const lineTotal = item.price * item.quantity
  return (
    <div className="rounded-2xl bg-white p-3 border border-[#f0ebe1]">
      <div className="flex gap-3">
        <div className="shrink-0">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="size-14 rounded-lg object-cover ring-1 ring-black/5"
            />
          ) : (
            <div className="size-14 rounded-lg bg-[#f5f1e8] flex items-center justify-center">
              <Utensils className="size-5 text-slate-300" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-snug line-clamp-1">
              {item.name}
            </h4>
            <button
              onClick={onRemove}
              className="shrink-0 text-slate-300 hover:text-red-500 transition"
              aria-label="Remove item"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatPrice(item.price, currency)} each
          </p>

          <div className="mt-2 flex items-center justify-between">
            <div
              className="flex items-center gap-1 rounded-full p-0.5 text-white"
              style={{ background: CORAL }}
            >
              <button
                onClick={onDecrement}
                className="size-7 rounded-full bg-white/20 flex items-center justify-center transition active:scale-90"
                aria-label="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-6 text-center text-xs font-bold tabular-nums">
                {item.quantity}
              </span>
              <button
                onClick={onAdd}
                className="size-7 rounded-full bg-white/20 flex items-center justify-center transition active:scale-90"
                aria-label="Increase quantity"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <span className="font-bold text-sm">{formatPrice(lineTotal, currency)}</span>
          </div>
        </div>
      </div>

      <Textarea
        value={item.notes || ''}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Add notes (no onions, extra spicy…)"
        className="mt-3 min-h-9 text-xs rounded-lg bg-[#fafaf7] border-[#eeeae3] focus-visible:ring-[#f97316]/30 focus-visible:border-[#f97316] resize-none"
        rows={1}
      />
    </div>
  )
}

function EmptyCart({ onClose }: { onClose: () => void }) {
  return (
    <div className="py-16 px-6 text-center relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 size-8 rounded-full bg-[#f0ebe1] flex items-center justify-center text-slate-500 hover:bg-[#e6e0d3] transition"
        aria-label="Close cart"
      >
        <X className="size-4" />
      </button>
      <div
        className="mx-auto size-16 rounded-2xl flex items-center justify-center"
        style={{ background: '#fff4f0' }}
      >
        <ShoppingBag className="size-7" style={{ color: CORAL }} />
      </div>
      <h3 className="mt-4 text-lg font-bold">Your cart is empty</h3>
      <p className="mt-1 text-sm text-slate-500">
        Add a few dishes from the menu to get started.
      </p>
      <Button
        onClick={onClose}
        className="mt-6 w-full text-white"
        style={{ background: CORAL }}
      >
        Browse menu
      </Button>
    </div>
  )
}

function SuccessView({
  order,
  tableName,
  estimatedPrep,
  currency,
  onClose,
}: {
  order: PlacedOrder
  tableName?: string
  estimatedPrep: number
  currency: string
  onClose: () => void
}) {
  return (
    <div className="px-6 pt-10 pb-8 text-center flex flex-col items-center">
      {/* Check animation */}
      <div className="relative">
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-25"
          style={{ background: CORAL }}
        />
        <div
          className="relative size-20 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: CORAL }}
        >
          <Check className="size-10 text-white" strokeWidth={3} />
        </div>
      </div>

      <h2 className="mt-6 text-2xl font-bold">Order Confirmed!</h2>
      <p className="mt-2 text-sm text-slate-500 max-w-[280px]">
        The kitchen has received your order and will start preparing it right
        away.
      </p>

      <div className="mt-6 w-full rounded-2xl bg-white p-4 border border-[#f0ebe1] text-left space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Order number</span>
          <span className="font-bold text-base">#{order.orderNumber}</span>
        </div>
        {tableName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Table</span>
            <span className="font-semibold text-sm">{tableName}</span>
          </div>
        )}
        <Separator className="bg-[#eeeae3]" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Total</span>
          <span className="font-bold text-sm">
            {formatPrice(order.total, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Estimated prep time</span>
          <span className="font-semibold text-sm inline-flex items-center gap-1">
            <Clock className="size-3.5" style={{ color: CORAL }} />
            ~{estimatedPrep || 20} min
          </span>
        </div>
      </div>

      <div className="mt-4 w-full rounded-2xl bg-[#fff4f0] border border-[#ffe0d6] p-3 text-xs text-[#7a4a3a] flex items-start gap-2">
        <Clock className="size-3.5 mt-0.5 shrink-0" style={{ color: CORAL }} />
        <span>
          Your order status will be updated by the kitchen. Sit tight — your
          meal is on the way!
        </span>
      </div>

      <Button
        onClick={onClose}
        className="mt-6 w-full h-12 text-white text-base font-semibold rounded-2xl"
        style={{ background: CORAL }}
      >
        Done
      </Button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  )
}

function SessionReviewCard({
  tenantId,
  tableId,
  sessionToken,
  sessionTenantId,
  sessionTableId,
  onViewBill,
}: {
  tenantId: string | null
  tableId: string | null
  sessionToken: string | null
  sessionTenantId: string | null
  sessionTableId: string | null
  onViewBill?: () => void
}) {
  const [rating, setRating] = useState<number>(5)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [name, setName] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const RATING_LABELS: Record<number, string> = {
    1: 'Disappointed 🙁',
    2: 'Could be better 😐',
    3: 'Good experience 👍',
    4: 'Very good! Loved it 😊',
    5: 'Outstanding! Excellent ⭐',
  }

  const QUICK_TAGS = [
    'Delicious Food 🍕',
    'Quick Service ⚡',
    'Great Ambience ✨',
    'Friendly Staff 👏',
    'Value for Money 💰',
    'Clean & Safe 🌿',
  ]

  const activeRating = hoverRating ?? rating

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await edgeFetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId || sessionTenantId,
          tableId: tableId || sessionTableId,
          rating,
          authorName: name.trim() || 'Guest',
          comment: comment.trim(),
          tags: selectedTags,
        }),
      })
      if (!res.ok) throw new Error('Failed to submit review')
      setSubmitted(true)
      toast.success('Thank you for rating and reviewing your experience!')
    } catch {
      toast.error('Could not submit review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleViewBill = async () => {
    if (onViewBill) {
      onViewBill()
      return
    }
    try {
      const q = new URLSearchParams()
      if (sessionToken) q.set('sessionToken', sessionToken)
      if (sessionTableId || tableId) q.set('tableId', sessionTableId || tableId || '')
      if (sessionTenantId || tenantId) q.set('tenantId', sessionTenantId || tenantId || '')
      if (typeof window !== 'undefined') {
        const qr = new URLSearchParams(window.location.search).get('table')
        if (qr) q.set('qrToken', qr)
      }
      const res = await edgeFetch(`/api/table-session/bill?${q.toString()}`)
      const d = await res.json()
      if (d.ok && d.orderId) {
        window.open('/api/bill/' + d.orderId, '_blank')
      } else {
        toast.info('No bill found for this session')
      }
    } catch {
      toast.error('Could not load bill')
    }
  }

  if (submitted) {
    return (
      <div className="mt-5 w-full rounded-2xl bg-amber-50/70 border border-amber-200/70 p-5 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="size-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600 mb-2 shadow-xs">
          <Check className="size-6" />
        </div>
        <h3 className="font-bold text-base text-[#1a1d29]">Review Submitted!</h3>
        <div className="flex items-center justify-center gap-1 my-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                'size-5 transition-all',
                star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
              )}
            />
          ))}
        </div>
        <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
          Thank you for sharing your feedback! We truly appreciate you dining with us and hope to welcome you back soon.
        </p>
        <div className="mt-4 pt-3 border-t border-amber-200/50">
          <button
            type="button"
            onClick={handleViewBill}
            className="text-xs font-semibold text-slate-500 hover:text-[#1a1d29] underline transition-colors cursor-pointer"
          >
            View Bill
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 w-full text-left bg-slate-50/90 rounded-2xl p-4 border border-slate-200/80 shadow-xs"
    >
      <div className="text-center mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Rate your experience
        </p>
        {/* Star rating buttons */}
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(null)}
              onClick={() => setRating(star)}
              className="p-1 rounded-lg hover:scale-125 active:scale-95 transition-all focus:outline-hidden cursor-pointer"
              aria-label={`${star} star`}
            >
              <Star
                className={cn(
                  'size-7 transition-colors drop-shadow-xs',
                  star <= activeRating
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300 hover:text-amber-200'
                )}
              />
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-amber-600 h-4 mt-1 transition-all">
          {RATING_LABELS[activeRating] || ''}
        </p>
      </div>

      {/* Quick feedback tags */}
      <div className="mb-3">
        <p className="text-[11px] text-slate-500 font-medium mb-1.5">What did you like most?</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all cursor-pointer',
                  isSelected
                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs scale-102 font-semibold'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                )}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Comment text area */}
      <div className="space-y-2 mb-3">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your thoughts about the food or service..."
          rows={2}
          maxLength={500}
          className="w-full text-xs rounded-xl border border-slate-200 bg-white p-2.5 text-[#1a1d29] placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 resize-none"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={50}
          className="w-full text-xs rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[#1a1d29] placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#1a1d29] hover:bg-black text-white text-xs font-semibold py-2.5 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
      >
        {submitting ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Submitting review…
          </>
        ) : (
          <>
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            Submit Review
          </>
        )}
      </Button>

      {/* View Bill option */}
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={handleViewBill}
          className="text-xs text-slate-400 hover:text-[#1a1d29] underline transition-colors cursor-pointer"
        >
          View Bill
        </button>
      </div>
    </form>
  )
}

