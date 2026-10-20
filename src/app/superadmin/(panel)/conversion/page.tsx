'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCcw, TrendingUp } from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import { DataState, PageTitle, Panel, StatCard } from '@/components/superadmin/ui'
import { FunnelBars } from '@/components/superadmin/charts'

type Conversion = {
  stages: {
    key: string
    label: string
    count: number
    rate: number
    stepRate: number
    dropOff: number
  }[]
  totals: Record<string, number>
}

export default function SuperAdminConversion() {
  const [data, setData] = useState<Conversion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await superAdminFetch<Conversion>('conversion')
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setData(res.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const t = data?.totals
  const stages = data?.stages ?? []

  // Where the biggest drop is, so it can be said plainly.
  const worst = stages.reduce(
    (acc, s, i) => (i > 0 && s.stepRate < acc.stepRate ? s : acc),
    stages[0] ?? { label: '', stepRate: 100, dropOff: 0, count: 0 },
  )

  return (
    <div>
      <PageTitle
        title="Conversion Analytics"
        description="How far a restaurant gets between signing up and paying."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            Refresh
          </button>
        }
      />

      <DataState loading={loading} error={error} onRetry={load}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Signed up"
              value={t?.signedUp ?? 0}
              icon={<TrendingUp className="size-4" />}
              tone="indigo"
            />
            <StatCard
              label="Onboarded"
              value={t?.completedOnboarding ?? 0}
              tone="violet"
            />
            <StatCard
              label="Menu published"
              value={t?.publishedMenu ?? 0}
              tone="sky"
            />
            <StatCard
              label="First order"
              value={t?.firstOrder ?? 0}
              tone="amber"
            />
            <StatCard
              label="On trial"
              value={t?.trial ?? 0}
              tone="sky"
            />
            <StatCard
              label="Paying"
              value={t?.paid ?? 0}
              tone="emerald"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel
              title="The funnel"
              description="Each step as a share of the step before it."
              className="xl:col-span-2"
            >
              <FunnelBars stages={stages} />
            </Panel>

            <Panel title="Where people stop" description="The step that loses the most.">
              {worst && worst.label ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[13px] font-medium text-slate-800">{worst.label}</p>
                    <p className="mt-0.5 text-[12.5px] text-slate-500">
                      {worst.count} of {stages[stages.indexOf(worst) - 1]?.count ?? 0} made it
                      through — {worst.stepRate.toFixed(0)}%.
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{ width: `${Math.max(0, 100 - worst.stepRate)}%` }}
                    />
                  </div>
                  <p className="text-[12.5px] text-slate-500">
                    {worst.dropOff} restaurants stopped here.
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-slate-400">Not enough data yet.</p>
              )}
            </Panel>
          </div>

          <Panel title="Step by step" bodyClassName="px-0 py-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[11.5px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3 font-medium">Step</th>
                    <th className="px-3 py-3 text-right font-medium">Count</th>
                    <th className="px-3 py-3 text-right font-medium">Of signups</th>
                    <th className="px-3 py-3 text-right font-medium">Of previous step</th>
                    <th className="px-5 py-3 text-right font-medium">Drop-off</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stages.map((s, i) => (
                    <tr key={s.key} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-2.5 text-[13px] font-medium text-slate-800">
                        {i + 1}. {s.label}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-slate-700">
                        {s.count}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-slate-600">
                        {s.rate}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-slate-600">
                        {i === 0 ? '—' : `${s.stepRate}%`}
                      </td>
                      <td className="px-5 py-2.5 text-right text-[13px] tabular-nums text-rose-600">
                        {i === 0 ? '—' : s.dropOff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </DataState>
    </div>
  )
}
