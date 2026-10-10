'use client'

import { useMemo, useState } from 'react'
import { useApp, type Order } from '@/components/app/data-context'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { BillDialog } from '@/components/shared/bill-dialog'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge, OrderTypeBadge } from '@/components/shared/badges'
import {
  Search,
  Clock,
  TrendingUp,
  ShoppingBag,
  ChefHat,
  CheckCircle2,
  Utensils,
  CreditCard,
  Wallet,
  Banknote,
  Eye,
  Loader2,
  Inbox,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
  { key: 'COMPLETED', label: 'Completed' },
] as const

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'DINE_IN', label: 'Dine In' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
  { value: 'DELIVERY', label: 'Delivery' },
] as const

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'WALLET', label: 'Wallet', icon: Wallet },
] as const

/**
 * When an order was placed, in the terms someone reading the board uses:
 * "Today", "Yesterday", then a date.
 *
 * The cards showed a bare time, so 07:31 AM today and 09:44 PM three days ago
 * looked identical — you could not tell how old a ticket was without opening
 * it. Anything older than yesterday gets its date; today and yesterday are
 * named, which is what the person scanning the list is actually asking.
 */
function orderWhen(iso: string, opts: { weekday?: boolean } = {}): string {
  const d = new Date(iso)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d >= startOfToday) return `Today · ${time}`
  if (d >= startOfYesterday) return `Yesterday · ${time}`

  const date = d.toLocaleDateString(
    [],
    opts.weekday
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short' },
  )
  return `${date} · ${time}`
}

