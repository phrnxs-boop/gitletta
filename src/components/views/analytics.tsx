'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useApp } from '@/components/app/data-context'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  TrendingUp, TrendingDown, IndianRupee, ShoppingBag, ClipboardList, CalendarDays,
  ArrowUpRight, ArrowDownRight, Download, Clock, Users, Utensils, Trophy,
} from 'lucide-react'
import { toast } from 'sonner'

interface DailyRevenue { date: string; label: string; revenue: number; orders: number }
interface TopItem { name: string; qty: number; revenue: number }
interface TypeBreak { type: string; count: number; revenue: number }
interface TopTable { name: string; orders: number; revenue: number }
interface CatBreak { name: string; value: number }

interface AnalyticsPayload {
  totalRevenue: number
  totalOrders: number
  avgOrder: number
  todaysRevenue: number
  todaysOrders: number
  revenueChange: number
  dailyRevenue: DailyRevenue[]
  topItems: TopItem[]
  typeBreakdown: TypeBreak[]
  topTables: TopTable[]
  hourly: number[]
  categoryBreakdown: CatBreak[]
}

const COLORS = ['#f97316', '#4ade80', '#fbbf24', '#60a5fa', '#c084fc', '#f472b6']
const CORAL = '#f97316'
const AXIS = '#9aa3b2'

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
}

