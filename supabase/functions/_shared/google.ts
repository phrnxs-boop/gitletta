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
  /** From the edge function secret. Never from a table, never in a response. */
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  source: "edge-function-secret" | "none";
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
 * Resolve the Google configuration. The credentials come from the edge
 * function's environment; the redirect URI comes from the table, because
 * which callback a deployment uses is configuration rather than a secret.
 */
export async function getGoogleConfig(): Promise<GoogleConfig> {
  // The client id and the client secret come from the edge function's own
  // environment and nowhere else. The table holds the redirect URI, which is
  // configuration and not a credential.
  const { data } = await admin()
    .from("google_oauth_config")
    .select("redirect_uri, updated_at")
    .eq("id", GOOGLE_CONFIG_ID)
    .maybeSingle();

  const row = data as any;
  const envId = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim() || null;
  const envSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim() || null;

  return {
    clientId: envId,
    clientSecret: envSecret,
    redirectUri: (typeof row?.redirect_uri === "string" && row.redirect_uri.trim() ? row.redirect_uri.trim() : null) ?? defaultRedirectUri(),
    source: envId && envSecret ? "edge-function-secret" : "none",
    updatedAt: row?.updated_at ?? null,
  };
}

export function hasGoogleCreds(config: GoogleConfig): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

/** Never show more than the last four characters of a secret. */
export function maskSecret(_value: string | null | undefined): string {
  // There is nothing to mask any more. The secret was stored in a table and
  // masked on the way out, which meant a mask of it travelled through the
  // database and through every response. It now lives in the function's
  // environment, and the dashboard is told only whether one is configured.
  return "";
}

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

/**
 * The sign-in state.
 *
 * It used to be an HMAC over the tenant id, signed with the service role
 * key. That was replayable for the fifteen minutes it was valid, and it was
 * tied to whichever key the platform happened to inject, so a rotation
 * invalidated every sign-in in flight.
 *
 * A state is a row now. It names the restaurant it is for, it expires, and
 * it is **spent** the moment it is used. The table has no access policy, so
 * only the service role can read or write it.
 */
const STATE_TTL_MS = 15 * 60_000;

export async function issueState(tenantId: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin().from("google_oauth_states").insert({
    id,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("google: could not issue a sign-in state", error.message);
    throw new Error("Could not start the sign-in. Please try again.");
  }
  return id;
}

/**
 * Spend a state and return the restaurant it was for.
 *
 * A state that does not exist, has expired, or has already been used is
 * refused, and a refused state is not spent — there is nothing to spend.
 */
export async function consumeState(stateId: string): Promise<string | null> {
  if (!stateId) return null;

  const { data, error } = await admin()
    .from("google_oauth_states")
    .select("id, tenant_id, expires_at, used_at")
    .eq("id", stateId)
    .maybeSingle();
  if (error) {
    console.error("google: could not read the sign-in state", error.message);
    return null;
  }
  if (!data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const { error: spendError } = await admin()
    .from("google_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("id", stateId)
    .is("used_at", null);
  if (spendError) {
    console.error("google: could not spend the sign-in state", spendError.message);
    return null;
  }

  return data.tenant_id as string;
}

/** Clear the states that have expired. */
export async function pruneStates(): Promise<void> {
  await admin()
    .from("google_oauth_states")
    .delete()
    .lt("expires_at", new Date(Date.now() - 60 * 60_000).toISOString());
}

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
    return {
      ok: false,
      message:
        "No client id or client secret is configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Supabase edge function secrets.",
    };
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
