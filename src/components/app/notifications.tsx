'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app/data-context'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Bell, ChefHat, CalendarClock, PackageX, ShieldAlert, CheckCircle2, Inbox } from 'lucide-react'

/** How long a "seen" mark lasts before everything counts as unread again. */
const SEEN_KEY = 'swixo-notifications-seen'

type Kind = 'order' | 'ready' | 'reservation' | 'soldout' | 'security'

interface Notice {
  id: string
  kind: Kind
  title: string
  body: string
  at: number
  view?: string
}

const TONES: Record<Kind, { icon: typeof Bell; cls: string }> = {
  order: { icon: ChefHat, cls: 'bg-primary/15 text-primary' },
  ready: { icon: CheckCircle2, cls: 'bg-emerald-500/15 text-emerald-500' },
  reservation: { icon: CalendarClock, cls: 'bg-blue-500/15 text-blue-500' },
  soldout: { icon: PackageX, cls: 'bg-amber-500/15 text-amber-500' },
  security: { icon: ShieldAlert, cls: 'bg-destructive/15 text-destructive' },
}

/** "12 min ago", then a date once that stops being useful. */
function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/**
 * Notifications, derived from data the app already holds.
 *
 * There is no notifications table and none is needed: every one of these is a
 * fact already loaded — an order nobody has started, a dish that is off, a
 * booking due shortly, a failed sign-in. They also clear themselves. Starting a
 * pending order or marking a dish available removes it from this list, so
 * nothing has to be dismissed and nothing can go stale.
 *
 * The one piece of local state is a "seen" timestamp, so the dot clears when the
 * menu is opened rather than sitting there until the underlying work is done.
 */
export function Notifications() {
  const { data } = useApp()
  const { setView } = useStore()
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(window.localStorage.getItem(SEEN_KEY) || 0)
  })

  const notices = useMemo<Notice[]>(() => {
    if (!data) return []
    const out: Notice[] = []
    const now = Date.now()

    // Orders waiting on someone. PENDING has not been started; READY is plated
    // and needs carrying out, which is just as time-sensitive.
    for (const o of data.orders ?? []) {
      if (o.status === 'PENDING') {
        out.push({
          id: `order-${o.id}`, kind: 'order', view: 'orders',
          title: `Order #${o.orderNumber} has not been started`,
          body: o.table?.name ? `${o.table.name} · waiting to be prepared` : 'Waiting to be prepared',
          at: new Date(o.createdAt).getTime(),
        })
      } else if (o.status === 'READY') {
        out.push({
          id: `ready-${o.id}`, kind: 'ready', view: 'orders',
          title: `Order #${o.orderNumber} is ready`,
          body: o.table?.name ? `${o.table.name} · ready to serve` : 'Ready to serve',
          at: new Date(o.createdAt).getTime(),
        })
      }
    }

    // Bookings later today, plus anything overdue and unactioned.
    const today = new Date().toISOString().slice(0, 10)
    for (const r of data.reservations ?? []) {
      if (r.status === 'CANCELLED' || r.status === 'SEATED') continue
      const when = new Date(`${r.date}T${(r.time || '00:00').slice(0, 5)}:00`).getTime()
      if (Number.isNaN(when)) continue
      const isToday = r.date === today
      const soon = when - now < 3 * 60 * 60 * 1000
      if (!isToday && !(when < now && when > now - 6 * 60 * 60 * 1000)) continue
      if (isToday || soon) {
        out.push({
          id: `res-${r.id}`, kind: 'reservation', view: 'orders',
          title: `${r.name} · ${r.partySize} ${r.partySize === 1 ? 'guest' : 'guests'}`,
          body: `${r.date === today ? 'Today' : r.date} at ${r.time}${r.table?.name ? ` · ${r.table.name}` : ''}`,
          at: when,
        })
      }
    }

    // Dishes switched off — a diner cannot order them, so it matters.
    const soldOut = (data.menuItems ?? []).filter((m) => !m.available)
    for (const m of soldOut.slice(0, 5)) {
      out.push({
        id: `sold-${m.id}`, kind: 'soldout', view: 'menu',
        title: `${m.name} is unavailable`,
        body: 'Not orderable until you switch it back on',
        at: now,
      })
    }

    // Failed sign-ins in the last day.
    for (const l of data.securityLogs ?? []) {
      if (l.action !== 'LOGIN_FAILED') continue
      const at = new Date(l.createdAt).getTime()
      if (now - at > 24 * 60 * 60 * 1000) continue
      out.push({
        id: `sec-${l.id}`, kind: 'security', view: 'security',
        title: 'A sign-in attempt failed',
        body: l.user?.email ? l.user.email : 'Staff PIN refused',
        at,
      })
    }

    return out.sort((a, b) => b.at - a.at).slice(0, 20)
  }, [data])

  const unread = notices.filter((n) => n.at > seenAt).length

  const openMenu = (next: boolean) => {
    setOpen(next)
    if (next) {
      const now = Date.now()
      setSeenAt(now)
      try { window.localStorage.setItem(SEEN_KEY, String(now)) } catch { /* storage blocked */ }
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={openMenu}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-xl border border-border bg-secondary/40 hover:bg-secondary items-center justify-center transition-colors hidden sm:flex"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center ring-2 ring-background">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[340px] p-0 bg-card border-border">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {notices.length > 0 && (
            <Badge variant="secondary" className="bg-secondary/70 text-[10px]">{notices.length}</Badge>
          )}
        </div>

        {notices.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Inbox className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
            {notices.map((n) => {
              const tone = TONES[n.kind]
              const Icon = tone.icon
              return (
                <button
                  key={n.id}
                  onClick={() => { if (n.view) setView(n.view as never); setOpen(false) }}
                  className="w-full text-left px-3 py-2.5 flex gap-3 hover:bg-secondary/50 transition-colors border-b border-border/40 last:border-0"
                >
                  <span className={cn('mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center', tone.cls)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-snug">{n.title}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</span>
                    <span className="block text-[11px] text-muted-foreground/70 mt-1">{ago(n.at)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