function ChartTooltip({ active, payload, label, currencySymbol = '₹' }: any) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-xl shadow-black/40 max-w-[220px]">
      {label != null && <p className="font-medium mb-1">{label}</p>}
      <div className="space-y-1">
        {payload.map((p: any, i: number) => {
          const isCurrency = p.dataKey === 'revenue' || p.name?.toLowerCase().includes('revenue') || p.name?.toLowerCase().includes('avg')
          const prefix = isCurrency ? currencySymbol : ''
          const formattedVal = isCurrency ? (p.value ?? 0).toFixed(2) : String(p.value ?? 0)
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
              <span className="text-muted-foreground">{p.name}:</span>
              <span className="font-medium">{prefix}{formattedVal}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChartSkeleton({ className }: { className?: string }) {
  return <div className={cn('w-full rounded-xl bg-secondary/30 animate-pulse', className)} />
}

export function AnalyticsView() {
  const { data } = useApp()
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(7)
  const { scrollRef, collapsed } = useScrollCollapse()

  const load = useCallback(async () => {
    if (!data) return
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics?days=${period}`, { headers: { 'x-tenant-id': data.tenant.id } })
      if (!res.ok) throw new Error('Failed')
      setAnalytics(await res.json())
    } catch {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [data, period])

  useEffect(() => { load() }, [load])

  if (!data) return null
  const sym = data.tenant.currencySymbol
  const typeTotal = (analytics?.typeBreakdown ?? []).reduce((s, t) => s + t.revenue, 0) || 1

  return (
    <div className="h-full flex flex-col">
      {/* Header (collapsible on scroll) */}
      <header
        className={cn(
          'px-4 md:px-6 border-b border-border/60 transition-all duration-300 ease-out',
          collapsed ? 'pt-2 pb-2' : 'pt-4 md:pt-6 pb-3',
        )}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2
              className={cn(
                'font-bold tracking-tight transition-all duration-300 ease-out truncate',
                collapsed ? 'text-base md:text-lg' : 'text-xl md:text-2xl',
              )}
            >
              Analytics
            </h2>
            <p
              className={cn(
                'text-sm text-muted-foreground transition-all duration-300 ease-out',
                collapsed ? 'max-h-0 opacity-0 overflow-hidden mt-0' : 'max-h-8 opacity-100 mt-0.5',
              )}
            >
              Performance insights · {data.tenant.name}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" onClick={() => toast.success('Report exported')}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 pt-1 pb-4 md:pb-6 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={IndianRupee} label="Total Revenue" value={loading ? '—' : `${sym}${(analytics?.totalRevenue ?? 0).toFixed(2)}`} sub={`${period} days`} tint="coral" />
          <KpiCard icon={ClipboardList} label="Total Orders" value={loading ? '—' : String(analytics?.totalOrders ?? 0)} sub="completed" tint="green" />
          <KpiCard icon={ShoppingBag} label="Avg Order" value={loading ? '—' : `${sym}${(analytics?.avgOrder ?? 0).toFixed(2)}`} sub="per transaction" tint="amber" />
          <KpiCard icon={CalendarDays} label="Today's Revenue" value={loading ? '—' : `${sym}${(analytics?.todaysRevenue ?? 0).toFixed(2)}`} sub={`${analytics?.todaysOrders ?? 0} orders today`} change={analytics?.revenueChange} tint="blue" />
        </div>

        {/* Revenue trend */}
        <Card className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Revenue Trend</h3>
              <p className="text-xs text-muted-foreground">Daily revenue over {period} days</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: CORAL }} /> Revenue
            </div>
          </div>
          {loading ? (
            <ChartSkeleton className="h-[200px] md:h-[280px]" />
          ) : (
            <div className="h-[200px] md:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.dailyRevenue ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CORAL} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={CORAL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${v}`} />
                  <Tooltip content={<ChartTooltip currencySymbol={sym} />} />
                  <Area type="monotone" dataKey="revenue" stroke={CORAL} strokeWidth={2.5} fill="url(#revGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Top items + Order types */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="rounded-2xl border border-border bg-card p-4 md:p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Top Selling Items</h3>
                <p className="text-xs text-muted-foreground">By quantity sold</p>
              </div>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </div>
            {loading ? (
              <ChartSkeleton className="h-[240px] md:h-[260px]" />
            ) : (
              <div className="h-[240px] md:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.topItems ?? []} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip content={<ChartTooltip currencySymbol={sym} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="qty" name="Quantity" fill={CORAL} radius={[0, 6, 6, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Order Types</h3>
                <p className="text-xs text-muted-foreground">Revenue share</p>
              </div>
              <Utensils className="h-4 w-4 text-muted-foreground" />
            </div>
            {loading ? (
              <ChartSkeleton className="h-[200px]" />
            ) : (
              <>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analytics?.typeBreakdown ?? []} dataKey="revenue" nameKey="type" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} stroke="none">
                        {(analytics?.typeBreakdown ?? []).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip currencySymbol={sym} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2">
                  {(analytics?.typeBreakdown ?? []).map((t, i) => {
                    const pct = typeTotal ? (t.revenue / typeTotal) * 100 : 0
                    return (
                      <div key={t.type} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground">{TYPE_LABEL[t.type] || t.type}</span>
                        </div>
                        <span className="font-medium">{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Hourly + Category */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Sales by Hour</h3>
                <p className="text-xs text-muted-foreground">Order volume per hour</p>
              </div>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            {loading ? (
              <ChartSkeleton className="h-[240px]" />
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(analytics?.hourly ?? []).map((v, h) => ({ hour: `${h}:00`, orders: v }))} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
                    <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip currencySymbol={sym} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="orders" name="Orders" fill={CORAL} radius={[4, 4, 0, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Revenue by Category</h3>
                <p className="text-xs text-muted-foreground">Top performing categories</p>
              </div>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            {loading ? (
              <ChartSkeleton className="h-[240px]" />
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.categoryBreakdown ?? []} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${v}`} />
                    <Tooltip content={<ChartTooltip currencySymbol={sym} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="value" name="Revenue" radius={[4, 4, 0, 0]} barSize={28}>
                      {(analytics?.categoryBreakdown ?? []).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Top tables */}
        <Card className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Top Tables</h3>
              <p className="text-xs text-muted-foreground">Highest revenue tables</p>
            </div>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-secondary/30 animate-pulse" />
              ))}
            </div>
          ) : (analytics?.topTables ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No table data</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="col-span-1">#</span>
                <span className="col-span-5 sm:col-span-6">Table</span>
                <span className="col-span-3 text-right">Orders</span>
                <span className="col-span-3 text-right">Revenue</span>
              </div>
              <Separator />
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                {(analytics?.topTables ?? []).map((t, i) => (
                  <div key={t.name + i} className="grid grid-cols-12 gap-3 items-center px-3 py-2.5 rounded-xl hover:bg-secondary/40 transition-colors">
                    <span className={cn('col-span-1 inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold', i === 0 ? 'bg-amber-500/15 text-amber-400' : i === 1 ? 'bg-zinc-300/15 text-zinc-300' : i === 2 ? 'bg-orange-700/20 text-orange-500' : 'bg-secondary text-muted-foreground')}>
                      {i + 1}
                    </span>
                    <span className="col-span-5 sm:col-span-6 font-medium text-sm truncate">{t.name}</span>
                    <span className="col-span-3 text-right text-sm text-muted-foreground">{t.orders}</span>
                    <span className="col-span-3 text-right text-sm font-semibold">{sym}{t.revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, change, tint }: { icon: any; label: string; value: string; sub?: string; change?: number; tint: 'coral' | 'green' | 'amber' | 'blue' }) {
  const tints: Record<string, string> = {
    coral: 'bg-primary/15 text-primary',
    green: 'bg-green-500/15 text-green-400',
    amber: 'bg-amber-500/15 text-amber-400',
    blue: 'bg-blue-500/15 text-blue-400',
  }
  const up = (change ?? 0) >= 0
  return (
    <Card className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', tints[tint])}>
          <Icon className="h-5 w-5" />
        </div>
        {change !== undefined && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-md', up ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400')}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xl md:text-2xl font-bold tabular-nums truncate">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
    </Card>
  )
}
