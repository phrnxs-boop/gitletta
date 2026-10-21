'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plug,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import { DataState, PageTitle, Panel } from '@/components/superadmin/ui'

type ProviderConfig = {
  provider: string
  configured: boolean
  maskedKey: string
  source: 'database' | 'edge-function-secret' | 'none'
  textModel: string
  imageModel: string
  updatedAt: string | null
  defaultTextModel: string
  defaultImageModel: string
}

/**
 * AI Provider settings.
 *
 * The key is write-only from this page's point of view: the server returns a
 * mask, and the field is only replaced when a new key is actually typed.
 * Nothing here ever holds the whole key after a save — the masked value
 * comes back from the server and the field is cleared.
 */
export default function SuperAdminAiProvider() {
  const [config, setConfig] = useState<ProviderConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [apiKey, setApiKey] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [textModel, setTextModel] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await superAdminFetch<ProviderConfig>('ai-provider')
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setConfig(res.data ?? null)
    setTextModel(res.data?.textModel ?? '')
    setImageModel(res.data?.imageModel ?? '')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 4000)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const res = await superAdminFetch('ai-provider', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'gemini',
        apiKey: apiKey.trim() || undefined,
        textModel: textModel.trim(),
        imageModel: imageModel.trim(),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // The field is cleared, so the key never sits in the DOM after a save.
    setApiKey('')
    flash('Saved. The key is stored on the server and never sent to the browser.')
    load()
  }

  const removeKey = async () => {
    setSaving(true)
    setError(null)
    const res = await superAdminFetch('ai-provider', {
      method: 'POST',
      body: JSON.stringify({ provider: 'gemini', clearKey: true }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setApiKey('')
    flash('The stored key was removed.')
    load()
  }

  const test = async () => {    setTesting(true)
    setError(null)
    setNotice(null)
    const res = await superAdminFetch<{
      ok: boolean
      model: string
      reply?: string
      message?: string
      error?: string
    }>('ai-provider/test', { method: 'POST' })
    setTesting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (res.data?.ok) {
      flash(`Connected. ${res.data.model} replied "${res.data.reply ?? ''}".`)
    } else {
      setError(res.data?.error ?? 'The provider did not accept the key.')
    }
  }

  return (
    <div>
      <PageTitle
        title="AI Provider"
        description="The model that reads menus and draws dish photographs. The key is stored on the server and never reaches the browser."
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
              disabled={testing || !config?.configured}
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
              {config?.configured ? 'Update' : 'Save'}
            </button>
          </div>
        }
      />

      <DataState loading={loading} error={error && !notice ? error : null} onRetry={load}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="Provider"
            description="Which service answers the AI requests."
            bodyClassName="space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Provider
              </span>
              <select
                value={config?.provider ?? 'gemini'}
                onChange={() => {}}
                disabled
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[13px] text-slate-600"
              >
                <option value="gemini">Google Gemini</option>
              </select>
            </label>

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="text-[12.5px] leading-relaxed text-emerald-800">
                <p className="font-medium">The key stays on the server.</p>
                <p className="mt-0.5 text-emerald-700/90">
                  It is written by this edge function and read by the AI functions through
                  the service role. No restaurant owner or member of staff can read or
                  change it — the table has no access policy for signed-in users at all.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-[12.5px] text-slate-500">
              <p>
                <span className="font-medium text-slate-700">Status:</span>{' '}
                {config?.configured ? (
                  <span className="text-emerald-700">
                    configured
                    {config.source === 'edge-function-secret' ? ' (from the function secret)' : ' (saved here)'}
                  </span>
                ) : (
                  <span className="text-amber-700">no key set</span>
                )}
              </p>
              {config?.maskedKey && (
                <p>
                  <span className="font-medium text-slate-700">Key:</span>{' '}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-600">
                    {config.maskedKey}
                  </code>
                </p>
              )}
              {config?.updatedAt && (
                <p>
                  <span className="font-medium text-slate-700">Last updated:</span>{' '}
                  {new Date(config.updatedAt).toLocaleString('en-IN')}
                </p>
              )}
              {config?.configured && (
                <button
                  onClick={removeKey}
                  disabled={saving}
                  className="text-[12px] font-medium text-destructive underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Remove the stored key
                </button>
              )}
            </div>
          </Panel>

          <Panel
            title="API key"
            description="Paste a new key to replace the stored one. Leave it empty to keep the current key."
            bodyClassName="space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Gemini API key
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={revealed ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={config?.configured ? '••••••••' : 'AIza…'}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 font-mono text-[13px] outline-none transition focus:border-admin-accent"
                />
                <button
                  type="button"
                  onClick={() => setRevealed((r) => !r)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label={revealed ? 'Hide the key' : 'Show the key'}
                >
                  {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Menu reading model
              </span>
              <input
                value={textModel}
                onChange={(e) => setTextModel(e.target.value)}
                placeholder={config?.defaultTextModel}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[13px] outline-none transition focus:border-admin-accent"
              />
              <span className="mt-1 block text-[11.5px] text-slate-400">
                Used for menu scanning and OCR.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Image model
              </span>
              <input
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                placeholder={config?.defaultImageModel}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[13px] outline-none transition focus:border-admin-accent"
              />
              <span className="mt-1 block text-[11.5px] text-[11.5px] text-slate-400">
                Used only for generating dish photographs.
              </span>
            </label>

            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-admin-accent" />
              The two models are kept apart on purpose: the image model is never asked to
              read a menu, and the text model is never asked to draw.
            </p>
          </Panel>
        </div>
      </DataState>
    </div>
  )
}
