'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CreditCard,
  History,
  MessageSquare,
  Plus,
  Receipt,
  Utensils,
  Users,
} from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import {
  DataState,
  PageTitle,
  Panel,
  Pill,
  compactMoney,
  money,
  relativeTime,
} from '@/components/superadmin/ui'

type Detail = {
  tenant: any
  owners: any[]
  notes: any[]
  issues: any[]
  payments: any[]
  recentOrders: any[]
  menuItems: any[]
  staff: any[]
  dailyMetrics: any[]
}

const STATUSES = ['trial', 'active', 'past_due', 'canceled']
const PLANS = ['basic', 'pro', 'enterprise']

export default function RestaurantDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await superAdminFetch<Detail>(`crm/${id}`)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setData(res.data)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const addNote = async () => {
    const body = note.trim()
    if (!body) return
    setSaving(true)
    const res = await superAdminFetch(`crm/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body, kind: 'note' }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setNote('')
    setSaved('Note added')
    setTimeout(() => setSaved(null), 2500)
    load()
  }

  const updateTenant = async (patch: Record<string, unknown>) => {
    setSaving(true)
    const res = await superAdminFetch(`tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setSaved('Updated')
    setTimeout(() => setSaved(null), 2500)
    load()
  }

  const tenant = data?.tenant

  return (
    <div>
      <button
        onClick={() => router.push('/superadmin/crm')}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" />
        All restaurants
      </button>

      <DataState loading={loading} error={error} onRetry={load}>
        {tenant && (
          <div className="space-y-5">
            <PageTitle
              title={tenant.name}
              description={`${tenant.slug} · joined ${relativeTime(tenant.created_at)}`}
              action={
                <div className="flex items-center gap-2">
                  {saved && (
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-600">
                      <Check className="size-3.5" />
                      {saved}
                    </span>
                  )}
                  <Pill status={tenant.subscription_status ?? 'unknown'}>
                    {tenant.subscription_status ?? 'unknown'}
                  </Pill>
                </div>
              }
            />

            <div className="grid gap-5 lg:grid-cols-3">
              <Panel title="Account" description="Who owns it and what they pay.">
                <dl className="space-y-3 text-[13px]">
                  {[
                    {
                      label: 'Owner',
                      value: data?.owners?.[0]
                        ? `${data.owners[0].name ?? ''} · ${data.owners[0].email}`
                        : '—',
                    },
                    { label: 'Slug', value: tenant.slug },
                    { label: 'Created', value: new Date(tenant.created_at).toLocaleDateString('en-IN') },
                    {
                      label: 'Trial ends',
                      value: tenant.trial_ends_at
                        ? new Date(tenant.trial_ends_at).toLocaleDateString('en-IN')
                        : '—',
                    },
                    {
                      label: 'Period ends',
                      value: tenant.current_period_end
                        ? new Date(tenant.current_period_end).toLocaleDateString('en-IN')
                        : '—',
                    },
                    { label: 'Onboarding', value: tenant.onboarding_done ? 'Complete' : 'Incomplete' },
                    { label: 'Account', value: tenant.active ? 'Active' : 'Disabled' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-slate-500">{row.label}</dt>
                      <dd className="truncate text-right font-medium text-slate-800">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel title="Subscription" description="Changes are written to the audit log.">
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                      Plan
                    </span>
                    <select
                      value={tenant.plan}
                      disabled={saving}
                      onChange={(e) => updateTenant({ plan: e.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-indigo-300"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                      Status
                    </span>
                    <select
                      value={tenant.subscription_status ?? 'trial'}
                      disabled={saving}
                      onChange={(e) => updateTenant({ subscriptionStatus: e.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-indigo-300"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                      Trial ends
                    </span>
                    <input
                      type="date"
                      disabled={saving}
                      defaultValue={tenant.trial_ends_at ? tenant.trial_ends_at.slice(0, 10) : ''}
                      onChange={(e) =>
                        updateTenant({
                          trialEndsAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-indigo-300"
                    />
                  </label>

                  <button
                    onClick={() => updateTenant({ active: !tenant.active })}
                    disabled={saving}
                    className={`w-full rounded-lg border px-3 py-2 text-[13px] font-medium transition disabled:opacity-60 ${
                      tenant.active
                        ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {tenant.active ? 'Disable this account' : 'Re-enable this account'}
                  </button>
                </div>
              </Panel>

              <Panel title="At a glance">
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  {[
                    { label: 'Orders', value: String(data?.recentOrders?.length ?? 0), icon: Receipt },
                    { label: 'Menu items', value: String(data?.menuItems?.length ?? 0), icon: Utensils },
                    { label: 'Staff', value: String(data?.staff?.length ?? 0), icon: Users },
                    { label: 'Payments', value: String(data?.payments?.length ?? 0), icon: CreditCard },
                  ].map((row) => (
                    <div key={row.label}>
                      <row.icon className="size-3.5 text-slate-400" />
                      <p className="mt-1 text-[20px] font-semibold tabular-nums text-slate-900">
                        {row.value}
                      </p>
                      <p className="text-[12px] text-slate-500">{row.label}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title="Follow-up notes"
                description="What was said, and when."
                action={
                  <button
                    onClick={addNote}
                    disabled={saving || !note.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    Add note
                  </button>
                }
              >
                <div className="mb-3 flex gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addNote()
                    }}
                    placeholder="Called about the trial ending…"
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 text-[13px] outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
                  />
                </div>

                {data?.notes?.length ? (
                  <ul className="space-y-2.5">
                    {data.notes.map((n: any) => (
                      <li key={n.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                        <p className="text-[13px] text-slate-700">{n.body}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-slate-400">
                          <MessageSquare className="size-3" />
                          {n.kind} · {relativeTime(n.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[13px] text-slate-400">
                    No notes on this restaurant yet.
                  </p>
                )}
              </Panel>

              <Panel
                title="Recent orders"
                description="The last orders this restaurant took."
                bodyClassName="px-0 py-0"
              >
                {data?.recentOrders?.length ? (
                  <ul className="divide-y divide-slate-100">
                    {data.recentOrders.map((o: any) => (
                      <li key={o.id} className="flex items-center gap-3 px-5 py-2.5">
                        <Receipt className="size-3.5 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate text-[13px] text-slate-700">
                          {o.order_type} · {o.status}
                        </span>
                        <span className="text-[13px] tabular-nums text-slate-800">
                          {money(o.total)}
                        </span>
                        <span className="w-20 text-right text-[11.5px] text-slate-400">
                          {relativeTime(o.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-8 text-center text-[13px] text-slate-400">
                    No orders yet.
                  </p>
                )}
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title="Payments"
                description="Everything in the ledger for this restaurant."
                bodyClassName="px-0 py-0"
              >
                {data?.payments?.length ? (
                  <ul className="divide-y divide-slate-100">
                    {data.payments.map((p: any) => (
                      <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                        <CreditCard className="size-3.5 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate text-[13px] text-slate-700">
                          {p.plan_id} · {p.billing_period}
                        </span>
                        <Pill status={p.status}>{p.status}</Pill>
                        <span className="w-24 text-right text-[13px] tabular-nums text-slate-800">
                          {money(p.amount, p.currency === 'INR' ? '₹' : `${p.currency} `)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-8 text-center text-[13px] text-slate-400">
                    No payments recorded.
                  </p>
                )}
              </Panel>

              <Panel title="Support issues" bodyClassName="px-0 py-0">
                {data?.issues?.length ? (
                  <ul className="divide-y divide-slate-100">
                    {data.issues.map((i: any) => (
                      <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="flex-1 truncate text-[13px] text-slate-700">{i.subject}</span>
                        <Pill status={i.status}>{i.status}</Pill>
                        <span className="w-20 text-right text-[11.5px] text-slate-400">
                          {relativeTime(i.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-8 text-center text-[13px] text-slate-400">
                    No support issues.
                  </p>
                )}
              </Panel>
            </div>

            <Panel
              title="Daily activity"
              description="Order counts and value per day, from the counters the orders table maintains."
            >
              {data?.dailyMetrics?.length ? (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.dailyMetrics.slice(0, 12).map((d: any) => (
                    <li
                      key={d.date}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2"
                    >
                      <CalendarDays className="size-3.5 shrink-0 text-slate-400" />
                      <span className="flex-1 text-[12.5px] text-slate-600">{d.date}</span>
                      <span className="text-[12.5px] tabular-nums text-slate-500">
                        {d.order_count} orders
                      </span>
                      <span className="w-20 text-right text-[12.5px] font-medium tabular-nums text-slate-800">
                        {compactMoney(d.order_value)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-slate-400">No activity recorded yet.</p>
              )}
            </Panel>

            <Link
              href="/superadmin/audit"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-800"
            >
              <History className="size-3.5" />
              See everything that has been done to this account
            </Link>
          </div>
        )}
      </DataState>
    </div>
  )
}
