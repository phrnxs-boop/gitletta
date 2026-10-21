// deno-lint-ignore-file no-explicit-any
import { admin } from "./db.ts";

/**
 * Google Business Profile client, shared by the `google-reviews` and
 * `super-admin` edge functions.
 *
 * The verified API surface this is built against:
 *
 *   - The Business Profile APIs are **not self-service**. Google grants access
 *     per Cloud project, after an application. An approved project shows a
 *     300 QPM quota; an unapproved one shows 0.
 *   - Scope: `https://www.googleapis.com/auth/business.manage`. The older
 *     `plus.business.manage` is deprecated.
 *   - Accounts:  GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 *   - Locations: GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{accountId}/locations
 *   - Reviews:   GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews
 *   - Reply:     PUT  https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
 *
 * (The paths above are written out in full rather than in Google's wildcard
 * form, because a wildcard ends in an asterisk and a slash, and that pair
 * closes a block comment.)
 *
 * The client id and secret live in `public.google_oauth_config`, which has no
 * RLS policy for signed-in users, so only the service role can read them. The
 * edge function's own `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` secrets are
 * honoured as a fallback.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GBP_BASE = "https://mybusiness.googleapis.com/v4";
export const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
export const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

/** The one scope the Business Profile APIs accept (plus.business.manage is deprecated). */
export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

export const GOOGLE_CONFIG_ID = "google_business_profile";

export type GoogleConfig = {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  source: "database" | "edge-function-secret" | "none";
  updatedAt: string | null;
};

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  scope?: string;
};

