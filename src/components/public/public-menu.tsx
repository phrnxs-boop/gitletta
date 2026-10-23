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
import {
  canonicalPortionName,
  normalizePortionKey,
  normalizePortions,
  type MenuPortion,
} from '@/lib/portions'
import {
  applyMenuTheme,
  cacheMenuTheme,
  cachedMenuTheme,
  normaliseMenuTheme,
  type MenuTheme,
} from '@/lib/menu-theme'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BillDialog } from '@/components/shared/bill-dialog'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
  portions?: { id?: string; name: string; price: number }[] | null
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
  portionId?: string | null
  portion?: string | null
  price: number
  image?: string | null
  quantity: number
  notes?: string
  prepTime?: number
}

const sameCartLine = (
  c: CartItem,
  menuItemId: string,
  portion?: string | null,
  portionId?: string | null,
) =>
  c.menuItemId === menuItemId &&
  normalizePortionKey(c.portion, c.portionId) === normalizePortionKey(portion, portionId)

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

/**
 * The footer's social buttons.
 *
 * Flat dark circles read as generic marks sitting next to a real logo, so each
 * one wears its own brand colour — Instagram keeps its gradient — with a soft
 * shadow and a lift on hover. 44px square, which is the comfortable minimum for
 * a thumb on a phone, since this is a menu people open on a phone at a table.
 */
const SOCIAL_BTN =
  'grid size-11 place-items-center rounded-full text-white ring-1 ring-black/5 ' +
  'shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-all duration-200 ' +
  'hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.22)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2'

const INSTAGRAM_BG = 'bg-[linear-gradient(45deg,#f09433_0%,#e6683c_25%,#dc2743_50%,#cc2366_75%,#bc1888_100%)]'
const FACEBOOK_BG = 'bg-[#1877F2]'
const YOUTUBE_BG = 'bg-[#FF0000]'

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
      return { label: 'Spicy', icon: <Flame className="size-2.5" />, cls: `${base} bg-red-500/15 text-red-500` }
    case 'veg':
      return { label: 'Veg', icon: <Leaf className="size-2.5" />, cls: `${base} bg-emerald-500/15 text-emerald-400` }
    case 'vegan':
      return { label: 'Vegan', icon: <Leaf className="size-2.5" />, cls: `${base} bg-green-500/15 text-green-400` }
    case 'new':
      return { label: 'New', icon: <Sparkles className="size-2.5" />, cls: `${base} bg-amber-500/15 text-amber-400` }
    case 'bestseller':
      return { label: 'Bestseller', icon: <Star className="size-2.5 fill-current" />, cls: `${base} bg-orange-500/15 text-orange-400` }
    case 'non-veg':
      return { label: 'Non-Veg', cls: `${base} bg-rose-50 text-rose-600` }
    case 'jain':
      return { label: 'Jain', icon: <Sparkles className="size-2.5" />, cls: `${base} bg-amber-500/15 text-amber-400` }
    case 'gluten-free':
      return { label: 'GF', cls: `${base} bg-purple-50 text-purple-600` }
    default:
      return { label: tag.toUpperCase(), cls: `${base} bg-slate-100 text-foreground` }
  }
}

// ---------- Main Component ----------
// ----- Diner session durability -----
//
// The guarantee this enforces: once a table session ends, reloading the page,
// refreshing the tab, or walking browser history must NOT bring the menu back.
// Only scanning the physical QR code opens it again.
//
// How: `?table=<qrToken>` is treated as a one-time scan event. It is consumed
// and stripped from the address bar immediately, so nothing that re-runs a URL
// can re-activate a session. From then on the session token in sessionStorage
// is the only key, and it is re-validated by the server on every load.

const DINER_SESSION_KEY = 'swixo-diner-session'

type CachedDinerSession = { token: string; tenantId: string; tableId: string }

