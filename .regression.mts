const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE = "https://www.restrofi.in";

let bad = 0;
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function sess(email: string) {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.verifyOtp({ token_hash: link!.properties.hashed_token, type: "magiclink" });
  return data!.session!.access_token;
}

async function fn(name: string, path: string, token?: string, expect = 200) {
  const res = await fetch(`${URL}/functions/v1/${path}`, {
    headers: { apikey: ANON, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const ok = res.status === expect;
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name} -> ${res.status}${ok ? "" : ` (expected ${expect})`}`);
  return res;
}

console.log("\n── the main app still works ──");
const owner = await sess("phrnxs@gmail.com");
await fn("owner bootstrap", "bootstrap", owner);
await fn("owner orders", "orders", owner);
await fn("owner menu", "menu", owner);
await fn("owner promos", "promos", owner);
await fn("owner settings", "settings", owner);
await fn("owner staff", "staff", owner);
await fn("owner analytics", "analytics", owner);
await fn("owner tables", "tables", owner);
await fn("owner categories", "categories", owner);
await fn("owner qr", "qr", owner);
await fn("owner reservations", "reservations", owner);
await fn("owner security", "security", owner);
await fn("owner bill (list)", "bill", owner);
await fn("owner table-session", "table-session", owner);
await fn("health", "health");
await fn("anonymous bootstrap is refused", "bootstrap", undefined, 401);

console.log("\n── the diner path is untouched ──");
const { data: sessRow } = await admin.from("table_sessions").select("token").eq("status", "ACTIVE").limit(1);
if (sessRow?.length) {
  const r = await fetch(`${URL}/functions/v1/orders`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ tableSessionToken: sessRow[0].token, items: [] }),
  });
  const text = await r.text();
  const expected = r.status === 400 && text.includes("No valid items");
  if (!expected) bad++;
  console.log(`  ${expected ? "ok  " : "FAIL"} diner order path -> ${r.status} ${text.slice(0, 60)}`);
} else {
  console.log("  --  no active table session to test with");
}

console.log("\n── the promo fix is still deployed ──");
await fn("promo validate", "promos/validate", owner, 405); // GET is not allowed; POST is
const r = await fetch(`${URL}/functions/v1/promos/validate`, {
  method: "POST",
  headers: { apikey: ANON, authorization: `Bearer ${owner}`, "content-type": "application/json" },
  body: JSON.stringify({ code: "FLAT50", total: 1000 }),
});
const body = await r.json();
const ok = r.status === 200 && body.applied === true && body.discount === 50;
if (!ok) bad++;
console.log(`  ${ok ? "ok  " : "FAIL"} promo validate -> ${r.status} ${JSON.stringify(body).slice(0, 90)}`);

console.log("\n── the customer-facing site ──");
for (const p of ["/", "/superadmin/login"]) {
  const res = await fetch(`${SITE}${p}`, { redirect: "manual" });
  const ok = res.status === 200;
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${p} -> ${res.status}`);
}

console.log(bad === 0 ? "\nNO REGRESSIONS" : `\n${bad} REGRESSIONS`);
if (bad > 0) process.exit(1);
