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
  // Skipped entirely on a staff page, so the staff cookie is what authorises
  // the request rather than an owner session that happens to be in the browser.
  if (!staffSession) {
    try {
      const { createClient } = await import('./supabase/client')
      const {
        data: { session },
      } = await createClient().auth.getSession()
      if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
    } catch {
      /* no browser session — fall through to the staff token */
    }
  } else {
    // A staff page: the staff token identifies the caller. Needed wherever the
    // cookie could not be stored, which is the whole point of the header.
    const token = currentStaffToken()
    if (token) headers.set('x-staff-session', token)
  }

  return fetch(toEdgeUrl(path), { ...init, headers, credentials: 'include' })
}

/**
 * Whether this page is a staff session.
 *
 * The owner's Supabase session and a staff session can both exist in the same
 * browser — an owner testing their own staff login does exactly that. When they
 * do, `guard()` resolves the owner first, so a request carrying the owner's
 * bearer is authorised as the owner no matter which staff member is signed in.
 * That is how a role without orders.manage was able to delete orders: the
 * request was never the staff member's at all.
 *
 * The staff app turns this on while it is mounted, so its requests carry only
 * the staff cookie and are authorised as the staff member.
 */
let staffSession = false

/**
 * The staff session token, kept so it can be sent as a header as well as a
 * cookie.
 *
 * The cookie alone is not enough. It is issued by supabase.co while the app runs
 * on its own origin, which makes it a third-party cookie, and browsers that
 * block those never store it — the sign-in succeeds and then every request
 * arrives unauthenticated. Chrome now partitions such cookies, which covers
 * desktop, but Safari has no equivalent and staff on an iPhone still could not
 * sign in.
 *
 * `guard()` has accepted an `x-staff-session` header all along; this is the
 * client half of that. sessionStorage rather than localStorage: it is cleared
 * when the tab closes and is not shared between tabs, so the token's exposure is
 * limited to the session that is actually using it.
 */
const STAFF_TOKEN_KEY = 'swixo-staff-token'
let staffToken: string | null = null

export function rememberStaffToken(token: string): void {
  staffToken = token
  try {
    window.sessionStorage.setItem(STAFF_TOKEN_KEY, token)
  } catch {
    /* storage blocked — the cookie path still works where it is allowed */
  }
}

export function forgetStaffToken(): void {
  staffToken = null
  try {
    window.sessionStorage.removeItem(STAFF_TOKEN_KEY)
  } catch {
    /* nothing to clear */
  }
}

function currentStaffToken(): string | null {
  if (staffToken) return staffToken
  if (typeof window === 'undefined') return null
  try {
    staffToken = window.sessionStorage.getItem(STAFF_TOKEN_KEY)
  } catch {
    staffToken = null
  }
  return staffToken
}

export function setStaffSession(active: boolean): void {
  staffSession = active
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
  // Carry the token as well as the cookie — see rememberStaffToken.
  const token = currentStaffToken()
  if (token) headers.set('x-staff-session', token)
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
