'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'

const AXIS = {
  fontSize: 11,
  fill: '#94a3b8',
  tickLine: false,
  axisLine: false,
} as const

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px -12px rgba(15,23,42,0.25)',
  fontSize: 12.5,
  padding: '8px 12px',
} as const

/** A compact daily trend — orders and revenue on one axis each. */
export function TrendChart({
  data,
  valueKey = 'revenue',
  label = 'Revenue',
  height = 220,
}: {
  data: { date: string; [key: string]: string | number }[]
  valueKey?: string
  label?: string
  height?: number
}) {
  if (!data.length) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-slate-200 text-[13px] text-slate-400"
        style={{ height }}
      >
        No activity in this range
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="adminBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
        <YAxis {...AXIS} width={52} />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#475569', fontWeight: 600, marginBottom: 2 }}
          formatter={(value: number) => [`${label}: ${value}`, '']}
        />
        <Bar dataKey={valueKey} fill="url(#adminBar)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** A smooth line, for a metric that is better read as a shape. */
export function LineTrend({
  data,
  dataKey,
  label,
  color = '#6366f1',
  height = 200,
}: {
  data: any[]
  dataKey: string
  label: string
  color?: string
  height?: number
}) {
  if (!data.length) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-slate-200 text-[13px] text-slate-400"
        style={{ height }}
      >
        No data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
        <YAxis {...AXIS} width={48} />
        <Tooltip
          cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#475569', fontWeight: 600, marginBottom: 2 }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={label}
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

const DISTRIBUTION_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#64748b',
]

/** A labelled horizontal bar — the clearest way to show a small breakdown. */
export function DistributionBars({
  items,
  total,
  emptyLabel = 'No data yet',
}: {
  items: { label: string; value: number; hint?: string }[]
  total?: number
  emptyLabel?: string
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[13px] text-slate-400">
        {emptyLabel}
      </div>
    )
  }

  const sum = (total ?? items.reduce((s, i) => s + i.value, 0)) || 1

  return (
    <ul className="space-y-3">
      {items.map((item, i) => {
        const pct = Math.round((item.value / sum) * 100)
        return (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-medium capitalize text-slate-700">{item.label}</span>
              <span className="tabular-nums text-slate-500">
                {item.value}
                {item.hint ? ` · ${item.hint}` : ` · ${pct}%`}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(pct, item.value > 0 ? 3 : 0)}%`,
                  backgroundColor: DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length],
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** The conversion funnel, drawn as a stepped bar so the drop-off is visible. */
export function FunnelBars({
  stages,
}: {
  stages: { label: string; count: number; rate: number; stepRate: number; dropOff: number }[]
}) {
  const max = Math.max(...stages.map((s) => s.count), 1)

  return (
    <ol className="space-y-2.5">
      {stages.map((stage, i) => {
        const width = Math.max((stage.count / max) * 100, stage.count > 0 ? 8 : 2)
        const isLast = i === stages.length - 1
        return (
          <li key={stage.label}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-medium text-slate-700">{stage.label}</span>
              <span className="tabular-nums text-slate-500">
                {stage.count}
                <span className="ml-1.5 text-slate-400">{stage.rate}% of signups</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                <div
                  className={cn(
                    'flex h-full items-center justify-end rounded-lg px-2 text-[11.5px] font-semibold text-white transition-all duration-500',
                  )}
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${
                      ['#6366f1', '#7c6cf0', '#8b5cf6', '#a855f7', '#c026d3', '#db2777'][i % 6]
                    }, #818cf8)`,
                  }}
                >
                  {stage.count > 0 ? stage.count : ''}
                </div>
              </div>
              {!isLast && stage.stepRate < 100 && (
                <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-rose-500">
                  −{stage.dropOff} ({stage.stepRate.toFixed(0)}% kept)
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
