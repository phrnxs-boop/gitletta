'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '@/components/app/data-context'
import { useT } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { edgeFetch } from '@/lib/edge'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StatusBadge, OrderTypeBadge, Tag } from '@/components/shared/badges'
import { Search, Plus, Minus, Trash2, ShoppingBag, X, Check, CreditCard, Ticket, Clock, LogOut } from 'lucide-react'
import { toast } from 'sonner'

export function DashboardView() {
  const tr = useT()
  const { data, refresh, sessionRevision } = useApp()
  const { cart, addToCart, updateCartQty, removeFromCart, setCartNotes, clearCart, orderType, setOrderType, selectedTableId, setSelectedTableId, promoCode, setPromoCode } = useStore()
  const [activeCat, setActiveCat] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastOrder, setLastOrder] = useState<any>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [appliedPromo, setAppliedPromo] = useState<any | null>(null)
  const [promoError, setPromoError] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  // scroll-collapse effect: when the menu is scrolled, the restaurant header
  // (name/tagline/stats) collapses to give the category pills + cards more room
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        // collapse when scrolled past 40px down; expand when back at top
        setCollapsed(el.scrollTop > 40)
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const menuItems = data?.menuItems ?? []
  const categories = data?.categories ?? []
  const tables = data?.tables ?? []
  const tenant = data?.tenant

  const filtered = useMemo(() => {
    return menuItems.filter((m) => {
      if (activeCat !== 'all' && m.categoryId !== activeCat) return false
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [menuItems, activeCat, search])

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const taxRate = tenant?.taxRate ?? 8
  const serviceRate = tenant?.serviceCharge ?? 0

  // discount from applied promo (mirrors API logic)
  let discount = 0
  if (appliedPromo && subtotal >= appliedPromo.minOrder) {
    if (appliedPromo.type === 'PERCENTAGE') {
      discount = (subtotal * appliedPromo.value) / 100
      if (appliedPromo.maxDiscount > 0) discount = Math.min(discount, appliedPromo.maxDiscount)
    } else {
      discount = appliedPromo.value
    }
    discount = Math.min(discount, subtotal) // never go negative
  }
  const taxableAmount = Math.max(0, subtotal - discount)
  const tax = +((taxableAmount) * taxRate / 100).toFixed(2)
  const service = +((subtotal) * serviceRate / 100).toFixed(2)
  const total = +(subtotal - discount + tax + service).toFixed(2)

  // validate promo code against tenant's promos
  const applyPromo = () => {
    setPromoError('')
    if (!promoCode.trim()) {
      setAppliedPromo(null)
      return
    }
    const found = (data?.promos ?? []).find(
      (p: any) => p.code.toUpperCase() === promoCode.trim().toUpperCase() && p.active
    )
    if (!found) {
      setAppliedPromo(null)
      setPromoError(tr('pos.promoInvalid'))
      toast.error(tr('pos.promoInvalid'))
      return
    }
    // check usage limit
    if (found.usageLimit > 0 && found.usedCount >= found.usageLimit) {
      setAppliedPromo(null)
      setPromoError('Promo usage limit reached')
      toast.error('Promo usage limit reached')
      return
    }
    // check expiry
    if (found.validTo && new Date(found.validTo) < new Date()) {
      setAppliedPromo(null)
      setPromoError(tr('pos.promoExpired'))
      toast.error(tr('pos.promoExpired'))
      return
    }
    if (subtotal < found.minOrder) {
      setAppliedPromo(null)
      setPromoError(`Minimum order ${tenant?.currencySymbol}${found.minOrder.toFixed(2)} required`)
      toast.error(`Minimum order of ${tenant?.currencySymbol}${found.minOrder.toFixed(2)} required`)
      return
    }
    setAppliedPromo(found)
    toast.success(`Promo "${found.code}" applied`, {
      description: found.type === 'PERCENTAGE'
        ? `${found.value}% off${found.maxDiscount > 0 ? ` (max ${tenant?.currencySymbol}${found.maxDiscount})` : ''}`
        : `${tenant?.currencySymbol}${found.value} off`,
    })
  }

  const removePromo = () => {
    setAppliedPromo(null)
    setPromoCode('')
    setPromoError('')
  }

  // ----- Open table sessions -------------------------------------------------
  // The POS is where staff actually work, so this is where a table's open
  // session belongs — including the ones that need closing by hand: a diner who
  // scanned and never ordered, or whose order never got marked complete.
  // (Sessions also expire on their own after 6 hours; see migration 0008.)
  const [sessions, setSessions] = useState<any[]>([])
  const [endingTable, setEndingTable] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    if (!tenant?.id) return
    try {
      const res = await edgeFetch('/api/table-session/active', { headers: { 'x-tenant-id': tenant?.id ?? '' } })
      if (!res.ok) return
      const json = await res.json()
      setSessions(Array.isArray(json) ? json : [])
    } catch {
      /* leave the previous list in place */
    }
  }, [tenant])

  useEffect(() => {
    loadSessions()
    // The poll is the safety net; sessionRevision is the live path, bumped the
    // moment a session ends so the card disappears without a reload.
    const t = setInterval(loadSessions, 30000)
    return () => clearInterval(t)
  }, [loadSessions, sessionRevision])

  const endSession = async (tableId: string, tableName?: string) => {
    setEndingTable(tableId)
    try {
      const res = await edgeFetch('/api/table-session/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': tenant?.id ?? '' },
        body: JSON.stringify({ tableId }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Session ended${tableName ? ` for ${tableName}` : ''}`, {
        description: 'The diner must scan the QR code again to order.',
      })
      await loadSessions()
    } catch {
      toast.error('Could not end the session')
    } finally {
      setEndingTable(null)
    }
  }

  /** How long a table has been open — the oldest session is the stale one. */
  const sessionAge = (group: any) => {
    const times = (group.sessions || []).map((s: any) => new Date(s.createdAt).getTime()).filter(Boolean)
    if (!times.length) return ''
    const mins = Math.max(0, Math.round((Date.now() - Math.min(...times)) / 60000))
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  // per-category counts for the pills
  const catCount = (catId: string) => catId === 'all' ? menuItems.length : menuItems.filter((m) => m.categoryId === catId).length

  if (!data || !tenant) return null

  const submitOrder = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    if (orderType === 'DINE_IN' && !selectedTableId) {
      toast.error('Please select a table')
      return
    }
    if (orderType !== 'DINE_IN' && !customerName.trim()) {
      toast.error('Please enter customer name')
      return
    }
    setSubmitting(true)
    try {
      const res = await edgeFetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': tenant.id },
        body: JSON.stringify({
          tableId: orderType === 'DINE_IN' ? selectedTableId : null,
          orderType,
          items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes })),
          promoCode: promoCode || undefined,
          customerName: orderType !== 'DINE_IN' ? customerName : undefined,
          customerPhone: orderType !== 'DINE_IN' ? customerPhone : undefined,
          servedById: data.currentUser.id,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const order = await res.json()
      setLastOrder(order)
      clearCart()
      setPromoCode('')
      setAppliedPromo(null)
      setPromoError('')
      setCustomerName('')
      setCustomerPhone('')
      toast.success(`Order #${order.orderNumber} placed!`)
      refresh()
      setCartOpen(false)
    } catch {
      toast.error('Failed to place order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Menu area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Restaurant header — collapses on scroll to give menu cards more room */}
        <div className={cn(
          'relative px-3.5 md:px-6 overflow-hidden transition-all duration-200 ease-out',
          collapsed ? 'pt-2 pb-2' : 'pt-5 md:pt-6 pb-4'
        )}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent pointer-events-none" />
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                OPEN
              </span>
              <div className="min-w-0">
                <h2 className={cn(
                  'font-bold tracking-tight truncate transition-all duration-300',
                  collapsed ? 'text-lg' : 'text-2xl md:text-3xl'
                )}>{tenant.name}</h2>
                <div className={cn('overflow-hidden transition-all duration-300', collapsed ? 'max-h-0 opacity-0' : 'max-h-6 opacity-100')}>
                  <p className="text-sm text-muted-foreground truncate">{tenant.tagline} · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
            </div>
            {/* Quick stats — hide when collapsed */}
            <div className={cn(
              'flex items-center gap-2 transition-all duration-300',
              collapsed ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
            )}>
              <div className="rounded-xl bg-secondary/40 border border-border px-3 py-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{tr('pos.today')}</p>
                <p className="text-sm font-bold">{tenant.currencySymbol}{(data?.summary.revenue ?? 0).toFixed(0)}</p>
              </div>
              <div className="rounded-xl bg-secondary/40 border border-border px-3 py-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{tr('pos.active')}</p>
                <p className="text-sm font-bold">{data?.summary.activeOrders ?? 0}</p>
              </div>
            </div>
          </div>
          {/* Search — shrinks when collapsed */}
          <div className={cn(
            'relative flex items-center gap-2 bg-secondary/50 border border-border rounded-xl px-3.5 transition-all duration-300 w-full focus-within:border-primary/40 focus-within:shadow-glow-primary',
            collapsed ? 'mt-0 py-1.5' : 'mt-4 py-2.5'
          )}>
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('pos.search')}
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground min-w-0"
            />
            {search && <button onClick={() => setSearch('')} className="shrink-0"><X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>}
          </div>
        </div>

        {/* Category pills — horizontal scrollable row */}
        <div className="px-3.5 md:px-6 pb-3">
          <div className="w-full overflow-x-auto scrollbar-thin -mx-1 px-1">
            <div className="flex gap-2 w-max pb-1">
              <CategoryPill active={activeCat === 'all'} onClick={() => setActiveCat('all')} icon="🍴" label={tr('pos.all')} count={menuItems.length} />
              {categories.map((c) => (
                <CategoryPill
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                  icon={c.icon || '🍴'}
                  label={c.name}
                  count={catCount(c.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Menu grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3.5 md:px-6 pb-4 md:pb-6 min-h-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pt-2">
            {filtered.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                currencySymbol={tenant.currencySymbol}
                inCart={cart.find((c) => c.menuItemId === item.id)?.quantity || 0}
                onAdd={() => addToCart({ menuItemId: item.id, name: item.name, price: item.price, image: item.image })}
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                <p className="text-sm">{tr('pos.noItems')}</p>
              </div>
            )}
          </div>

          {/* Open table sessions */}
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {tr('pos.sessions')}
              </h3>
              {sessions.length > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {sessions.length}
                </span>
              )}
            </div>

            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tr('pos.noSessions')}
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-2">
                {sessions.map((group) => {
                  const orderCount = (group.sessions || []).reduce(
                    (n: number, s: any) => n + (s._count?.orders ?? 0),
                    0,
                  )
                  const label = group.table?.name || 'Table'
                  return (
                    <div key={group.tableId} className="shrink-0 w-64 rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {group.table?.area}
                            {group.table?.seats ? ` · ${group.table.seats} seats` : ''}
                          </p>
                        </div>
                        {group.sessions.length > 1 && (
                          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                            {group.sessions.length} open
                          </span>
                        )}
                      </div>

                      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        <span>open {sessionAge(group)}</span>
                        <span className="opacity-40">·</span>
                        <span>{orderCount === 0 ? tr('pos.noOrderYet') : `${orderCount} order${orderCount === 1 ? '' : 's'}`}</span>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => endSession(group.tableId, label)}
                        disabled={endingTable === group.tableId}
                        className="h-8 w-full text-xs"
                      >
                        <LogOut className="mr-1.5 size-3.5" />
                        {endingTable === group.tableId ? 'Ending…' : tr('pos.endSession')}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart panel — desktop */}
      <div className="hidden lg:flex w-[380px] xl:w-[400px] shrink-0 border-l border-border bg-card flex-col">
        <CartPanel
          tables={tables}
          orderType={orderType}
          setOrderType={setOrderType}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          cart={cart}
          addToCart={addToCart}
          updateCartQty={updateCartQty}
          removeFromCart={removeFromCart}
          setCartNotes={setCartNotes}
          subtotal={subtotal}
          discount={discount}
          tax={tax}
          service={service}
          total={total}
          promoCode={promoCode}
          setPromoCode={setPromoCode}
          appliedPromo={appliedPromo}
          promoError={promoError}
          onApplyPromo={applyPromo}
          onRemovePromo={removePromo}
          onSubmit={submitOrder}
          submitting={submitting}
          currencySymbol={tenant.currencySymbol}
          taxRate={tenant.taxRate}
          serviceRate={tenant.serviceCharge}
        />
      </div>

      {/* Cart trigger — mobile */}
      {cart.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-hover text-white px-5 py-3 shadow-elevated ring-1 ring-white/20"
        >
          <ShoppingBag className="h-5 w-5" />
          <span className="text-sm font-semibold">{cart.length} items</span>
          <span className="text-sm font-bold">{tenant.currencySymbol}{total.toFixed(2)}</span>
        </button>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 bg-card overflow-hidden flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <SheetTitle>{tr('pos.cart')}</SheetTitle>
          </SheetHeader>
          <CartPanel
            embedded
            tables={tables}
            orderType={orderType}
            setOrderType={setOrderType}
            selectedTableId={selectedTableId}
            setSelectedTableId={setSelectedTableId}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            cart={cart}
            addToCart={addToCart}
            updateCartQty={updateCartQty}
            removeFromCart={removeFromCart}
            setCartNotes={setCartNotes}
            subtotal={subtotal}
            discount={discount}
            tax={tax}
            service={service}
            total={total}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            appliedPromo={appliedPromo}
            promoError={promoError}
            onApplyPromo={applyPromo}
            onRemovePromo={removePromo}
            onSubmit={submitOrder}
            submitting={submitting}
            currencySymbol={tenant.currencySymbol}
            taxRate={tenant.taxRate}
            serviceRate={tenant.serviceCharge}
          />
        </SheetContent>
      </Sheet>

      {/* Success modal */}
      {lastOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLastOrder(null)}>
          <div className="bg-card rounded-3xl p-8 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-1">Order Placed!</h3>
            <p className="text-sm text-muted-foreground mb-1">Order #{lastOrder.orderNumber}</p>
            <p className="text-2xl font-bold mb-4">{tenant.currencySymbol}{lastOrder.total.toFixed(2)}</p>
            <Button className="w-full" onClick={() => setLastOrder(null)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryPill({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: string; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-premium border',
        active
          ? 'bg-gradient-to-r from-primary to-primary-hover text-white border-transparent shadow-glow-primary'
          : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground hover:bg-secondary hover:border-primary/30'
      )}
    >
      <span className={cn('text-sm transition-transform group-hover:scale-110', active && 'drop-shadow')}>{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      <span className={cn(
        'text-[9px] rounded-full px-1 py-0.5 font-semibold leading-none',
        active ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground'
      )}>{count}</span>
    </button>
  )
}

function MenuCard({ item, inCart, onAdd, currencySymbol = '₹' }: { item: any; inCart: number; onAdd: () => void; currencySymbol?: string }) {
  const tags = item.tags ? item.tags.split(',') : []
  return (
    <button
      onClick={onAdd}
      className="group relative card-premium rounded-2xl border border-border p-3 md:p-4 text-left transition-premium hover:border-primary/40 hover:-translate-y-1 hover:shadow-elevated"
    >
      {inCart > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-10 bg-gradient-to-br from-primary to-primary-hover text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-glow-primary ring-2 ring-background">
          {inCart}
        </span>
      )}
      <div className="relative aspect-square mb-3">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full rounded-full object-cover ring-1 ring-white/5 transition-transform duration-500 group-hover:scale-105" />
        ) : (
          // No photo on file: fall back to the category's icon so the grid
          // reads as varied rather than 22 identical plates.
          <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center text-3xl">
            {item.category?.icon || '🍽️'}
          </div>
        )}
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/5 pointer-events-none" />
        {/* rating overlay */}
        {item.rating > 0 && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-background/90 backdrop-blur border border-border px-1.5 py-0.5 text-[9px] font-medium">
            <span className="text-amber-400">★</span>
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{item.name}</h4>
        <p className="text-[11px] text-muted-foreground line-clamp-1">{item.description}</p>
        {/* flex-wrap so a long badge (BESTSELLER) drops to a second line
            instead of spilling outside the card. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
          <span className="font-bold text-base text-gradient-primary">{currencySymbol}{item.price.toFixed(2)}</span>
          {tags[0] && <Tag label={tags[0]} />}
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="opacity-60">⏱</span>
          <span>{item.prepTime} min</span>
          {/* Only shown when the item actually has a calorie value. */}
          {item.calories ? (
            <>
              <span className="opacity-40">·</span>
              <span className="opacity-60">🔥</span>
              <span>{item.calories} cal</span>
            </>
          ) : null}
        </p>
      </div>
    </button>
  )
}

interface CartPanelProps {
  embedded?: boolean
  tables: any[]
  orderType: string
  setOrderType: (t: any) => void
  selectedTableId: string | null
  setSelectedTableId: (id: string | null) => void
  customerName: string
  setCustomerName: (v: string) => void
  customerPhone: string
  setCustomerPhone: (v: string) => void
  cart: any[]
  addToCart: (item: any, qty?: number) => void
  updateCartQty: (id: string, qty: number) => void
  removeFromCart: (id: string) => void
  setCartNotes: (id: string, notes: string) => void
  subtotal: number
  discount: number
  tax: number
  service: number
  total: number
  promoCode: string
  setPromoCode: (c: string) => void
  appliedPromo: any | null
  promoError: string
  onApplyPromo: () => void
  onRemovePromo: () => void
  onSubmit: () => void
  submitting: boolean
  currencySymbol: string
  taxRate: number
  serviceRate: number
}

function CartPanel(p: CartPanelProps) {
  const tr = useT()
  const { embedded } = p
  return (
    <div className={cn('flex flex-col h-full min-h-0 flex-1', embedded && 'overflow-hidden')}>
      {/* Order type + table/customer */}
      <div className="shrink-0 px-3 py-2.5 space-y-2 border-b border-border">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/50 p-0.5 border border-border">
          {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const).map((t) => (
            <button
              key={t}
              onClick={() => p.setOrderType(t)}
              className={cn(
                'rounded-md py-1.5 text-[11px] font-semibold transition-premium',
                p.orderType === t
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-white shadow-glow-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              {t === 'DINE_IN' ? `🍽️ ${tr('pos.dineIn')}` : t === 'TAKEAWAY' ? `🥡 ${tr('pos.takeaway')}` : `🛵 ${tr('pos.delivery')}`}
            </button>
          ))}
        </div>
        {p.orderType === 'DINE_IN' ? (
          <Select value={p.selectedTableId || ''} onValueChange={(v) => p.setSelectedTableId(v)}>
            <SelectTrigger className="bg-secondary/50 border-0 h-9">
              <SelectValue placeholder={tr('pos.selectTable')} />
            </SelectTrigger>
            <SelectContent>
              {p.tables.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} · {t.seats} seats · {t.area}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={p.customerName}
              onChange={(e) => p.setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="bg-secondary/50 border-border text-sm h-9"
            />
            <Input
              value={p.customerPhone}
              onChange={(e) => p.setCustomerPhone(e.target.value)}
              placeholder="Phone"
              className="bg-secondary/50 border-border text-sm h-9"
            />
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 min-h-0">
        {p.cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-3">
              <ShoppingBag className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{tr('pos.cartEmpty')}</p>
            <p className="text-xs text-muted-foreground mt-1">{tr('pos.cartHint')}</p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Item</span>
              <span>Qty · Price</span>
            </div>
            <Separator />
            {p.cart.map((c) => (
              <div key={c.menuItemId} className="rounded-xl bg-secondary/30 p-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-secondary">
                    {c.image ? <img src={c.image} alt={c.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🍽️</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-medium leading-tight line-clamp-1">{c.name}</p>
                      <p className="text-sm font-semibold whitespace-nowrap">{p.currencySymbol}{(c.price * c.quantity).toFixed(2)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.currencySymbol}{c.price.toFixed(2)} each</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center bg-secondary rounded-lg">
                    <button onClick={() => p.updateCartQty(c.menuItemId, c.quantity - 1)} className="p-1.5 hover:text-primary">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2 text-sm font-semibold min-w-[1.5rem] text-center">{c.quantity}</span>
                    <button onClick={() => p.updateCartQty(c.menuItemId, c.quantity + 1)} className="p-1.5 hover:text-primary">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={c.notes || ''}
                    onChange={(e) => p.setCartNotes(c.menuItemId, e.target.value)}
                    placeholder="Order Note…"
                    className="flex-1 bg-secondary/60 rounded-lg px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
                  />
                  <button onClick={() => p.removeFromCart(c.menuItemId)} className="p-1.5 text-destructive/70 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Promo + totals */}
      <div className="shrink-0 border-t border-border px-3 py-2.5 space-y-2">
        {p.appliedPromo ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Ticket className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary truncate">{p.appliedPromo.code}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {p.appliedPromo.type === 'PERCENTAGE' ? `${p.appliedPromo.value}% off` : `${p.currencySymbol}${p.appliedPromo.value} off`}
                </p>
              </div>
            </div>
            <button onClick={p.onRemovePromo} className="text-muted-foreground hover:text-destructive shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={p.promoCode}
              onChange={(e) => { p.setPromoCode(e.target.value.toUpperCase()); if (p.promoError) { /* clear handled in parent */ } }}
              onKeyDown={(e) => { if (e.key === 'Enter') p.onApplyPromo() }}
              placeholder={tr('pos.promo')}
              className="flex-1 bg-secondary/60 rounded-lg px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground uppercase min-w-0"
            />
            <Button variant="secondary" size="sm" onClick={p.onApplyPromo} className="h-8">{tr('pos.apply')}</Button>
          </div>
        )}
        {p.promoError && !p.appliedPromo && (
          <p className="text-xs text-destructive">{p.promoError}</p>
        )}
        <div className="space-y-1 text-xs">
          <Row label={tr('pos.subtotal')} value={`${p.currencySymbol}${p.subtotal.toFixed(2)}`} />
          {p.discount > 0 && (
            <Row label={`Discount`} value={`−${p.currencySymbol}${p.discount.toFixed(2)}`} muted className="text-primary" />
          )}
          <Row label={`${tr('pos.tax')} (${p.taxRate}%)`} value={`${p.currencySymbol}${p.tax.toFixed(2)}`} muted />
          <Row label={`${tr('pos.service')} (${p.serviceRate}%)`} value={`${p.currencySymbol}${p.service.toFixed(2)}`} muted />
        </div>
        <Separator />
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-muted-foreground">{tr('pos.total')}</span>
          <span className="text-2xl font-bold tracking-tight text-gradient-primary">{p.currencySymbol}{p.total.toFixed(2)}</span>
        </div>
        <Button
          onClick={p.onSubmit}
          disabled={p.submitting || p.cart.length === 0}
          className="w-full h-10 text-sm font-semibold bg-gradient-to-r from-primary to-primary-hover hover:shadow-glow-primary transition-premium border-0"
        >
          {p.submitting ? (
            <><span className="animate-spin mr-2">⏳</span> Placing order…</>
          ) : (
            <><CreditCard className="h-4 w-4 mr-2" /> {tr('pos.checkout')} · {p.currencySymbol}{p.total.toFixed(2)}</>
          )}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, muted, className }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`${muted ? 'text-muted-foreground' : 'font-medium'} ${className || ''}`}>{value}</span>
    </div>
  )
}