function stripScanParam() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('table')
    // Keep the view param: without it the router falls through to the landing
    // page on the next navigation.
    url.searchParams.set('view', 'public-menu')
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`)
  } catch {
    /* history is unavailable — the in-memory state still governs */
  }
}

function readCachedSession(): CachedDinerSession | null {
  try {
    const raw = sessionStorage.getItem(DINER_SESSION_KEY)
    return raw ? (JSON.parse(raw) as CachedDinerSession) : null
  } catch {
    return null
  }
}

function writeCachedSession(session: CachedDinerSession) {
  try {
    sessionStorage.setItem(DINER_SESSION_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

function clearCachedSession() {
  try {
    sessionStorage.removeItem(DINER_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

// A scan token survives a remount (React StrictMode double-invokes effects in
// development, and anything can remount the tree). Without this the stripping
// below would run on the first pass and the second pass would see no scan token
// at all — locking the diner out of a session that had just been created.
let pendingScanToken: string | null = null
let mintInFlight: Promise<CachedDinerSession> | null = null

/**
 * Exchange a scanned QR token for a session. Concurrent callers share one
 * request, so a remount can never mint two sessions for a single scan.
 *
 * Throws with the server's own message when the scan is refused — "Invalid QR
 * code", "This restaurant is currently unavailable" — because those are the
 * only things the diner can act on. Swallowing them into a null return is what
 * left the diner staring at a wall with no idea why.
 */
function mintDinerSession(qrToken: string): Promise<CachedDinerSession> {
  if (!mintInFlight) {
    mintInFlight = (async () => {
      try {
        const res = await edgeFetch('/api/table-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ qrToken }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => null)
          throw new Error(
            payload?.error || 'Could not start your table session. Please scan again.',
          )
        }
        const data = await res.json()
        const session: CachedDinerSession = {
          token: data.sessionToken,
          tenantId: data.tenant.id,
          tableId: data.table.id,
        }
        writeCachedSession(session)
        // Consumed: a later load must be authorised by the session alone.
        pendingScanToken = null
        return session
      } catch (e) {
        // A refused scan is spent. Leaving the token behind would make the
        // next mount retry the same bad token forever, and the diner could
        // never recover without a full page reload.
        pendingScanToken = null
        throw e
      } finally {
        mintInFlight = null
      }
    })()
  }
  return mintInFlight
}

/** End the diner session for this tab, permanently. Never re-activates. */
function lockDinerSession(setState: (v: 'ended') => void) {
  clearCachedSession()
  pendingScanToken = null
  setState('ended')
}

export function PublicMenu() {
  const searchParams = useSearchParams()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  // The menu's theme is the restaurant's, not the diner's. It is null until
  // the server has said, and until then the theme this diner was last shown
  // stands in for it.
  const [serverTheme, setServerTheme] = useState<MenuTheme | null>(null)
  const [cachedTheme, setCachedTheme] = useState<MenuTheme | null>(null)
  const menuTheme = serverTheme ?? cachedTheme ?? 'light'
  const [table, setTable] = useState<TableObj>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [social, setSocial] = useState<{ instagram?: string; facebook?: string; youtube?: string }>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // session state: 'activating' | 'active' | 'ended' | 'invalid'
  const [sessionState, setSessionState] = useState<'activating' | 'active' | 'ended' | 'invalid'>('activating')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  // Does this session have anything on it? A table can be abandoned and its
  // session ended from the POS without a single order ever being placed, and
  // there is no bill to show for that. The server answers this on the same
  // call that discovers the session is over; null means "not known yet".
  const [sessionHasOrder, setSessionHasOrder] = useState<boolean | null>(null)
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

  // Bumping this re-runs the session check. Used when the browser restores the
  // page from the back/forward cache: that restores the rendered menu DOM
  // without re-running effects, so an ended session could otherwise reappear.
  const [revalidateNonce, setRevalidateNonce] = useState(0)
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setRevalidateNonce((n) => n + 1)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const pillsRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // ----- Session-gated menu access -----
  useEffect(() => {
    let cancelled = false

    /**
     * Check the session with the server.
     *
     * The body is read even when the check fails, because a failed check is
     * exactly when the diner needs to know whether there is a bill waiting:
     * the server says so in the same response.
     */
    async function validateSession(session: CachedDinerSession) {
      const res = await edgeFetch(
        `/api/table-session/validate?tenantId=${encodeURIComponent(session.tenantId)}` +
          `&tableId=${encodeURIComponent(session.tableId)}` +
          `&sessionToken=${encodeURIComponent(session.token)}`,
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) return { ok: false as const, data }
      return { ok: true as const, data }
    }

    function adopt(session: CachedDinerSession, data: any) {
      setSessionToken(session.token)
      setSessionTenantId(session.tenantId)
      setSessionTableId(session.tableId)
      setTenant(data.tenant)
      setTable(data.table)
      setCategories(data.categories || [])
      setMenuItems(data.menuItems || [])
      setSocial(data.social || {})
      setServerTheme(normaliseMenuTheme(data.theme))
    }

    async function activateAndLoad() {
      try {
        setLoading(true)
        setError(null)
        setSessionState('activating')

        // A `table=` param means a scan just happened. Remember it at module
        // scope so a remount still sees it, and strip it from the address bar
        // before anything else so a refresh can never replay it.
        const urlScanToken = new URLSearchParams(window.location.search).get('table')
        if (urlScanToken) {
          pendingScanToken = urlScanToken
          stripScanParam()
        }
        const qrToken = pendingScanToken
        const scanned = Boolean(qrToken)

        if (!scanned) {
          // Not a scan. The only way in is a session this tab already holds.
          const cached = readCachedSession()
          if (!cached) {
            if (!cancelled) {
              setSessionState('invalid')
              setLoading(false)
            }
            return
          }

          const check = await validateSession(cached)
          if (cancelled) return
          if (!check.ok) {
            // The server says whether there is an order behind this session.
            setSessionHasOrder(Boolean(check.data?.hasOrder))
            lockDinerSession(setSessionState)
            setLoading(false)
            return
          }

          adopt(cached, check.data)
          setSessionState('active')
          setLoading(false)
          return
        }

        // A scan always opens a brand new session for that table.
        let session: CachedDinerSession
        try {
          session = await mintDinerSession(qrToken as string)
        } catch (e: any) {
          if (cancelled) return
          // The server's reason — "Invalid QR code", "This restaurant is
          // currently unavailable" — is what the diner can act on.
          setError(e?.message || 'Could not start your table session. Please scan again.')
          setSessionState('invalid')
          setLoading(false)
          return
        }
        if (cancelled) return

        const check = await validateSession(session)
        if (cancelled) return
        if (!check.ok) {
          setSessionHasOrder(Boolean(check.data?.hasOrder))
          lockDinerSession(setSessionState)
          setLoading(false)
          return
        }

        adopt(session, check.data)
        setSessionState('active')
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
  }, [revalidateNonce])

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
  function addToCart(item: MenuItem, portion?: { id?: string; name: string; price: number } | null) {
    const linePortion = portion?.name ? canonicalPortionName(portion.name) : null
    const linePortionId =
      portion?.id || (linePortion ? normalizePortionKey(linePortion) : null)
    const linePrice = portion ? portion.price : item.price
    setCart((prev) => {
      const existing = prev.find((c) =>
        sameCartLine(c, item.id, linePortion, linePortionId),
      )
      if (existing) {
        return prev.map((c) =>
          sameCartLine(c, item.id, linePortion, linePortionId)
            ? {
                ...c,
                portion: linePortion,
                portionId: linePortionId,
                price: linePrice,
                quantity: c.quantity + 1,
              }
            : c,
        )
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          portionId: linePortionId,
          portion: linePortion,
          price: linePrice,
          image: item.image,
          quantity: 1,
          prepTime: item.prepTime,
        },
      ]
    })
    toast.success(`${item.name}${linePortion ? ` (${linePortion})` : ''} added`, {
      duration: 1500,
    })
  }

  function decrement(item: MenuItem, portion?: string | null, portionId?: string | null) {
    setCart((prev) => {
      const existing = prev.find((c) =>
        sameCartLine(c, item.id, portion, portionId),
      )
      if (!existing) return prev
      if (existing.quantity <= 1) {
        return prev.filter((c) => !sameCartLine(c, item.id, portion, portionId))
      }
      return prev.map((c) =>
        sameCartLine(c, item.id, portion, portionId)
          ? { ...c, quantity: c.quantity - 1 }
          : c,
      )
    })
  }

  function setItemNotes(menuItemId: string, notes: string, portion?: string | null, portionId?: string | null) {
    setCart((prev) =>
      prev.map((c) =>
        sameCartLine(c, menuItemId, portion, portionId) ? { ...c, notes } : c
      )
    )
  }

  function removeFromCart(menuItemId: string, portion?: string | null, portionId?: string | null) {
    setCart((prev) =>
      prev.filter((c) => !sameCartLine(c, menuItemId, portion, portionId))
    )
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
          lockDinerSession(setSessionState)
          setCartOpen(false)
        } else if (
          msg.type === 'ORDER_UPDATED' &&
          msg.order?.status === 'COMPLETED' &&
          (!msg.order?.tableId || !targetTableId || msg.order.tableId === targetTableId)
        ) {
          lockDinerSession(setSessionState)
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
        if (!res.ok) {
          // This is how a session ended from the POS reaches the diner. The
          // response says whether the table had an order on it, so the ended
          // screen knows whether there is a bill to offer.
          const failed = await res.json().catch(() => null)
          setSessionHasOrder(Boolean(failed?.hasOrder))
          lockDinerSession(setSessionState)
          setCartOpen(false)
          return
        }
        const data = await res.json()
        if (data.sessionStatus !== 'ACTIVE') {
          lockDinerSession(setSessionState)
          setCartOpen(false)
        }
      } catch {}
    }, 1500)

    return () => {
      if (bc) bc.close()
      clearInterval(interval)
    }
  }, [sessionState, sessionToken, sessionTenantId, sessionTableId, tenant?.id, table?.id])


  // ----- Release the session when the menu goes and away -----
  //
  // Closing a tab sends no request of its own, so without this the table stayed
  // on the POS board until the idle window elapsed. sendBeacon is the one
  // request the browser still delivers during unload; a text/plain body keeps it
  // a "simple" request, because sendBeacon cannot answer a CORS preflight.
  //
  // pagehide rather than visibilitychange: switching apps or locking the phone
  // should not end a diner's session, but leaving the page should.
  useEffect(() => {
    if (!sessionToken) return
    const release = () => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!base || !navigator.sendBeacon) return
      navigator.sendBeacon(
        `${base}/functions/v1/table-session/release`,
        new Blob([JSON.stringify({ sessionToken })], { type: 'text/plain' }),
      )
    }
    window.addEventListener('pagehide', release)
    return () => window.removeEventListener('pagehide', release)
  }, [sessionToken])

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
      lockDinerSession(setSessionState)
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
            portionId: c.portionId || undefined,
            portion: c.portion || undefined,
            quantity: c.quantity,
            notes: c.notes || '',
          })),
        }),
      })
      if (res.status === 401 || res.status === 403) {
        // session ended/invalid → lock the menu
        const err = await res.json().catch(() => ({}))
        lockDinerSession(setSessionState)
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

  // ---------- The theme ----------
  //
  // It is applied to the document, not only to the menu, because the cart
  // sheet and the item sheet are rendered in a portal on the document body.
  // The theme the diner was last shown is put on straight away, so the menu
  // does not load in the wrong palette.
  //
  // These sit above every early return, because a hook that is only reached
  // on some renders is a hook that is called in a different order some of
  // the time.
  // The theme in force is applied to the document, so the sheets Radix
  // renders in a portal are in the same palette as the menu.
  useEffect(() => {
    applyMenuTheme(menuTheme)
  }, [menuTheme])

  // The theme this diner was last shown, read once the restaurant is known.
  // It stands in until the server answers, and it never overrules it.
  useEffect(() => {
    setCachedTheme(cachedMenuTheme(sessionTenantId))
  }, [sessionTenantId])

  useEffect(() => {
    if (!tenant || !serverTheme) return
    cacheMenuTheme(tenant.id, serverTheme)
  }, [tenant, serverTheme])

  // ---------- Loading state ----------
  // ---------- Session ended / invalid → LOCKED screen ----------
  if (sessionState === 'ended' || sessionState === 'invalid') {
    const ended = sessionState === 'ended'
    return (
      <div className={`${menuTheme} min-h-screen bg-background text-foreground flex items-center justify-center p-4 sm:p-6`}>
        <div className="max-w-[440px] w-full text-center rounded-3xl bg-card p-6 sm:p-8 shadow-sm border border-border">
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
            <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-muted border border-border/90 shadow-2xs">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-xs font-bold text-foreground tracking-tight">Google Reviews</span>
              <div className="flex items-center text-amber-500 text-xs">
                <span>★</span>
                <span className="text-[11px] font-bold ml-0.5 text-foreground">5.0</span>
              </div>
            </div>
          )}

          <h2 className={cn("text-xl font-bold tracking-tight", ended ? "mt-2" : "mt-4")}>
            {ended ? 'Your table session has ended.' : 'Menu access requires a table session.'}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {ended
              ? 'Please scan the QR code on your table to continue viewing the menu and placing orders.'
              : 'This menu is only accessible by scanning the QR code on your restaurant table.'}
          </p>

          {/* When a scan was refused, say why. The server's reason is the only
              thing the diner can act on — an invalid code, a restaurant that
              is closed, a table that has been taken out of service. */}
          {!ended && error && (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[13px] font-medium leading-snug text-red-700">
              {error}
            </p>
          )}

          {/* The review card carries the "View Bill" link, so it only appears
              when the session actually has an order on it. A table can be
              abandoned and its session ended from the POS without anything
              ever being ordered, and there is nothing to bill and nothing to
              rate in that case. Until the server has answered, neither is
              shown — a bill button that turns out to be empty is worse than
              no bill button. */}
          {ended && sessionHasOrder === true && (
            <SessionReviewCard
              tenantId={tenant?.id || sessionTenantId}
              tableId={table?.id || sessionTableId}
              sessionToken={sessionToken}
              sessionTenantId={sessionTenantId}
              sessionTableId={sessionTableId}
              onViewBill={handleOpenBill}
            />
          )}

          {ended && sessionHasOrder === false && (
            <p className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground border border-border">
              No orders were placed on this table, so there is no bill.
            </p>
          )}

          <div className="mt-5 rounded-xl bg-muted p-3 text-[11px] text-muted-foreground leading-relaxed border border-border">
            For security, menu access cannot be restored by refreshing the page, using browser history, or copying the URL. Only scanning the table QR code activates a new session.
          </div>
        </div>

        {/* In-app bill modal */}
        <BillDialog
          orderId={billOrderId}
          open={billOpen}
          onOpenChange={setBillOpen}
          sessionToken={sessionToken}
        />
      </div>
    )
  }

  // ---------- Activating session → loading skeleton ----------
  if (loading || sessionState === 'activating') {
    return (
      <div className={`${menuTheme} min-h-screen bg-background text-foreground`}>
        <div className="max-w-md mx-auto px-4 pt-6">
          <Skeleton className="h-16 w-16 rounded-2xl bg-muted" />
          <Skeleton className="mt-4 h-7 w-3/4 bg-muted" />
          <Skeleton className="mt-2 h-4 w-1/2 bg-muted" />
          <Skeleton className="mt-4 h-12 w-full rounded-2xl bg-muted" />
          <div className="mt-4 flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-full bg-muted" />
            ))}
          </div>
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex gap-4 rounded-2xl bg-card p-3 shadow-sm"
              >
                <Skeleton className="size-20 rounded-xl bg-muted" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-2/3 bg-muted" />
                  <Skeleton className="h-3 w-full bg-muted" />
                  <Skeleton className="h-3 w-1/3 bg-muted" />
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
      <div className={`${menuTheme} min-h-screen bg-background text-foreground flex items-center justify-center p-6`}>
        <div className="max-w-sm w-full text-center rounded-3xl bg-card p-8 shadow-sm">
          <div className="mx-auto size-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <X className="size-7 text-red-500" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Menu unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
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
      className={`${menuTheme} min-h-screen bg-background text-foreground`}
      style={{ paddingBottom: cart.length ? 96 : 0 }}
    >
      <div className="max-w-md mx-auto relative">
        {/* ===== Sticky header ===== */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
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
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {tenant.tagline}
                    </p>
                  )}
                </div>
              </div>

              {tenant.phone && (
                <a
                  href={`tel:${tenant.phone}`}
                  className="shrink-0 size-10 rounded-full bg-card shadow-sm border border-border flex items-center justify-center text-foreground hover:bg-card-elevated transition"
                  aria-label="Call restaurant"
                >
                  <Phone className="size-4" />
                </a>
              )}
            </div>

            {/* Table card */}
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow-sm border border-border">
              {table ? (
                <>
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span className="text-foreground">
                    🍽️ {table.name} · {table.area} · {table.seats} seats
                  </span>
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span className="text-foreground">Takeaway order</span>
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes…"
                className="pl-9 pr-9 h-11 rounded-full bg-card border-border focus-visible:ring-primary/30 focus-visible:border-primary"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
              <div className="mx-auto size-14 rounded-2xl bg-card shadow-sm flex items-center justify-center">
                <Search className="size-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                No dishes found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
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
                  className="mt-3 text-primary hover:text-primary hover:bg-primary/10"
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
                      const itemLines = cart.filter((c) => c.menuItemId === item.id)
                      const totalQty = itemLines.reduce((s, c) => s + c.quantity, 0)
                      return (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          currency={currency}
                          inCartQty={totalQty}
                          itemLines={itemLines}
                          onAdd={() => addToCart(item)}
                          onDecrement={() => decrement(item)}
                          onAddPortion={(portion) => addToCart(item, portion)}
                          onDecrementPortion={(portion) => decrement(item, portion.name, portion.id)}
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
            <Separator className="my-6 bg-muted" />
            {tenant.address && (
              <div className="flex items-start justify-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5 mt-0.5 shrink-0" />
                <span className="max-w-[260px]">{tenant.address}</span>
              </div>
            )}
            {tenant.phone && (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="size-3.5" />
                <span>{tenant.phone}</span>
              </div>
            )}
            {/* Social media icons */}
            {(social.instagram || social.facebook || social.youtube) && (
              <div className="mt-5 flex flex-col items-center gap-2.5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Follow us</p>
                <div className="flex items-center justify-center gap-3">
                {social.instagram && (
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer" className={cn(SOCIAL_BTN, INSTAGRAM_BG)} aria-label="Instagram">
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </a>
                )}
                {social.facebook && (
                  <a href={social.facebook} target="_blank" rel="noopener noreferrer" className={cn(SOCIAL_BTN, FACEBOOK_BG)} aria-label="Facebook">
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                )}
                {social.youtube && (
                  <a href={social.youtube} target="_blank" rel="noopener noreferrer" className={cn(SOCIAL_BTN, YOUTUBE_BG)} aria-label="YouTube">
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </a>
                )}
                </div>
              </div>
            )}
            <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
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
                className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-background"
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
                  <span className="size-7 rounded-full bg-card/20 flex items-center justify-center text-xs font-bold">
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
            className={`${menuTheme} max-w-md mx-auto rounded-t-3xl p-0 border-0 bg-background max-h-[92vh] flex flex-col`}
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
                <SheetHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="text-lg font-bold flex items-center gap-2">
                      <ShoppingBag className="size-5" style={{ color: CORAL }} />
                      Your Order
                    </SheetTitle>
                    <button
                      onClick={closeSheet}
                      className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted transition"
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

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="px-5 py-4 space-y-4">
                    {cart.map((c) => (
                      <CartLine
                        key={`${c.menuItemId}::${c.portionId || c.portion || ''}`}
                        item={c}
                        currency={currency}
                        onAdd={() => {
                          const mi = menuItems.find((m) => m.id === c.menuItemId)
                          if (mi) {
                            addToCart(
                              mi,
                              c.portion ? { id: c.portionId ?? undefined, name: c.portion, price: c.price } : null,
                            )
                          }
                        }}
                        onDecrement={() => {
                          const mi = menuItems.find((m) => m.id === c.menuItemId)
                          if (mi) decrement(mi, c.portion, c.portionId)
                        }}
                        onRemove={() => removeFromCart(c.menuItemId, c.portion, c.portionId)}
                        onNotesChange={(n) => setItemNotes(c.menuItemId, n, c.portion, c.portionId)}
                      />
                    ))}

                    {/* Suggested note */}
                    <div className="rounded-2xl bg-[#fff4f0] border border-[#ffe0d6] p-3 text-xs text-foreground flex items-start gap-2">
                      <Sparkles className="size-3.5 mt-0.5 shrink-0" style={{ color: CORAL }} />
                      <span>
                        Add notes for the kitchen — allergies, spice level, or
                        special requests.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Totals + place order */}
                <div className="shrink-0 border-t border-border bg-card px-5 pt-4 pb-5 space-y-3 rounded-b-3xl">
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
                    <Separator className="my-2 bg-muted" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-lg">
                        {formatPrice(grandTotal, currency)}
                      </span>
                    </div>
                    {estimatedPrep > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
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
          sessionToken={sessionToken}
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
          : 'bg-card text-foreground border border-border hover:bg-card-elevated'
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
  itemLines = [],
  onAdd,
  onDecrement,
  onAddPortion,
  onDecrementPortion,
}: {
  item: MenuItem
  currency: string
  inCartQty: number
  itemLines?: CartItem[]
  onAdd: () => void
  onDecrement: () => void
  onAddPortion?: (portion: MenuPortion) => void
  onDecrementPortion?: (portion: MenuPortion) => void
}) {
  const tags = parseTags(item.tags)
  const portions = useMemo(() => normalizePortions(item.portions), [item.portions])
  const [selectedPortionId, setSelectedPortionId] = useState<string>(() => portions[0]?.id ?? '')
  const activePortion =
    portions.find((p) => p.id === selectedPortionId) ?? portions[0] ?? null
  const activeLine = activePortion
    ? itemLines.find((c) => sameCartLine(c, item.id, activePortion.name, activePortion.id))
    : undefined
  const activeQty = activePortion ? (activeLine?.quantity ?? 0) : inCartQty
  const displayPrice = activePortion ? activePortion.price : item.price
  return (
    <article className="flex gap-3 rounded-2xl bg-card p-3 shadow-sm border border-border hover:shadow-md transition-shadow">
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
          <div className="size-20 rounded-xl bg-card-elevated flex items-center justify-center">
            <Utensils className="size-6 text-muted-foreground" />
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
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-foreground">
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

        {/* Portion selector pills — customer picks portion before adding */}
        {portions.length > 0 && activePortion && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Select portion for ${item.name}`}>
            {portions.map((p) => {
              const selected = p.id === activePortion.id
              const pQty =
                itemLines.find((c) => sameCartLine(c, item.id, p.name, p.id))?.quantity ?? 0
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPortionId(p.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all',
                    selected
                      ? 'text-white shadow-xs'
                      : 'border-border bg-card-elevated text-foreground hover:border-primary/40',
                  )}
                  style={selected ? { background: CORAL, borderColor: CORAL } : undefined}
                >
                  <span>{p.name}</span>
                  {pQty > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[10px] font-bold',
                        selected ? 'bg-white/25 text-white' : 'bg-primary/15 text-primary',
                      )}
                    >
                      ×{pQty}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Price + action */}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className="font-bold text-base" style={{ color: INK }}>
            {formatPrice(displayPrice, currency)}
          </span>
          {activeQty === 0 ? (
            <button
              onClick={() => {
                if (activePortion) {
                  onAddPortion?.(activePortion)
                } else {
                  onAdd()
                }
              }}
              className="size-8 rounded-full text-white shadow-sm flex items-center justify-center transition-transform active:scale-90"
              style={{ background: CORAL }}
              aria-label={
                activePortion
                  ? `Add ${item.name} (${activePortion.name}) to cart`
                  : `Add ${item.name} to cart`
              }
            >
              <Plus className="size-4" />
            </button>
          ) : (
            <div
              className="flex items-center gap-1 rounded-full p-1 text-white"
              style={{ background: CORAL }}
            >
              <button
                onClick={() => {
                  if (activePortion) {
                    onDecrementPortion?.(activePortion)
                  } else {
                    onDecrement()
                  }
                }}
                className="size-7 rounded-full bg-card/20 flex items-center justify-center transition active:scale-90"
                aria-label="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-5 text-center text-xs font-bold tabular-nums">
                {activeQty}
              </span>
              <button
                onClick={() => {
                  if (activePortion) {
                    onAddPortion?.(activePortion)
                  } else {
                    onAdd()
                  }
                }}
                className="size-7 rounded-full bg-card/20 flex items-center justify-center transition active:scale-90"
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
    <div className="rounded-2xl bg-card p-3 border border-border">
      <div className="flex gap-3">
        <div className="shrink-0">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="size-14 rounded-lg object-cover ring-1 ring-black/5"
            />
          ) : (
            <div className="size-14 rounded-lg bg-card-elevated flex items-center justify-center">
              <Utensils className="size-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-snug line-clamp-1">
              {item.name}
              {item.portion && (
                <span
                  className="ml-1.5 rounded-full border px-1.5 py-px text-[10px] font-semibold align-middle"
                  style={{ borderColor: '#ffe0d6', color: CORAL, background: '#fff4f0' }}
                >
                  {item.portion}
                </span>
              )}
            </h4>
            <button
              onClick={onRemove}
              className="shrink-0 text-muted-foreground hover:text-red-500 transition"
              aria-label="Remove item"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatPrice(item.price, currency)} each
          </p>

          <div className="mt-2 flex items-center justify-between">
            <div
              className="flex items-center gap-1 rounded-full p-0.5 text-white"
              style={{ background: CORAL }}
            >
              <button
                onClick={onDecrement}
                className="size-7 rounded-full bg-card/20 flex items-center justify-center transition active:scale-90"
                aria-label="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-6 text-center text-xs font-bold tabular-nums">
                {item.quantity}
              </span>
              <button
                onClick={onAdd}
                className="size-7 rounded-full bg-card/20 flex items-center justify-center transition active:scale-90"
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
        className="mt-3 min-h-9 text-xs rounded-lg bg-background border-border focus-visible:ring-primary/30 focus-visible:border-primary resize-none"
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
        className="absolute top-4 right-4 size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted transition"
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
      <p className="mt-1 text-sm text-muted-foreground">
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
      <p className="mt-2 text-sm text-muted-foreground max-w-[280px]">
        The kitchen has received your order and will start preparing it right
        away.
      </p>

      <div className="mt-6 w-full rounded-2xl bg-card p-4 border border-border text-left space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Order number</span>
          <span className="font-bold text-base">#{order.orderNumber}</span>
        </div>
        {tableName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Table</span>
            <span className="font-semibold text-sm">{tableName}</span>
          </div>
        )}
        <Separator className="bg-muted" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="font-bold text-sm">
            {formatPrice(order.total, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Estimated prep time</span>
          <span className="font-semibold text-sm inline-flex items-center gap-1">
            <Clock className="size-3.5" style={{ color: CORAL }} />
            ~{estimatedPrep || 20} min
          </span>
        </div>
      </div>

      <div className="mt-4 w-full rounded-2xl bg-[#fff4f0] border border-[#ffe0d6] p-3 text-xs text-foreground flex items-start gap-2">
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
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
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

  const handleViewBill = () => {
    // The parent always supplies onViewBill, which opens the in-app BillDialog
    // with the session token attached. The old fallback used window.open on
    // /api/bill/<id>, which could not carry auth and opened raw JSON in a tab.
    if (onViewBill) {
      onViewBill()
      return
    }
    toast.info('Open the bill from the session screen')
  }


  if (submitted) {
    return (
      <div className="mt-5 w-full rounded-2xl bg-amber-50/70 border border-amber-500/25/70 p-5 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="size-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600 mb-2 shadow-xs">
          <Check className="size-6" />
        </div>
        <h3 className="font-bold text-base text-foreground">Review Submitted!</h3>
        <div className="flex items-center justify-center gap-1 my-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                'size-5 transition-all',
                star <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
              )}
            />
          ))}
        </div>
        <p className="text-xs text-foreground leading-relaxed max-w-xs mx-auto">
          Thank you for sharing your feedback! We truly appreciate you dining with us and hope to welcome you back soon.
        </p>
        <div className="mt-4 pt-3 border-t border-amber-500/25/50">
          <button
            type="button"
            onClick={handleViewBill}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
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
      className="mt-5 w-full text-left bg-muted/90 rounded-2xl p-4 border border-border/80 shadow-xs"
    >
      <div className="text-center mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                    : 'text-muted-foreground hover:text-amber-200'
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
        <p className="text-[11px] text-muted-foreground font-medium mb-1.5">What did you like most?</p>
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
                    : 'bg-card text-foreground border-border hover:border-slate-300'
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
          className="w-full text-xs rounded-xl border border-border bg-card p-2.5 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 resize-none"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={50}
          className="w-full text-xs rounded-xl border border-border bg-card px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
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
          className="text-xs text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
        >
          View Bill
        </button>
      </div>
    </form>
  )
}

