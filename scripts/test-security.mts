/**
 * Security-page session tests.
 *
 * The Security page used to read a `user_sessions` table that nothing ever
 * wrote to: "Active Sessions" was always 0 and "Revoke All Sessions" deleted
 * from the empty table while reporting success. These tests pin the real
 * behaviour against auth.sessions — at the database level (the SECURITY
 * DEFINER functions from migration 0036) and, once the edge functions are
 * deployed, through the /functions/v1/security and /bootstrap endpoints.
 *
 * The DB half runs against the live database and is safe before a deploy (the
 * functions are additive). The edge half needs the reworked functions live:
 * run with DB_ONLY=1 to skip it.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… npx tsx scripts/test-security.mts
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_ONLY = !!process.env.DB_ONLY;

let bad = 0;
let checks = 0;

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) {
    bad++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  } else {
    console.log(`  ok    ${name}`);
  }
}

/** The `session_id` claim inside a Supabase access token. */
function jwtSessionId(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
  );
  return payload.session_id as string;
}

async function sessionFor(email: string) {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.verifyOtp({
    token_hash: link!.properties.hashed_token,
    type: "magiclink",
  });
  return { ...data!.session!, session_id: jwtSessionId(data!.session!.access_token) };
}

async function call(path: string, token?: string, init: RequestInit = {}) {
  const res = await fetch(`${URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const DEMO_EMAIL = "swizofoods@gmail.com";

// ── the database functions (safe pre-deploy) ─────────────────────────────
console.log("\n── security_list_sessions / revoke (database level) ──");
{
  const { data: profile } = await admin
    .from("profiles")
    .select("id, tenant_id")
    .eq("email", DEMO_EMAIL)
    .single();
  const tenantId = profile!.tenant_id as string;

  // A session the test creates for itself — the only one it will revoke on
  // this tenant, so the owner's live sessions are never touched.
  const s1 = await sessionFor(DEMO_EMAIL);

  const { data: listed } = await admin.rpc("security_list_sessions", { p_tenant_id: tenantId });
  const ids = (listed ?? []).map((r: any) => r.id);
  check("list includes a freshly created session", ids.includes(s1.session_id));

  const { data: n } = await admin.rpc("security_revoke_session", {
    p_tenant_id: tenantId,
    p_session_id: s1.session_id,
  });
  check("revoke_session returns 1 for a real session", Number(n) === 1, `got ${n}`);

  const { data: listed2 } = await admin.rpc("security_list_sessions", { p_tenant_id: tenantId });
  check(
    "revoked session is gone from the list",
    !(listed2 ?? []).some((r: any) => r.id === s1.session_id),
  );

  const { data: n2 } = await admin.rpc("security_revoke_session", {
    p_tenant_id: tenantId,
    p_session_id: "00000000-0000-4000-8000-000000000000",
  });
  check("revoke_session returns 0 for a session that does not exist", Number(n2) === 0, `got ${n2}`);
}

console.log("\n── tenant scoping and revoke_all (throwaway tenant) ──");
let throwaway: { userId: string; tenantId: string; email: string } | null = null;
{
  // Register a real throwaway tenant through the production endpoint, so
  // revoke_all can be tested without touching anyone's live sessions.
  const stamp = Date.now();
  const email = `security-test-${stamp}@example.com`;
  const reg = await call("auth/register", undefined, {
    method: "POST",
    body: JSON.stringify({
      name: "Security Test",
      email,
      password: `test-password-${stamp}`,
      restaurantName: "Security Test Cafe",
    }),
  });
  check("register creates a throwaway tenant", reg.status === 200, JSON.stringify(reg.body).slice(0, 200));

  if (reg.status === 200) {
    const { data: p } = await admin
      .from("profiles")
      .select("id, tenant_id")
      .eq("email", email)
      .single();
    throwaway = { userId: p!.id, tenantId: p!.tenant_id, email };

    const demoProfile = (await admin
      .from("profiles")
      .select("tenant_id")
      .eq("email", DEMO_EMAIL)
      .single()).data!;

    // Two sessions for the throwaway owner.
    const a = await sessionFor(email);
    const b = await sessionFor(email);

    // Cross-tenant revoke: the demo tenant must not be able to revoke the
    // throwaway tenant's session.
    const { data: cross } = await admin.rpc("security_revoke_session", {
      p_tenant_id: demoProfile.tenant_id,
      p_session_id: a.session_id,
    });
    check("one tenant cannot revoke another tenant's session", Number(cross) === 0, `got ${cross}`);

    // register's signUp creates a session too, so the exact count is whatever
    // the list says right before the revoke — that equality is the real check.
    const { data: before } = await admin.rpc("security_list_sessions", {
      p_tenant_id: throwaway.tenantId,
    });
    const expected = (before ?? []).length;

    const { data: all } = await admin.rpc("security_revoke_all_sessions", {
      p_tenant_id: throwaway.tenantId,
    });
    check(
      "revoke_all returns every session of the tenant",
      Number(all) === expected && expected >= 2,
      `expected ${expected}, got ${all}`,
    );

    const { data: after } = await admin.rpc("security_list_sessions", {
      p_tenant_id: throwaway.tenantId,
    });
    check("revoke_all leaves the tenant with no sessions", (after ?? []).length === 0);
  }
}

// ── the edge functions (needs the reworked security + bootstrap deployed) ──
if (!DB_ONLY) {
  console.log("\n── GET /security and /bootstrap (edge level) ──");
  {
    const s = await sessionFor(DEMO_EMAIL);
    const sec = await call("security", s.access_token);
    check("GET /security answers 200", sec.status === 200, JSON.stringify(sec.body).slice(0, 200));

    const sessions = sec.body?.sessions ?? [];
    check(
      "the caller's own session is listed and badged current",
      sessions.some((x: any) => x.id === s.session_id && x.current === true),
      `session_id=${s.session_id}, got ${sessions.length} sessions`,
    );
    check(
      "sessions carry device/browser/ip/lastActive/user",
      sessions.every(
        (x: any) =>
          "device" in x && "browser" in x && "ip" in x && "lastActive" in x && x.user?.name,
      ),
    );

    const boot = await call("bootstrap", s.access_token);
    check("GET /bootstrap answers 200", boot.status === 200);
    const bootSessions = boot.body?.sessions ?? [];
    check(
      "bootstrap lists the caller's session as current too",
      bootSessions.some((x: any) => x.id === s.session_id && x.current === true),
      `got ${bootSessions.length} sessions`,
    );

    console.log("\n── DELETE /security (edge level) ──");
    const s2 = await sessionFor(DEMO_EMAIL);
    const del = await call(`security?sessionId=${s2.session_id}`, s.access_token, {
      method: "DELETE",
    });
    check("revoking a real session answers 200", del.status === 200, JSON.stringify(del.body).slice(0, 200));
    check("the response reports one session revoked", Number(del.body?.revoked) === 1, JSON.stringify(del.body));

    const gone = await call("security", s.access_token);
    check(
      "the revoked session is no longer listed",
      !(gone.body?.sessions ?? []).some((x: any) => x.id === s2.session_id),
    );

    const bogus = await call("security?sessionId=00000000-0000-4000-8000-000000000000", s.access_token, {
      method: "DELETE",
    });
    check(
      "revoking a session that does not exist answers 404, not success",
      bogus.status === 404,
      `got ${bogus.status}`,
    );

    console.log("\n── PATCH /security revoke_all (edge level) ──");
    if (throwaway) {
      const t = await sessionFor(throwaway.email);
      const before = await call("security", t.access_token);
      const count = (before.body?.sessions ?? []).length;
      const all = await call("security", t.access_token, {
        method: "PATCH",
        body: JSON.stringify({ action: "revoke_all" }),
      });
      check("revoke_all answers 200", all.status === 200, JSON.stringify(all.body).slice(0, 200));
      check(
        "revoke_all reports the number of sessions it revoked",
        Number(all.body?.revoked) === count && count > 0,
        `had ${count}, revoked ${all.body?.revoked}`,
      );
      // The access token itself stays valid until it expires (Supabase's own
      // sign-out behaves the same way); what must be gone is the session list.
      const after = await call("security", t.access_token);
      check("revoke_all empties the session list", (after.body?.sessions ?? []).length === 0);
    }

    console.log("\n── failed password logins are audited (edge level) ──");
    {
      const fail = await call("auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email: DEMO_EMAIL, password: "definitely-wrong-password" }),
      });
      check("wrong password answers 401", fail.status === 401, `got ${fail.status}`);

      const { data: logs } = await admin
        .from("security_logs")
        .select("created_at")
        .eq("action", "LOGIN_FAILED")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      check("a LOGIN_FAILED row was just written", (logs ?? []).length === 1);
    }

    console.log("\n── the endpoint still refuses strangers ──");
    const anon = await call("security");
    check("anonymous GET /security answers 401", anon.status === 401, `got ${anon.status}`);
  }
}

// ── cleanup: remove the throwaway tenant and its auth user ──
if (throwaway) {
  // profiles.id is the auth user id.
  await admin.auth.admin.deleteUser(throwaway.userId);
  await admin.from("tenants").delete().eq("id", throwaway.tenantId);
  console.log(`\n  cleaned up throwaway tenant ${throwaway.email}`);
}

console.log(`\n${checks - bad}/${checks} checks passed`);
if (bad > 0) {
  console.log("SECURITY TESTS FAILED");
  process.exit(1);
}