export function OrdersView() {
  const t = useT()
  const { data, refresh } = useApp()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [payOrder, setPayOrder] = useState<Order | null>(null)
  const [viewOrder, setViewOrder] = useState<Order | null>(null)
  const [billOrderId, setBillOrderId] = useState<string | null>(null)
  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Deleting is gated on orders.manage. bootstrap reports the caller's
  // effective permissions — every key for an owner, the role's list for staff —
  // so this can fail closed. It previously inferred "owner" from the absence of
  // a staff record, which quietly granted the permission whenever the staff
  // session was not detected. The endpoint enforces it independently; this only
  // keeps the button off screens where the call would be refused anyway.
  const canManageOrders = (data?.permissions ?? []).includes('orders.manage')

  const confirmDelete = async () => {
    if (!deleteOrder || !data) return
    setDeleting(true)
    try {
      const res = await edgeFetch(`/api/orders/${deleteOrder.id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': data.tenant.id },
      })
      if (!res.ok) throw new Error()
      toast.success(`Order #${deleteOrder.orderNumber} deleted`)
      setDeleteOrder(null)
      await refresh()
    } catch {
      toast.error('Could not delete the order')
    } finally {
      setDeleting(false)
    }
  }
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH')
  const [busy, setBusy] = useState<string | null>(null)
  const { scrollRef, collapsed } = useScrollCollapse()

  const orders = data?.orders ?? []
  const tenant = data?.tenant
  const summary = data?.summary
  const cs = tenant?.currencySymbol ?? '$'

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false
        if (typeFilter !== 'all' && o.orderType !== typeFilter) return false
        if (search) {
          const q = search.toLowerCase()
          const match =
            String(o.orderNumber).includes(q) ||
            (o.customerName || '').toLowerCase().includes(q)
          if (!match) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [orders, statusFilter, typeFilter, search])

  // (scrollRef + collapsed come from useScrollCollapse above)
  if (!data || !tenant) return null

  const updateStatus = async (order: Order, status: string, method?: string) => {
    setBusy(order.id + status)
    try {
      const res = await edgeFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenant.id,
        },
        body: JSON.stringify({ status, ...(method ? { paymentMethod: method } : {}) }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(`Order #${order.orderNumber} → ${capitalize(status.toLowerCase())}`)

      // When an order is completed, end the table session for that table
      if (status === 'COMPLETED' && order.tableId) {
        // 1. Broadcast immediately across browser tabs for zero-delay instant session end
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const bc = new BroadcastChannel('swixo_orders_sync')
            bc.postMessage({
              type: 'SESSION_ENDED',
              tenantId: tenant.id,
              tableId: order.tableId,
              orderId: order.id,
              status: 'COMPLETED',
              timestamp: new Date().toISOString(),
            })
            bc.close()
          }
        } catch {}

        // 2. Persist end table session in backend
        try {
          await edgeFetch('/api/table-session/end', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-tenant-id': tenant.id },
            body: JSON.stringify({ tableId: order.tableId }),
          })
        } catch {
          // silently ignore — session end is best-effort, order completion is primary
        }
      }

      await refresh()
    } catch {
      toast.error('Failed to update order')
    } finally {
      setBusy(null)
    }
  }

  const handlePay = async () => {
    if (!payOrder) return
    await updateStatus(payOrder, 'COMPLETED', paymentMethod)
    setPayOrder(null)
    setPaymentMethod('CASH')
  }

  const activeCount = orders.filter((o) =>
    ['PENDING', 'PREPARING', 'READY', 'SERVED'].includes(o.status)
  ).length

  return (
    <div className="h-full flex flex-col">
      {/* Header — collapses on scroll to give order cards more room */}
      <div
        className={cn(
          'px-3.5 md:px-6 transition-all duration-200 ease-out',
          collapsed ? 'pt-1.5 pb-1.5' : 'pt-3 md:pt-6 pb-2.5',
        )}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2
              className={cn(
                'font-bold tracking-tight transition-all duration-200 ease-out',
                collapsed ? 'text-base md:text-lg' : 'text-lg md:text-2xl',
              )}
            >
              Orders
            </h2>
            <p
              className={cn(
                'text-sm text-muted-foreground transition-all duration-200 ease-out',
                collapsed
                  ? 'max-h-0 opacity-0 overflow-hidden'
                  : 'max-h-8 opacity-100',
              )}
            >
              {t('orders.title')}
            </p>
          </div>
          <div
            className={cn(
              'flex flex-wrap gap-2 transition-all duration-200 ease-out',
              collapsed
                ? 'max-h-0 opacity-0 overflow-hidden'
                : 'max-h-20 opacity-100',
            )}
          >
            <StatChip icon={ShoppingBag} label="Active" value={String(activeCount)} accent />
            <StatChip
              icon={TrendingUp}
              label="Revenue"
              value={`${cs}${(summary?.revenue ?? 0).toFixed(2)}`}
            />
            <StatChip
              icon={Inbox}
              label="Today"
              value={String(summary?.ordersToday ?? 0)}
            />
          </div>
        </div>
      </div>

      {/* Filter bar — collapses away when header is collapsed */}
      <div
        className={cn(
          'px-3.5 md:px-6 transition-all duration-200 ease-out',
          collapsed
            ? 'max-h-0 pb-0 opacity-0 overflow-hidden'
            : 'max-h-72 pb-3 opacity-100',
        )}
      >
        <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-0.5">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key
              const count =
                tab.key === 'all'
                  ? orders.length
                  : orders.filter((o) => o.status === tab.key).length
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2 flex-1 min-w-[180px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('orders.search')}
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <span className="text-xs text-muted-foreground hover:text-foreground">Clear</span>
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-secondary/60 border-0">
                <SelectValue placeholder="Order type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3.5 md:px-6 pb-4 md:pb-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('orders.noOrders')}
            description="Adjust your filters or check back later."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                currencySymbol={cs}
                expanded={expandedId === order.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === order.id ? null : order.id)
                }
                onView={() => setViewOrder(order)}
                onViewBill={() => setBillOrderId(order.id)}
                canDelete={canManageOrders}
                onDelete={() => setDeleteOrder(order)}
                busy={busy === order.id + (actionForStatus(order.status)?.nextStatus || '')}
                onUpdate={(next) => updateStatus(order, next)}
                onPay={() => {
                  setPayOrder(order)
                  setPaymentMethod('CASH')
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={!!payOrder} onOpenChange={(o) => !o && setPayOrder(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>{t('orders.complete')}</DialogTitle>
            <DialogDescription>
              {payOrder
                ? `Order #${payOrder.orderNumber} · ${cs}${payOrder.total.toFixed(2)}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {payOrder && (
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span>
                    {cs}
                    {payOrder.itemsTotal.toFixed(2)}
                  </span>
                </div>
                {payOrder.discount > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Discount</span>
                    <span>
                      −{cs}
                      {payOrder.discount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Tax</span>
                  <span>
                    {cs}
                    {payOrder.tax.toFixed(2)}
                  </span>
                </div>
                {payOrder.serviceCharge > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Service</span>
                    <span>
                      {cs}
                      {payOrder.serviceCharge.toFixed(2)}
                    </span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>
                    {cs}
                    {payOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Payment method
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const active = paymentMethod === m.value
                    const Icon = m.icon
                    return (
                      <button
                        key={m.value}
                        onClick={() => setPaymentMethod(m.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 sm:gap-2 rounded-xl border p-2 sm:p-3 transition-all',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary/40 hover:border-border/80 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span className="text-[11px] sm:text-xs font-medium">{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setPayOrder(null)}>
              Cancel
            </Button>
            <Button
              onClick={handlePay}
              disabled={busy === payOrder?.id + 'COMPLETED'}
            >
              {busy === payOrder?.id + 'COMPLETED' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order details dialog */}
      <Dialog open={!!viewOrder} onOpenChange={(o) => !o && setViewOrder(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
          {viewOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2 pr-6">
                  <span>Order #{viewOrder.orderNumber}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={viewOrder.status} />
                    <OrderTypeBadge type={viewOrder.orderType} />
                  </div>
                </DialogTitle>
                <DialogDescription>
                  {orderWhen(viewOrder.createdAt, { weekday: true })}
                  {viewOrder.completedAt && (
                    <span className="text-muted-foreground"> · Completed {new Date(viewOrder.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              {/* Customer / table info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {viewOrder.orderType === 'DINE_IN' ? '🍽️ Dine In' : viewOrder.orderType === 'TAKEAWAY' ? '🥡 Takeaway' : '🛵 Delivery'}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {viewOrder.orderType === 'DINE_IN' ? 'Table' : 'Customer'}
                  </p>
                  <p className="font-medium truncate">
                    {viewOrder.orderType === 'DINE_IN'
                      ? (viewOrder.table?.name || '—')
                      : (viewOrder.customerName || viewOrder.customerPhone || '—')}
                  </p>
                </div>
                {viewOrder.customerPhone && viewOrder.orderType !== 'DINE_IN' && (
                  <div className="rounded-xl bg-secondary/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone</p>
                    <p className="font-medium truncate">{viewOrder.customerPhone}</p>
                  </div>
                )}
                {viewOrder.servedBy && (
                  <div className="rounded-xl bg-secondary/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Served by</p>
                    <p className="font-medium truncate">{viewOrder.servedBy.name}</p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items ({viewOrder.items.length})</p>
                <Separator />
                {viewOrder.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-sm py-1">
                    <span className="min-w-0">
                      <span className="text-muted-foreground font-medium">{it.quantity}× </span>
                      {it.name}
                      {it.notes && <span className="block text-xs text-muted-foreground italic pl-5">“{it.notes}”</span>}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap ml-2">{cs}{(it.price * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {viewOrder.notes && (
                <div className="rounded-xl bg-secondary/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Order Note</p>
                  <p className="text-sm italic">“{viewOrder.notes}”</p>
                </div>
              )}

              {/* Totals */}
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{cs}{viewOrder.itemsTotal.toFixed(2)}</span></div>
                {viewOrder.discount > 0 && (
                  <div className="flex justify-between text-primary"><span>Discount {viewOrder.promoCode ? `(${viewOrder.promoCode})` : ''}</span><span>−{cs}{viewOrder.discount.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{cs}{viewOrder.tax.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span>{cs}{viewOrder.serviceCharge.toFixed(2)}</span></div>
                <Separator />
                <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-gradient-primary">{cs}{viewOrder.total.toFixed(2)}</span></div>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between rounded-xl bg-secondary/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Payment</span>
                <div className="flex items-center gap-2">
                  <PaymentPill status={viewOrder.paymentStatus} method={viewOrder.paymentMethod} />
                </div>
              </div>

              {viewOrder.promoCode && (
                <p className="text-xs text-muted-foreground text-center">Promo code <span className="font-mono font-semibold text-primary">{viewOrder.promoCode}</span> applied</p>
              )}

              <DialogFooter>
                <Button variant="secondary" onClick={() => setViewOrder(null)} className="w-full">Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Bill dialog */}
      <BillDialog orderId={billOrderId} open={!!billOrderId} onOpenChange={(v) => !v && setBillOrderId(null)} />

      {/* Deleting an order cannot be undone, so it asks first. */}
      <Dialog open={!!deleteOrder} onOpenChange={(o) => !o && !deleting && setDeleteOrder(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete order #{deleteOrder?.orderNumber}?</DialogTitle>
            <DialogDescription>
              This permanently removes the order and its items, and cannot be undone.
              {deleteOrder?.status === 'COMPLETED' && ' Its revenue will no longer appear in analytics.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setDeleteOrder(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Deleting…' : t('orders.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OrderCard({
  order,
  currencySymbol,
  expanded,
  onToggleExpand,
  onView,
  onViewBill,
  onDelete,
  canDelete,
  busy,
  onUpdate,
  onPay,
}: {
  order: Order
  currencySymbol: string
  expanded: boolean
  onToggleExpand: () => void
  onView: () => void
  onViewBill: () => void
  onDelete: () => void
  canDelete: boolean
  busy: boolean
  onUpdate: (next: string) => void
  onPay: () => void
}) {
  const t = useT()
  const action = actionForStatus(order.status)

  const where =
    order.orderType === 'DINE_IN'
      ? order.table?.name || '—'
      : order.orderType === 'TAKEAWAY'
      ? 'Takeaway'
      : 'Delivery'

  const who = order.customerName || order.customerPhone || null
  const isRecent = order.status === 'PENDING' && (Date.now() - new Date(order.createdAt).getTime()) < 60000

  return (
    <Card
      className={cn(
        'rounded-2xl bg-card border-border p-0 overflow-hidden flex flex-col transition-all duration-300',
        isRecent && 'ring-2 ring-primary/40 border-primary/50 shadow-glow-primary animate-in fade-in-50 slide-in-from-top-1'
      )}
    >
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="flex items-center justify-between gap-2 p-4 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-semibold">#{order.orderNumber}</span>
          {isRecent && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-white shadow-xs animate-pulse">
              NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={order.status} />
          <OrderTypeBadge type={order.orderType} />
        </div>
      </button>

      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <Utensils className="h-3.5 w-3.5" />
            {where}
            {who && <span className="text-foreground/70">· {who}</span>}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
            <Clock className="h-3 w-3" />
            {orderWhen(order.createdAt)}
          </span>
        </div>
      </div>

      <Separator />

      {/* Items */}
      <div
        className={cn(
          'px-4 py-3 space-y-1.5 overflow-y-auto scrollbar-thin',
          expanded ? 'max-h-[400px]' : 'max-h-32'
        )}
      >
        {order.items.map((it) => (
          <div key={it.id} className="flex justify-between text-sm">
            <span className="text-foreground/90 truncate pr-2">
              <span className="text-muted-foreground font-medium">{it.quantity}× </span>
              {it.name}
            </span>
            <span className="text-muted-foreground whitespace-nowrap">
              {currencySymbol}
              {(it.price * it.quantity).toFixed(2)}
            </span>
          </div>
        ))}
        {order.items.length === 0 && (
          <p className="text-xs text-muted-foreground">No items</p>
        )}
        {order.notes && (
          <p className="text-xs text-muted-foreground italic pt-1">
            “{order.notes}”
          </p>
        )}
      </div>

      <Separator />

      {/* Footer */}
      <div className="p-4 mt-auto space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-lg font-bold">
              {currencySymbol}
              {order.total.toFixed(2)}
            </span>
          </div>
          <PaymentPill status={order.paymentStatus} method={order.paymentMethod} />
        </div>

        {action ? (
          <div className="flex gap-2">
            <Button
              onClick={() => (action.nextStatus === 'COMPLETED' ? onPay() : onUpdate(action.nextStatus!))}
              disabled={busy}
              className="flex-1"
              variant={action.variant}
            >
              {busy && action.icon ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                action.icon && <action.icon className="h-4 w-4 mr-2" />
              )}
              {t(action.label)}
            </Button>
            <Button variant="outline" size="sm" onClick={onView} className="shrink-0">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onViewBill} className="shrink-0">
              <FileText className="h-4 w-4" />
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                title="Delete order"
                aria-label={`Delete order ${order.orderNumber}`}
                className="shrink-0 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {order.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}
            </div>
            <Button variant="secondary" size="sm" onClick={onView}>
              <Eye className="h-4 w-4 mr-1.5" /> View
            </Button>
            <Button variant="outline" size="sm" onClick={onViewBill}>
              <FileText className="h-4 w-4 mr-1.5" /> Bill
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                title="Delete order"
                aria-label={`Delete order ${order.orderNumber}`}
                className="shrink-0 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function PaymentPill({
  status,
  method,
}: {
  status: string
  method: string | null
}) {
  const paid = status === 'PAID'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
        paid ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
      )}
    >
      {paid ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {paid ? method || 'Paid' : 'Unpaid'}
    </span>
  )
}

function StatChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border px-3 py-1.5',
        accent
          ? 'border-primary/30 bg-primary/10'
          : 'border-border bg-secondary/40'
      )}
    >
      <Icon className={cn('h-4 w-4', accent ? 'text-primary' : 'text-muted-foreground')} />
      <div className="leading-none">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-semibold', accent && 'text-primary')}>{value}</p>
      </div>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: any
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-3">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
    </div>
  )
}

// `label` is a dictionary key, not prose, so the caller resolves it in the
// language the restaurant has chosen.
function actionForStatus(status: string): {
  label: string
  nextStatus?: string
  icon?: any
  variant?: 'default' | 'secondary'
} | null {
  switch (status) {
    case 'PENDING':
      return { label: 'orders.start', nextStatus: 'PREPARING', icon: ChefHat }
    case 'PREPARING':
      return { label: 'orders.ready', nextStatus: 'READY', icon: CheckCircle2 }
    case 'READY':
      return { label: 'orders.served', nextStatus: 'SERVED', icon: Utensils }
    case 'SERVED':
      return { label: 'orders.complete', nextStatus: 'COMPLETED', icon: CreditCard }
    case 'COMPLETED':
    case 'CANCELLED':
    default:
      return null
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
