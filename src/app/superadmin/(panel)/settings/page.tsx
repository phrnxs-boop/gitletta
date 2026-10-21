'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
  Save,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import { DataState, PageTitle, Panel } from '@/components/superadmin/ui'

type GoogleConfig = {
  configured: boolean
  clientId: string
  maskedSecret: string
  redirectUri: string
  defaultRedirectUri: string
  source: 'database' | 'edge-function-secret' | 'none'
  scope: string
  updatedAt: string | null
}

/**
 * Platform settings.
 *
 * The Google Business Profile credentials are the platform's, not a
 * restaurant's: one OAuth client, every restaurant connects through it. They
 * live in a table with no access policy for signed-in users, so no restaurant
 * owner or member of staff can read or change them.
 */
export default function SuperAdminSettings() {
  const [config, setConfig] = useState<GoogleConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await superAdminFetch<GoogleConfig>('google')
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setConfig(res.data ?? null)
    setClientId(res.data?.clientId ?? '')
    setRedirectUri(res.data?.redirectUri ?? '')
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
    const res = await superAdminFetch('google', {
      method: 'POST',
      body: JSON.stringify({ clientId, clientSecret, redirectUri }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // The field is cleared, so the secret is not left sitting in the DOM.
    setClientSecret('')
    flash('Saved. The credentials are stored on the server and never sent to the browser.')
    load()
  }

  const test = async () => {
    setTesting(true)
    setError(null)
    setNotice(null)
    const res = await superAdminFetch<{ ok: boolean; message?: string; error?: string }>(
      'google/test',
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
      setError(res.data?.error ?? 'Google did not accept the credentials.')
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to the clipboard.')
    }
  }

  return (
    <div>
      <PageTitle
        title="Settings"
        description="Platform configuration. The Google Business Profile credentials are the platform's — one OAuth client that every restaurant connects through."
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
            title="Google Business Profile"
            description="The OAuth client every restaurant connects with."
            bodyClassName="space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                OAuth Client ID
              </span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="1234567890-abc.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[13px] outline-none transition focus:border-admin-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                OAuth Client Secret
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={config?.configured ? '••••••••' : 'GOCSPX-…'}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2.5 font-mono text-[13px] outline-none transition focus:border-admin-accent"
                />
              </div>
              <span className="mt-1 block text-[11.5px] text-slate-400">
                Leave it empty to keep the stored secret.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Redirect URI
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  placeholder={config?.defaultRedirectUri}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[12px] outline-none transition focus:border-admin-accent"
                />
                <button
                  onClick={() => copy(redirectUri || config?.defaultRedirectUri || '')}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50"
                  aria-label="Copy the redirect URI"
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </button>
              </div>
              <span className="mt-1 block text-[11.5px] text-slate-400">
                Must match a redirect URI registered in the OAuth client, exactly.
              </span>
            </label>

            <div className="space-y-1.5 text-[12.5px] text-slate-500">
              <p>
                <span className="font-medium text-slate-700">Status:</span>{' '}
                {config?.configured ? (
                  <span className="text-emerald-700">
                    configured
                    {config.source === 'edge-function-secret' ? ' (from the function secret)' : ' (saved here)'}
                  </span>
                ) : (
                  <span className="text-amber-700">no client configured</span>
                )}
              </p>
              <p>
                <span className="font-medium text-slate-700">Scope:</span>{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-600">
                  {config?.scope}
                </code>
              </p>
              {config?.updatedAt && (
                <p>
                  <span className="font-medium text-slate-700">Last updated:</span>{' '}
                  {new Date(config.updatedAt).toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="text-[12.5px] leading-relaxed text-emerald-800">
                <p className="font-medium">The credentials stay on the server.</p>
                <p className="mt-0.5 text-emerald-700/90">
                  Read only by the edge functions through the service role. No restaurant owner
                  or member of staff can read them, and a restaurant&rsquo;s own access and
                  refresh tokens are never sent to their browser.
                </p>
              </div>
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel
              title="Before it works"
              description="The Business Profile APIs are not self-service."
              bodyClassName="space-y-3"
            >
              <ol className="space-y-2.5 text-[12.5px] leading-relaxed text-slate-600">
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    1
                  </span>
                  <span>
                    Create a Google Cloud project and enable{' '}
                    <strong className="font-semibold text-slate-700">My Business API v4</strong>,{' '}
                    <strong className="font-semibold text-slate-700">Account Management</strong> and{' '}
                    <strong className="font-semibold text-slate-700">Business Information</strong>.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    2
                  </span>
                  <span>
                    Create an <strong className="font-semibold text-slate-700">OAuth client ID</strong> of
                    type &ldquo;Web application&rdquo; and add the redirect URI above.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    3
                  </span>
                  <span>
                    <strong className="font-semibold text-slate-700">Request access to the API.</strong>{' '}
                    Google approves per project, after an application, and only if you manage a
                    Business Profile that has been verified and active for 60+ days and has a
                    website listed on it. Reviews are about 14 working days.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    4
                  </span>
                  <span>
                    Check the quota for the Business Profile APIs in the Cloud console:{' '}
                    <strong className="font-semibold text-slate-700">0 QPM means not approved</strong>,{' '}
                    <strong className="font-semibold text-slate-700">300 QPM means approved</strong>.
                  </span>
                </li>
              </ol>

              <a
                href="https://developers.google.com/my-business/content/prereqs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-admin-accent hover:underline"
              >
                Google&rsquo;s prerequisites and the access request
                <ExternalLink className="size-3.5" />
              </a>
            </Panel>

            <Panel
              title="One more thing to know"
              bodyClassName="space-y-2.5"
            >
              <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-slate-600">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>
                  A restaurant&rsquo;s Business Profile has to be{' '}
                  <strong className="font-semibold text-slate-700">verified</strong> before its
                  reviews can be read, and its Google Workspace administrator must have Google
                  Search or Maps enabled for the account before replies will work.
                </span>
              </p>
              <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-slate-600">
                <Store className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>
                  Each restaurant connects with its own Google account and picks its own location.
                  You only configure the shared client here.
                </span>
              </p>
            </Panel>
          </div>
        </div>
      </DataState>
    </div>
  )
}
