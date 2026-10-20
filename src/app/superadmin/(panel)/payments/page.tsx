'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertOctagon,
  ArrowDownRight,
  Banknote,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import {
  DataState,
  PageTitle,
  Panel,
  Pill,
  StatCard,
  money,
  relativeTime,
} from '@/components/superadmin/ui'

type Payments = {
  metrics: {
    mrr: number
    mrrRealized: number
    arr: number
    verifiedRevenue30d: number
    successfulCount: number
    failedCount: number
    failedAmount30d: number
    refundCount: number
    refundAmount: number
    pendingCount: number
    renewalCount: number
    cancellations: number
    trials: number
    paid: number
  }
  transactions: any[]
  plans: {
    id: string
    name: string
    priceMonthly: number
    priceYearly: number
    currency: string
    trialDays: number
    features: string[]
    isActive: boolean
    subscribers: number
  }[]
}

export default function SuperAdminPayments() {
  const [data, setData] = useState<Payments | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await superAdminFetch<Payments>('payments')
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

  const m = data?.metrics

  return (
    <div>
      <PageTitle
        title="Revenue & Payments"
        description="What has been paid, what has failed, and what it adds up to."
      />

      <DataState loading={loading} error={error} onRetry={load}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <StatCard
              label="MRR"
              value={money(m?.mrr ?? 0)}
              hint={`${money(m?.arr ?? 0)} ARR`}
              icon={<TrendingUp className="size-4" />}
              tone="emerald"
            />
            <StatCard
              label="Realised (30d)"
              value={money(m?.mrrRealized ?? 0)}
              hint="what actually came in"
              icon={<Banknote className="size-4" />}
              tone="indigo"
            />
            <StatCard
              label="Verified revenue"
              value={money(m?.verifiedRevenue30d ?? 0)}
              hint={`${m?.successfulCount ?? 0} successful payments`}
              icon={<CheckCircle2 className="size-4" />}
              tone="emerald"
            />
            <StatCard
              label="Failed"
              value={m?.failedCount ?? 0}
              hint={`${money(m?.failedAmount30d ?? 0)} in 30 days`}
              icon={<XCircle className="size-4" />}
              tone="rose"
            />
            <StatCard
              label="Refunds"
              value={m?.refundCount ?? 0}
              hint={money(m?.refundAmount ?? 0)}
              icon={<RotateCcw className="size-4" />}
              tone="amber"
            />
            <StatCard
              label="Renewals"
              value={m?.renewalCount ?? 0}
              hint="monthly charges"
              icon={<RotateCcw className="size-4" />}
              tone="sky"
            />
            <StatCard
              label="Cancellations"
              value={m?.cancellations ?? 0}
              hint="canceled accounts"
              icon={<ArrowDownRight className="size-4" />}
              tone="rose"
            />
            <StatCard
              label="Pending"
              value={m?.pendingCount ?? 0}
              hint="awaiting settlement"
              icon={<AlertOctagon className="size-4" />}
              tone="slate"
            />
          </div>

          <Panel
            title="Plans"
            description="The catalogue MRR is calculated from."
            bodyClassName="px-0 py-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[11.5px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 text-right font-medium">Monthly</th>
                    <th className="px-3 py-3 text-right font-medium">Yearly</th>
                    <th className="px-3 py-3 text-right font-medium">Trial</th>
                    <th className="px-3 py-3 text-right font-medium">Subscribers</th>
                    <th className="px-5 py-3 font-medium">Included</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.plans ?? []).map((p) => (
                    <tr key={p.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <span className="text-[13.5px] font-medium text-slate-800">{p.name}</span>
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] capitalize text-slate-500">
                          {p.id}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] tabular-nums text-slate-700">
                        {money(p.priceMonthly)}
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] tabular-nums text-slate-700">
                        {money(p.priceYearly)}
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] tabular-nums text-slate-600">
                        {p.trialDays}d
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] tabular-nums text-slate-700">
                        {p.subscribers}
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-slate-500">
                        {p.features.join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Transactions"
            description="Everything in the ledger, newest first."
            bodyClassName="px-0 py-0"
          >
            {data?.transactions?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11.5px] uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3 font-medium">Restaurant</th>
                      <th className="px-3 py-3 font-medium">Plan</th>
                      <th className="px-3 py-3 font-medium">Period</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 text-right font-medium">Amount</th>
                      <th className="px-5 py-3 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.transactions.map((t) => (
                      <tr key={t.id} className="transition hover:bg-slate-50/70">
                        <td className="px-5 py-2.5 text-[13px] font-medium text-slate-800">
                          {t.tenantName}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] capitalize text-slate-600">
                          {t.plan_id}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] capitalize text-slate-600">
                          {t.billing_period}
                        </td>
                        <td className="px-3 py-2.5">
                          <Pill status={t.status}>{t.status}</Pill>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-slate-800">
                          {money(t.amount, t.currency === 'INR' ? '₹' : `${t.currency} `)}
                        </td>
                        <td className="px-5 py-2.5 text-right text-[12.5px] text-slate-500">
                          {relativeTime(t.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400">
                No payments have been recorded yet.
              </p>
            )}
          </Panel>
        </div>
      </DataState>
    </div>
  )
}
