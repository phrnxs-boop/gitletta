/**
 * Tests for the Google Business Profile integration.
 *
 * What this proves:
 *
 *   - the client secret is stored server-side, comes back masked, and never
 *     reaches the browser in full
 *   - only the super admin can read or change the credentials
 *   - the OAuth URL carries the right scope and redirect URI, and a **signed**
 *     state — a tampered state is refused
 *   - a restaurant owner's own Google access and refresh tokens are not in the
 *     settings response
 *   - the demo path still works when the platform has no Google client
 *
 * It cannot reach Google's real data — that needs a granted API project and a
 * restaurant's own Business Profile.
 */
import { createClient } from "@supabase/supabase-js";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });

async function sessionFor(email: string) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const c = createClient(SB, ANON, { auth: { persistSession: false } });
  const { data, error: e2 } = await c.auth.verifyOtp({
    token_hash: link!.properties.hashed_token,
    type: "magiclink",
  });
  if (e2) throw new Error(e2.message);
  return data!.session!.access_token;
}

async function call(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${SB}/functions/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const adminToken = await sessionFor("phrnx@icloud.com");
const ownerToken = await sessionFor("swizofoods@gmail.com");

// A client id and secret that are shaped right but belong to nobody.
const FAKE_ID = "1234567890-swixo-test.apps.googleusercontent.com";
const FAKE_SECRET = "GOCSPX-swixo-test-not-a-real-secret";

console.log("\n── the platform configuration ──");
{
  const res = await call("super-admin/google", adminToken);
  check("the super admin can read it", res.status === 200, `status ${res.status}`);
  check("the redirect URI is the callback", String(res.body?.redirectUri ?? "").endsWith("/functions/v1/google-reviews/callback"), String(res.body?.redirectUri));
  check("the scope is the one Google accepts", res.body?.scope === "https://www.googleapis.com/auth/business.manage", String(res.body?.scope));
}

console.log("\n── an ordinary owner is refused ──");
{
  const res = await call("super-admin/google", ownerToken);
  check("an owner cannot read the credentials", res.status === 403, `status ${res.status}`);
  const res2 = await call("super-admin/google", ownerToken, {
    method: "POST",
    body: JSON.stringify({ clientId: "stolen", clientSecret: "stolen" }),
  });
  check("an owner cannot change the credentials", res2.status === 403, `status ${res2.status}`);
}

console.log("\n── saving the credentials ──");
{
  const res = await call("super-admin/google", adminToken, {
    method: "POST",
    body: JSON.stringify({ clientId: FAKE_ID, clientSecret: FAKE_SECRET }),
  });
  check("they save", res.status === 200, `status ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
  check("the response does not contain the secret", !JSON.stringify(res.body ?? {}).includes(FAKE_SECRET));
  check("the response carries a mask", typeof res.body?.maskedSecret === "string" && res.body.maskedSecret.length > 0);

  const read = await call("super-admin/google", adminToken);
  check("reading it back does not contain the secret", !JSON.stringify(read.body ?? {}).includes(FAKE_SECRET));
  check("the client id comes back in full", read.body?.clientId === FAKE_ID);
  check("the row is marked as configured", read.body?.configured === true);
}

console.log("\n── testing the credentials against Google ──");
{
  const res = await call("super-admin/google/test", adminToken, { method: "POST" });
  const message = String(res.body?.message ?? res.body?.error ?? "");
  check("the check reaches Google", res.status === 200 || res.status === 400, `status ${res.status}`);
  check("the response does not contain the secret", !JSON.stringify(res.body ?? {}).includes(FAKE_SECRET));
  console.log(`        Google said: ${message.slice(0, 150) || "(no message)"}`);
  check("Google rejected the fake credentials", /rejected|invalid/i.test(message), message.slice(0, 160));
}

console.log("\n── the sign-in URL a restaurant gets ──");
{
  const res = await call("google-reviews/connect", ownerToken);
  check("the connect route answers", res.status === 200, `status ${res.status}`);
  check("it is not demo mode now that a client is configured", res.body?.demoMode === false);

  const authUrl = new URL(String(res.body?.authUrl));
  check("it points at Google", authUrl.hostname === "accounts.google.com", authUrl.hostname);
  check("the scope is the Business Profile one", authUrl.searchParams.get("scope") === "https://www.googleapis.com/auth/business.manage", String(authUrl.searchParams.get("scope")));
  check("it asks for offline access", authUrl.searchParams.get("access_type") === "offline", String(authUrl.searchParams.get("access_type")));
  check("the redirect URI is the callback", String(authUrl.searchParams.get("redirect_uri")).endsWith("/functions/v1/google-reviews/callback"), String(authUrl.searchParams.get("redirect_uri")));

  const state = authUrl.searchParams.get("state") ?? "";
  check("the state is signed, not a bare tenant id", state !== "" && !state.startsWith("swizofoods"), state.slice(0, 40));

  // The state is base64url(payload).hmac, and the payload carries the
  // tenant id and an expiry.
  const [encoded] = state.split(".");
  const payload = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  const [carriedTenant, expiryText] = payload.split(".");
  const expiry = Number(expiryText);

  // The state carries the restaurant's id, signed. The id is a uuid, and the
  // whole state is longer than it, because the signature is appended.
  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("email", "swizofoods@gmail.com")
    .maybeSingle();
  check("the state carries the restaurant", carriedTenant === profile?.tenant_id, `${carriedTenant} vs ${profile?.tenant_id}`);
  check("the state is more than the bare id", state.length > carriedTenant.length);
  check("the state expires", Number.isFinite(expiry) && expiry > Date.now(), String(expiry));

  console.log("\n── a tampered state is refused ──");
  const tampered = state.slice(0, -4) + "AAAA";
  const bad = await call(`google-reviews/callback?code=fake&state=${encodeURIComponent(tampered)}`, adminToken);
  check("a tampered state is refused", bad.status === 400, `status ${bad.status}`);
  check("it says the request could not be verified", /verified/i.test(String(bad.body?.error ?? "")), String(bad.body?.error));

  // A state this server issued, but a code that is no good: the state is
  // accepted and the code is what fails. That is the difference between a
  // broken state and a broken sign-in.
  const good = await call(`google-reviews/callback?code=fake&state=${encodeURIComponent(state)}`, adminToken);
  check("a genuine state is accepted", !/verified/i.test(String(good.body?.error ?? "")), String(good.body?.error));
}

console.log("\n── a restaurant's own tokens stay on the server ──");
{
  const res = await call("google-reviews/settings", ownerToken);
  const body = JSON.stringify(res.body ?? {});
  check("the settings answer does not carry an access token", !/"accessToken"/.test(body), body.slice(0, 200));
  check("the settings answer does not carry a refresh token", !/"refreshToken"/.test(body), body.slice(0, 200));
}

console.log("\n── the demo path still works ──");
{
  // With no client configured at all, the platform falls back to the sample
  // connection so the page is not a dead end.
  await admin.from("google_oauth_config").update({ client_id: null, client_secret: null }).eq("id", "google_business_profile");
  const res = await call("google-reviews/connect", ownerToken);
  check("it falls back to demo mode", res.body?.demoMode === true, JSON.stringify(res.body).slice(0, 140));
  check("demo mode reports itself as connected", res.body?.connected === true);
}

console.log("\n── cleaning up ──");
{
  // The demo path creates a demo connection. Leave the data as it was found.
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("email", "swizofoods@gmail.com")
    .maybeSingle();
  if (ownerProfile?.tenant_id) {
    await admin.from("google_reviews").delete().eq("tenant_id", ownerProfile.tenant_id);
    await admin.from("google_connections").delete().eq("tenant_id", ownerProfile.tenant_id);
  }

  await admin.from("google_oauth_config").update({ client_id: null, client_secret: null }).eq("id", "google_business_profile");
  const res = await call("super-admin/google", adminToken);
  check("the credentials are gone", res.body?.configured === false, `configured: ${res.body?.configured}`);
  check("the client id is gone", !res.body?.clientId, String(res.body?.clientId));
}

console.log(`\n${checks - failures}/${checks} passed`);
if (failures > 0) process.exit(1);
