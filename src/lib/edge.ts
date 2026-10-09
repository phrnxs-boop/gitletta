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
 * Auth: owners send their Supabase access token as a bearer. Staff carry an
 * HttpOnly cookie set by the staff function, sent automatically by
 * `credentials: 'include'` — nothing staff-related is readable from JavaScript.
 */

const EDGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
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

  return fetch(toEdgeUrl(path), { ...init, headers, credentials: 'include' })
}

/**
 * Staff-scoped request. Deliberately does NOT attach the owner's bearer token.
 *
 * Two reasons:
 *
 *  - The staff session lives in an HttpOnly cookie set by the staff function,
 *    so it is never readable from JavaScript and cannot be lifted by an XSS.
 *    `credentials: 'include'` is what sends it.
 *  - `edgeFetch` prefers the owner's bearer token when one exists, and the
 *    server's `guard()` resolves an owner session before a staff one. So on a
 *    browser where an owner is also signed in — the normal case when an owner
 *    tests their own staff login — a staff call carrying that bearer would be
 *    authenticated as the owner, and the staff endpoints require a staff
 *    session. Opting out of the bearer is therefore required, not just tidy.
 */
export async function staffFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
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
