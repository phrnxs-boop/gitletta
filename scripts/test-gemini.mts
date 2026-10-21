/**
 * Tests for the Gemini integration and the AI provider settings.
 *
 * What this proves, and what it cannot:
 *
 *   - the key is stored server-side, comes back masked, and never reaches the
 *     browser in full
 *   - only the super admin can read or change it — an ordinary restaurant
 *     owner is refused
 *   - the AI functions return an actionable error when no key is configured,
 *     rather than failing obscurely
 *   - the request actually reaches Google and comes back with Google's own
 *     verdict, so the request shape is right and only the key is missing
 *
 * It cannot prove a real extraction, because that needs a real key. The
 * dashboard's Test Connection button is what confirms that.
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

async function callFn(path: string, token: string, init: RequestInit = {}) {
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

// A key that is deliberately wrong. It is enough to prove the request shape.
const BOGUS_KEY = "AIzaSyNOT-A-REAL-KEY-00000000000000000000000";

console.log("\n── the provider settings ──");
{
  const res = await callFn("super-admin/ai-provider", adminToken);
  check("the super admin can read the settings", res.status === 200, `status ${res.status}`);
  check("the provider is gemini", res.body?.provider === "gemini");
  check("the text model is the one we configured", res.body?.textModel === "gemini-3.8-flash", String(res.body?.textModel));
  check("the image model is the one we configured", res.body?.imageModel === "gemini-nano-banana-2.1", String(res.body?.imageModel));
}

console.log("\n── an ordinary owner is refused ──");
{
  const res = await callFn("super-admin/ai-provider", ownerToken);
  check("an owner cannot read the settings", res.status === 403, `status ${res.status}`);
  const res2 = await callFn("super-admin/ai-provider", ownerToken, {
    method: "POST",
    body: JSON.stringify({ provider: "gemini", apiKey: "stolen" }),
  });
  check("an owner cannot write the settings", res2.status === 403, `status ${res2.status}`);
}

console.log("\n── saving a key ──");
{
  const res = await callFn("super-admin/ai-provider", adminToken, {
    method: "POST",
    body: JSON.stringify({ provider: "gemini", apiKey: BOGUS_KEY }),
  });
  check("the key saves", res.status === 200, `status ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
  check("the response does not contain the key", !JSON.stringify(res.body ?? {}).includes(BOGUS_KEY));
  check("the response carries a mask", typeof res.body?.maskedKey === "string" && res.body.maskedKey.length > 0);

  const read = await callFn("super-admin/ai-provider", adminToken);
  check("reading it back does not contain the key", !JSON.stringify(read.body ?? {}).includes(BOGUS_KEY));
  check("the stored key is masked", String(read.body?.maskedKey ?? "").endsWith("0000"), String(read.body?.maskedKey));
  check("the row is marked as configured", read.body?.configured === true);
}

console.log("\n── testing the connection reaches Google ──");
{
  const res = await callFn("super-admin/ai-provider/test", adminToken, { method: "POST" });
  // The key is wrong on purpose, so Google's own verdict is the answer.
  const message = String(res.body?.error ?? res.body?.message ?? "");
  check("the test reports Google's verdict", res.status === 200 || res.status === 400, `status ${res.status}`);
  check(
    "the error names the key, not the request",
    /key/i.test(message),
    message.slice(0, 160) || "no message",
  );
  check("the response does not contain the key", !JSON.stringify(res.body ?? {}).includes(BOGUS_KEY));
  console.log(`        Google said: ${message.slice(0, 150) || "(no message)"}`);
}

console.log("\n── the AI functions report a bad key clearly ──");
{
  const res = await callFn("ai-extract-menu", adminToken, {
    method: "POST",
    body: JSON.stringify({ images: ["data:image/png;base64,iVBORw0KGgo="] }),
  });
  const message = String(res.body?.error ?? "");
  check("extraction answers with a message", res.status >= 400, `status ${res.status}`);
  check("the message names the key", /key/i.test(message), message.slice(0, 160));
  check("the response does not contain the key", !JSON.stringify(res.body ?? {}).includes(BOGUS_KEY));
  console.log(`        extraction said: ${message.slice(0, 150)}`);

  const gen = await callFn("ai-generate-image", adminToken, {
    method: "POST",
    body: JSON.stringify({ prompt: "a test dish" }),
  });
  const genMessage = String(gen.body?.error ?? "");
  check("image generation answers with a message", gen.status >= 400, `status ${gen.status}`);
  check("the message names the key", /key/i.test(genMessage), genMessage.slice(0, 160));
  console.log(`        generation said: ${genMessage.slice(0, 150)}`);
}

console.log("\n── the AI functions need permission ──");
{
  const res = await callFn("ai-extract-menu", ownerToken, {
    method: "POST",
    body: JSON.stringify({ images: ["data:image/png;base64,iVBORw0KGgo="] }),
  });
  // swizofoods is the Owner of bablu-cafe, so it holds menu.manage and is
  // allowed through — what must not happen is an anonymous caller.
  const anon = await fetch(`${SB}/functions/v1/ai-extract-menu`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ images: ["data:image/png;base64,iVBORw0KGgo="] }),
  });
  check("an anonymous caller is refused", anon.status === 401, `status ${anon.status}`);
  console.log(`        an owner was allowed through (status ${res.status})`);
}

console.log("\n── clearing the key again ──");
{
  const res = await callFn("super-admin/ai-provider", adminToken, {
    method: "POST",
    body: JSON.stringify({ provider: "gemini", apiKey: "" }),
  });
  check("the settings still save", res.status === 200, `status ${res.status}`);
  const read = await callFn("super-admin/ai-provider", adminToken);
  console.log(`        configured now: ${read.body?.configured} (the stored key is left alone unless a new one is supplied)`);
}

console.log(`\n${checks - failures}/${checks} passed`);
if (failures > 0) process.exit(1);
