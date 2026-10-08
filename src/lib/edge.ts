'use client'

/**
 * Client for the Supabase Edge Functions that now serve the API.
 *
 * The paths are deliberately kept identical to the old Next.js routes —
 * `edgeFetch('/api/orders')` calls `/functions/v1/orders`, and
 * `edgeFetch('/api/orders/123/items')` calls `/functions/v1/orders/123/items`.
 * That keeps the migration a mechanical swap at every call site instead of a
 * rewrite of 46 of them.
 *
 * Auth: owners send their Supabase access token as a bearer; staff send their
 * session token in `x-staff-session`. Both are understood by `_shared/auth.ts`.
 */

const EDGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
const STAFF_TOKEN_KEY = 'swixo-staff-session'

export function getStaffToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STAFF_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStaffToken(token: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (token) window.localStorage.setItem(STAFF_TOKEN_KEY, token)
    else window.localStorage.removeItem(STAFF_TOKEN_KEY)
  } catch {
    /* storage disabled — the cookie fallback still applies */
  }
}

/** `/api/orders/123?x=1` -> `${EDGE_BASE}/orders/123?x=1` */
function toEdgeUrl(path: string): string {
  const trimmed = path.replace(/^\/api/, '')
  return `${EDGE_BASE}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}

export async function edgeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)

  headers.set('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Owner JWT. Imported lazily so this module stays importable on the server.
  try {
    const { createClient } = await import('./supabase/client')
    const {
      data: { session },
    } = await createClient().auth.getSession()
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  } catch {
    /* no browser session — fall through to the staff token */
  }

  if (!headers.has('Authorization')) {
    const staff = getStaffToken()
    if (staff) headers.set('x-staff-session', staff)
  }

  return fetch(toEdgeUrl(path), { ...init, headers, credentials: 'include' })
}

/**
 * Staff-scoped request. Sends ONLY the staff session token.
 *
 * `edgeFetch` prefers the owner's bearer token when one exists, and the server's
 * `guard()` resolves an owner session before a staff one. So on a browser where
 * an owner is also signed in — which is the normal case when an owner tests
 * their own staff login — every staff call would be authenticated as the owner
 * and the staff endpoints, which require a staff session, would return 401.
 * Staff pages must therefore opt out of the owner bearer entirely.
 */
export async function staffFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const staff = getStaffToken()
  if (staff) headers.set('x-staff-session', staff)
  return fetch(toEdgeUrl(path), { ...init, headers, credentials: 'include' })
}

/** Convenience wrapper that parses JSON and never throws on a non-JSON body. */
export async function edgeJson<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await edgeFetch(path, init)
  let data: T | null = null
  try {
    data = (await res.json()) as T
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}
