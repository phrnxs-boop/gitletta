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
  source: string
  redirectUri: string
  defaultRedirectUri: string
  scope: string
  updatedAt: string | null
}

/**
 * Platform settings.
 *
 * The Google client id and the client secret are **edge function secrets**,
 * so there is no field for them here. This page tells the administrator
 * whether one is configured, which redirect URI to register in the OAuth
 * client, and what Google requires before the API will answer at all.
 */
export default function SuperAdminSettings() {
  const [config, setConfig] = useState<GoogleConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
      body: JSON.stringify({ redirectUri }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    flash('The redirect URI was saved.')
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
        description="Platform configuration. The Google credentials are edge function secrets — they are not stored here, and they never reach the browser."
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
              Save
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
            <div className="flex items-center gap-3 rounded-xl border border-border bg-admin-bg px-3 py-2.5">
              <div
                className={
                  config?.configured
                    ? 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15'
                    : 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15'
                }
              >
                <KeyRound
                  className={
                    config?.configured ? 'size-4 text-emerald-600' : 'size-4 text-amber-600'
                  }
                />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-admin-fg">
                  {config?.configured ? 'A client is configured' : 'No client is configured'}
                </p>
                <p className="text-[11.5px] text-admin-muted">
                  {config?.configured
                    ? 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set as edge function secrets.'
                    : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Supabase edge function secrets.'}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-admin-muted">
                Redirect URI
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  placeholder={config?.defaultRedirectUri}
                  spellCheck={false}
                  className="h-9 w-full min-w-0 rounded-lg border border-admin-border bg-white px-2.5 font-mono text-[12px] text-admin-fg outline-none focus:border-admin-accent"
                />
                <button
                  onClick={() => copy(redirectUri || config?.defaultRedirectUri || '')}
                  className="shrink-0 rounded-lg border border-admin-border bg-white p-2 text-admin-muted transition hover:bg-admin-elevated"
                  aria-label="Copy the redirect URI"
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </button>
              </div>
              <span className="mt-1 block text-[11.5px] text-admin-faint">
                Must match a redirect URI registered in the OAuth client, exactly. It is
                configuration, not a credential, so it is kept here.
              </span>
            </label>

            <p className="text-[12.5px] text-admin-muted">
              <span className="font-medium text-admin-fg">Scope:</span>{' '}
              <code className="rounded bg-admin-elevated px-1.5 py-0.5 font-mono text-[11.5px] text-admin-fg-body">
                {config?.scope}
              </code>
            </p>

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="text-[12.5px] leading-relaxed text-emerald-800">
                <p className="font-medium">The credentials stay on the server</p>
                <p className="mt-0.5 text-emerald-700/90">
                  Read only by the edge functions through the service role. No restaurant owner
                  or member of staff can read them, and a restaurant&rsquo;s own access and
                  refresh tokens are held in a table with no access policy at all — not even
                  the owner can read those.
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
              <ol className="space-y-2.5 text-[12.5px] leading-relaxed text-admin-muted">
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-admin-elevated text-[10px] font-bold text-admin-fg-body">
                    1
                  </span>
                  <span>
                    Create a Google Cloud project and enable{' '}
                    <strong className="font-semibold text-admin-fg-body">My Business API v4</strong>,{' '}
                    <strong className="font-semibold text-admin-fg-body">Account Management</strong> and{' '}
                    <strong className="font-semibold text-admin-fg-body">Business Information</strong>.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-admin-elevated text-[10px] font-bold text-admin-fg-body">
                    2
                  </span>
                  <span>
                    Create an <strong className="font-semibold text-admin-fg-body">OAuth client ID</strong> of
                    type &ldquo;Web application&rdquo; and add the redirect URI above.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-admin-elevated text-[10px] font-bold text-admin-fg-body">
                    3
                  </span>
                  <span>
                    <strong className="font-semibold text-admin-fg-body">Request access to the API.</strong>{' '}
                    Google approves per project, after an application, and only if you manage a
                    Business Profile that has been verified and active for 60+ days and has a
                    website listed on it. Reviews are about 14 working days.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-admin-elevated text-[10px] font-bold text-admin-fg-body">
                    4
                  </span>
                  <span>
                    Check the quota for the Business Profile APIs in the Cloud console:{' '}
                    <strong className="font-semibold text-admin-fg-body">0 QPM means not approved</strong>,{' '}
                    <strong className="font-semibold text-admin-fg-body">300 QPM means approved</strong>.
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

            <Panel title="One more thing to know" bodyClassName="space-y-2.5">
              <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-admin-muted">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>
                  A restaurant&rsquo;s Business Profile has to be{' '}
                  <strong className="font-semibold text-admin-fg-body">verified</strong> before its
                  reviews can be read, and its Google Workspace administrator must have Google
                  Search or Maps enabled for the account before replies will work.
                </span>
              </p>
              <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-admin-muted">
                <Store className="mt-0.5 size-4 shrink-0 text-admin-faint" />
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
