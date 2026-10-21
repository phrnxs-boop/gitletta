'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  KeyRound,
  Loader2,
  Plug,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import { DataState, PageTitle, Panel } from '@/components/superadmin/ui'

type Usage = {
  windowDays: number
  calls: number
  errors: number
  errorRate: number
  averageMs: number | null
  byModel: { model: string; calls: number; errors: number }[]
}

type RecentError = {
  id: string
  model: string | null
  action: string | null
  message: string | null
  at: string
}

type Provider = {
  provider: string
  configured: boolean
  source: string
  textModel: string
  imageModel: string
  updatedAt: string | null
  defaults: { textModel: string; imageModel: string }
  usage: Usage
  recentErrors: RecentError[]
}

/**
 * The AI provider.
 *
 * There is no key field here, and there is not going to be one. The key is a
 * **Supabase edge function secret**: it lives in the function's environment,
 * it is never in a table, never in a response and never in the browser. This
 * page can tell the administrator whether a key is configured, which models
 * are in use, how the calls have been going and what has gone wrong — and
 * that is all it needs to do.
 */
export default function SuperAdminAiProvider() {
  const [data, setData] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [textModel, setTextModel] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await superAdminFetch<Provider>('ai-provider')
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setData(res.data ?? null)
    setTextModel(res.data?.textModel ?? '')
    setImageModel(res.data?.imageModel ?? '')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 5000)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const res = await superAdminFetch('ai-provider', {
      method: 'POST',
      body: JSON.stringify({ textModel, imageModel }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    flash('The models were saved.')
    load()
  }

  const test = async () => {
    setTesting(true)
    setError(null)
    setNotice(null)
    const res = await superAdminFetch<{ ok: boolean; message?: string; error?: string }>(
      'ai-provider/test',
      { method: 'POST' },
    )
    setTesting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (res.data?.ok) {
      flash(res.data.message ?? 'Google accepted the credentials.')
    } else {
      setError(res.data?.error ?? 'The provider did not accept the credentials.')
    }
  }

  const usage = data?.usage
  const recent = data?.recentErrors ?? []

  return (
    <div>
      <PageTitle
        title="AI Provider"
        description="The model that reads menus and draws dish photographs. The API key is an edge function secret — it is not stored here, and it is never sent to the browser."
        action={
          <div className="flex items-center gap-2">
            {notice && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
                <Check className="size-3.5" />
                {notice}
              </span>
            )}
            <button
              onClick={test}
              disabled={testing || !data?.configured}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
              Test connection
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-admin-accent px-3 py-2 text-[13px] font-medium text-white transition hover:bg-admin-accent-hover disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save models
            </button>
          </div>
        }
      />

      <DataState loading={loading} error={error && !notice ? error : null} onRetry={load}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Panel
              title="Connection"
              description="Whether a key is configured on the server."
              bodyClassName="space-y-4"
            >
              <div className="flex items-center gap-3 rounded-xl border border-border bg-admin-bg px-3 py-2.5">
                <div
                  className={
                    data?.configured
                      ? 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15'
                      : 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15'
                  }
                >
                  <KeyRound
                    className={
                      data?.configured ? 'size-4 text-emerald-600' : 'size-4 text-amber-600'
                    }
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-admin-fg">
                    {data?.configured ? 'A key is configured' : 'No key is configured'}
                  </p>
                  <p className="text-[11.5px] text-admin-muted">
                    {data?.configured
                      ? 'The key is an edge function secret. It is not in the database and not in this page.'
                      : 'Set GEMINI_API_KEY as a Supabase edge function secret, then redeploy the AI functions.'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div className="text-[12.5px] leading-relaxed text-emerald-800">
                  <p className="font-medium">Why there is no key field here</p>
                  <p className="mt-0.5 text-emerald-700/90">
                    A key in a database is a key in every backup of it, and it is one table away
                    from every signed-in user. As an edge function secret it is read by the AI
                    functions and by nothing else — and this page is told only whether one is
                    there.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel
              title="Models"
              description="Which model does which job."
              bodyClassName="space-y-4"
            >
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-admin-muted">
                  Menu reading and OCR
                </span>
                <input
                  value={textModel}
                  onChange={(e) => setTextModel(e.target.value)}
                  placeholder={data?.defaults?.textModel}
                  spellCheck={false}
                  className="h-9 w-full rounded-lg border border-admin-border bg-white px-2.5 font-mono text-[12.5px] text-admin-fg outline-none focus:border-admin-accent"
                />
                <span className="mt-1 block text-[11.5px] text-admin-faint">
                  Used to read a menu image or a PDF and pull out the items.
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-admin-muted">
                  Dish photographs
                </span>
                <input
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  placeholder={data?.defaults?.imageModel}
                  spellCheck={false}
                  className="h-9 w-full rounded-lg border border-admin-border bg-white px-2.5 font-mono text-[12.5px] text-admin-fg outline-none focus:border-admin-accent"
                />
                <span className="mt-1 block text-[11.5px] text-admin-faint">
                  Used to draw a photograph of a dish. It is never asked to read a menu.
                </span>
              </label>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel
              title="Usage"
              description={`The last ${usage?.windowDays ?? 30} days.`}
              bodyClassName="space-y-3"
            >
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Calls" value={String(usage?.calls ?? 0)} />
                <Stat
                  label="Errors"
                  value={String(usage?.errors ?? 0)}
                  tone={usage?.errors ? 'red' : undefined}
                />
                <Stat
                  label="Average"
                  value={usage?.averageMs === null || usage?.averageMs === undefined
                    ? '—'
                    : `${usage.averageMs}ms`}
                />
              </div>

              {usage && usage.byModel.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-admin-border">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-admin-elevated text-[11px] uppercase tracking-wider text-admin-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="px-3 py-2 text-right font-medium">Calls</th>
                        <th className="px-3 py-2 text-right font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-border-soft">
                      {usage.byModel.map((m) => (
                        <tr key={m.model}>
                          <td className="px-3 py-2 font-mono text-[11.5px] text-admin-fg-body">
                            {m.model}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-admin-fg-body">
                            {m.calls}
                          </td>
                          <td
                            className={
                              m.errors
                                ? 'px-3 py-2 text-right tabular-nums text-red-600'
                                : 'px-3 py-2 text-right tabular-nums text-admin-fg-body'
                            }
                          >
                            {m.errors}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(!usage || usage.calls === 0) && (
                <p className="rounded-lg bg-admin-elevated px-3 py-3 text-[12.5px] leading-relaxed text-admin-muted">
                  No AI calls have been made in the last {usage?.windowDays ?? 30} days. A menu scan
                  or a dish photograph will show up here.
                </p>
              )}
            </Panel>

            <Panel
              title="Recent errors"
              description="What went wrong, and when."
              bodyClassName="space-y-2"
            >
              {recent.length === 0 ? (
                <p className="rounded-lg bg-admin-elevated px-3 py-3 text-[12.5px] text-admin-muted">
                  No errors recorded.
                </p>
              ) : (
                recent.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-2.5 rounded-lg border border-red-200/70 bg-red-50/60 px-3 py-2.5"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-red-900">
                        {e.action ?? 'call'} · {e.model ?? 'unknown model'}
                      </p>
                      <p className="mt-0.5 break-words text-[12px] leading-relaxed text-red-800/90">
                        {e.message ?? 'No message'}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-red-700/70">
                        <Clock className="size-3" />
                        {new Date(e.at).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </Panel>
          </div>
        </div>
      </DataState>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'red'
}) {
  return (
    <div className="rounded-lg border border-admin-border bg-admin-bg px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-admin-muted">{label}</p>
      <p
        className={
          tone === 'red'
            ? 'mt-0.5 text-lg font-bold tabular-nums text-red-600'
            : 'mt-0.5 text-lg font-bold tabular-nums text-admin-fg'
        }
      >
        {value}
      </p>
    </div>
  )
}
