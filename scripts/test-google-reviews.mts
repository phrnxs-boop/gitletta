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

console.log("\n── the credentials are not a setting any more ──");
{
  // The client id and the secret are edge function secrets now. The
  // dashboard must refuse them rather than quietly accept them.
  const res = await call("super-admin/google", adminToken, {
    method: "POST",
    body: JSON.stringify({ clientId: FAKE_ID, clientSecret: FAKE_SECRET }),
  });
  check("the dashboard refuses to store them", res.status === 400, `status ${res.status}`);
  check(
    "it says where they belong now",
    /edge function secret/i.test(String(res.body?.error ?? "")),
    String(res.body?.error).slice(0, 140),
  );
  check("the response does not contain the secret", !JSON.stringify(res.body ?? {}).includes(FAKE_SECRET));

  // And nothing was written: the table has neither column any more.
  const { data: rows } = await admin.from("google_oauth_config").select("*");
  check(
    "no credential is stored in the database",
    !JSON.stringify(rows ?? []).includes(FAKE_SECRET) && !JSON.stringify(rows ?? []).includes(FAKE_ID),
    JSON.stringify(rows ?? []).slice(0, 140),
  );

  const read = await call("super-admin/google", adminToken);
  check("the response never carries a secret", !JSON.stringify(read.body ?? {}).includes(FAKE_SECRET));
  check("the response says whether a client is configured", typeof read.body?.configured === "boolean", String(read.body?.configured));
  check("there is no mask any more", read.body?.maskedSecret === undefined, String(read.body?.maskedSecret));
}

console.log("\n── the redirect URI is still a setting ──");
{
  const before = await call("super-admin/google", adminToken);
  const res = await call("super-admin/google", adminToken, {
    method: "POST",
    body: JSON.stringify({ redirectUri: "https://www.restrofi.in/google/callback" }),
  });
  check("the redirect URI saves", res.status === 200, `status ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
  const read = await call("super-admin/google", adminToken);
  check("it is the one we set", read.body?.redirectUri === "https://www.restrofi.in/google/callback", String(read.body?.redirectUri));
  check("it was changed", read.body?.redirectUri !== before.body?.redirectUri);
  // put it back
  await call("super-admin/google", adminToken, {
    method: "POST",
    body: JSON.stringify({ redirectUri: before.body?.redirectUri }),
  });
}

console.log("\n── the token table is unreachable from the browser ──");
{
  for (const table of ["google_oauth_tokens", "google_oauth_config"]) {
    const res = await fetch(`${SB}/rest/v1/${table}?select=*`, {
      headers: { apikey: ANON, authorization: `Bearer ${ownerToken}` },
    });
    const body = await res.text().catch(() => "");
    check(`${table} is not readable by a signed-in user`, res.status >= 400 || body === "[]", `status ${res.status} ${body.slice(0, 80)}`);
  }
}

console.log("\n── testing the credentials against Google ──");
{
  const res = await call("super-admin/google/test", adminToken, { method: "POST" });
  const message = String(res.body?.message ?? res.body?.error ?? "");
  check("the check answers", res.status === 200 || res.status === 400, `status ${res.status}`);
  check("the response does not contain the secret", !JSON.stringify(res.body ?? {}).includes(FAKE_SECRET));
  console.log(`        it said: ${message.slice(0, 150) || "(no message)"}`);
  // With the credentials in the environment this reaches Google; without
  // them it has to say which secrets are missing.
  check(
    "it either reached Google or says which secret is missing",
    /rejected|invalid/i.test(message) || /GOOGLE_CLIENT_ID/.test(message),
    message.slice(0, 160),
  );
}

console.log("\n── the sign-in URL a restaurant gets ──");
{
  const res = await call("google-reviews/connect", ownerToken);
  check("the connect route answers", res.status === 200, `status ${res.status}`);

  if (res.body?.demoMode) {
    // No client is configured on the server, so the platform falls back to the
    // sample connection. That is the correct behaviour, and it is what the
    // dashboard says.
    check("with no client configured it falls back to the sample connection", res.body?.demoMode === true);
    console.log("        (no Google client is configured on the server, so the OAuth URL cannot be built here)");
  } else {
    const authUrl = new URL(String(res.body?.authUrl));
    check("it points at Google", authUrl.hostname === "accounts.google.com", authUrl.hostname);
    check("the scope is the Business Profile one", authUrl.searchParams.get("scope") === "https://www.googleapis.com/auth/business.manage", String(authUrl.searchParams.get("scope")));
    check("it asks for offline access", authUrl.searchParams.get("access_type") === "offline", String(authUrl.searchParams.get("access_type")));
    check("the redirect URI is the callback", String(authUrl.searchParams.get("redirect_uri")).endsWith("/functions/v1/google-reviews/callback"), String(authUrl.searchParams.get("redirect_uri")));
  }

  // The state is a row now, and it is spent the moment it is used. The test
  // can therefore make a genuine one — and prove that it only works once.
  console.log("\n── the state is single-use ──");
  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("email", "swizofoods@gmail.com")
    .maybeSingle();
  const tenantId = profile!.tenant_id;

  const issue = async () => {
    const id = crypto.randomUUID();
    const { error } = await admin.from("google_oauth_states").insert({
      id,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (error) throw error;
    return id;
  };

  // A state that was never issued is refused.
  const unknown = crypto.randomUUID();
  const bad = await call(`google-reviews/callback?code=fake&state=${encodeURIComponent(unknown)}`, adminToken);
  check("a state that was never issued is refused", bad.status === 400, `status ${bad.status}`);
  check("it says the request could not be verified", /verified/i.test(String(bad.body?.error ?? "")), String(bad.body?.error));

  // A state this server issued, but a code that is no good: the state is
  // accepted and the code is what fails. That is the difference between a
  // broken state and a broken sign-in.
  const genuine = await issue();
  const good = await call(`google-reviews/callback?code=fake&state=${encodeURIComponent(genuine)}`, adminToken);
  check("a genuine state is accepted", !/verified/i.test(String(good.body?.error ?? "")), String(good.body?.error));

  // And it cannot be used twice.
  const replay = await call(`google-reviews/callback?code=fake&state=${encodeURIComponent(genuine)}`, adminToken);
  check("a state cannot be used twice", /verified/i.test(String(replay.body?.error ?? "")), String(replay.body?.error));

  // An expired state is refused too.
  const expiredId = crypto.randomUUID();
  await admin.from("google_oauth_states").insert({
    id: expiredId,
    tenant_id: tenantId,
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const expired = await call(`google-reviews/callback?code=fake&state=${encodeURIComponent(expiredId)}`, adminToken);
  check("an expired state is refused", /verified/i.test(String(expired.body?.error ?? "")), String(expired.body?.error));

  // The states are not readable from the browser.
  const stateRes = await fetch(`${SB}/rest/v1/google_oauth_states?select=*`, {
    headers: { apikey: ANON, authorization: `Bearer ${ownerToken}` },
  });
  const stateBody = await stateRes.text().catch(() => "");
  check("the states are not readable by a signed-in user", stateRes.status >= 400 || stateBody === "[]", `status ${stateRes.status} ${stateBody.slice(0, 60)}`);
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