/** The default redirect target: this function's own callback. */
export function defaultRedirectUri(): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base}/functions/v1/google-reviews/callback`;
}

/**
 * Resolve the Google configuration, preferring what the Super Admin saved.
 */
export async function getGoogleConfig(): Promise<GoogleConfig> {
  const { data } = await admin()
    .from("google_oauth_config")
    .select("client_id, client_secret, redirect_uri, updated_at")
    .eq("id", GOOGLE_CONFIG_ID)
    .maybeSingle();

  const row = data as any;
  const dbId = typeof row?.client_id === "string" && row.client_id.trim() ? row.client_id.trim() : null;
  const dbSecret = typeof row?.client_secret === "string" && row.client_secret.trim() ? row.client_secret.trim() : null;
  const envId = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim() || null;
  const envSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim() || null;

  return {
    clientId: dbId ?? envId,
    clientSecret: dbSecret ?? envSecret,
    redirectUri: (typeof row?.redirect_uri === "string" && row.redirect_uri.trim() ? row.redirect_uri.trim() : null) ?? defaultRedirectUri(),
    source: dbId ? "database" : envId ? "edge-function-secret" : "none",
    updatedAt: row?.updated_at ?? null,
  };
}

export function hasGoogleCreds(config: GoogleConfig): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

/** Never show more than the last four characters of a secret. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${"•".repeat(8)}${trimmed.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

/**
 * The state is signed, not just encoded.
 *
 * The old state was the tenant id in the clear, which meant anyone could
 * craft a callback that attached their Google account to somebody else's
 * restaurant. The signature means a callback that did not come from a
 * connect request this server started is refused.
 *
 * The signing key never leaves the server. The service role key is used
 * because it is always present in the function's environment.
 */
function stateSecret(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "swixo-google-state";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

/** Build a signed, expiring state that carries the tenant id. */
export async function signState(tenantId: string, ttlMs = 15 * 60_000): Promise<string> {
  const payload = `${tenantId}.${Date.now() + ttlMs}`;
  const encoded = toBase64Url(new TextEncoder().encode(payload));
  const signature = await hmac(encoded, stateSecret());
  return `${encoded}.${signature}`;
}

/** Verify a state and return the tenant id, or null if it is not ours or is stale. */
export async function verifyState(state: string): Promise<string | null> {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const expected = await hmac(encoded, stateSecret());
  if (!timingSafeEqual(signature, expected)) return null;

  let payload: string;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    payload = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }

  const [tenantId, expiry] = payload.split(".");
  if (!tenantId || !expiry) return null;
  if (Number(expiry) < Date.now()) return null;
  return tenantId;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthUrl(config: GoogleConfig, state: string): string {
  if (!config.clientId) return "";
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri ?? defaultRedirectUri(),
    response_type: "code",
    scope: GBP_SCOPE,
    // Offline access, so a review can be synced without the owner signing in
    // every time.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: GoogleConfig,
  code: string,
): Promise<GoogleTokens | { error: string }> {
  if (!config.clientId || !config.clientSecret) {
    return { error: "Google OAuth is not configured. Add the client id and secret in Super Admin → Settings." };
  }

  const payload = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri ?? defaultRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: payload,
  });

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error_description || data?.error || "Google refused the sign-in";
    return { error: `Google refused the sign-in: ${message}` };
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope,
  };
}

export async function refreshAccessToken(
  config: GoogleConfig,
  refreshToken: string,
): Promise<GoogleTokens | { error: string }> {
  if (!config.clientId || !config.clientSecret) {
    return { error: "Google OAuth is not configured." };
  }

  const payload = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: payload,
  });

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error_description || data?.error || "could not refresh the token";
    return { error: `Google refused to renew the connection: ${message}` };
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// ---------------------------------------------------------------------------
// Business Profile API calls
// ---------------------------------------------------------------------------

export type GoogleAccount = {
  name: string; // accounts/{id}
  accountName: string;
  type: string;
};

export type GoogleLocation = {
  name: string; // locations/{id}
  locationName: string;
  address?: string;
  storeCode?: string;
};

async function googleGet<T>(url: string, accessToken: string): Promise<{ data: T } | { error: string }> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const body: any = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.error?.message || `Google answered ${res.status}`;
    return { error: message };
  }
  return { data: body as T };
}

/**
 * The accounts the owner can reach. The personal account is always first.
 */
export async function listAccounts(accessToken: string): Promise<GoogleAccount[] | { error: string }> {
  const res = await googleGet<{ accounts?: any[] }>(
    `${ACCOUNT_MGMT_BASE}/accounts?pageSize=20`,
    accessToken,
  );
  if ("error" in res) return res;

  const accounts = (res.data.accounts ?? []).map((a: any) => ({
    name: String(a.name ?? ""),
    accountName: String(a.accountName ?? "Account"),
    type: String(a.type ?? ""),
  }));
  return accounts.filter((a) => a.name);
}

/**
 * The locations under one account. Only a location the owner can actually
 * manage is returned, and only a verified location can have its reviews
 * read — which is why the picker filters on `state.status`.
 */
export async function listLocations(
  accessToken: string,
  accountName: string,
): Promise<GoogleLocation[] | { error: string }> {
  const parent = accountName.startsWith("accounts/") ? accountName : `accounts/${accountName}`;
  const res = await googleGet<{ locations?: any[] }>(
    `${BUSINESS_INFO_BASE}/v1/${parent}/locations?pageSize=100&readMask=name,title,storeCode,address,state`,
    accessToken,
  );
  if ("error" in res) return res;

  const locations = (res.data.locations ?? []).map((l: any) => ({
    name: String(l.name ?? ""),
    locationName: String(l.title ?? l.locationName ?? "Location"),
    address: l.address?.locality
      ? [l.address?.locality, l.address?.regionCode].filter(Boolean).join(", ")
      : undefined,
    storeCode: l.storeCode ? String(l.storeCode) : undefined,
  }));
  return locations.filter((l) => l.name);
}

/**
 * Check the configured client id and secret against Google.
 *
 * A deliberately invalid code is sent. Google answers `invalid_client` when
 * the credentials themselves are wrong and `invalid_grant` when they are
 * fine and only the code was no good — so one call tells us which of the two
 * it is, without needing a real sign-in.
 */
export async function testGoogleCredentials(
  config: GoogleConfig,
): Promise<{ ok: boolean; message: string }> {
  if (!config.clientId || !config.clientSecret) {
    return { ok: false, message: "No client id or client secret is configured." };
  }

  const payload = new URLSearchParams({
    code: "swixo-credential-check",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri ?? defaultRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: payload,
  });
  const data: any = await res.json().catch(() => null);
  const error = String(data?.error ?? "");

  if (res.ok) {
    return { ok: true, message: "Google accepted the credentials." };
  }
  if (error === "invalid_client" || error === "unauthorized_client") {
    return { ok: false, message: "Google rejected the client id or the client secret." };
  }
  if (error === "invalid_grant") {
    return {
      ok: true,
      message: "Google accepted the client id and secret. The sign-in code was rejected, as expected for this check.",
    };
  }
  if (error === "redirect_uri_mismatch") {
    return {
      ok: false,
      message: "Google rejected the redirect URI. It must match one registered in the OAuth client exactly.",
    };
  }
  return { ok: false, message: `Google answered: ${error || res.status}.` };
}
