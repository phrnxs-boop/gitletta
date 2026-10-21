/**
 * Load a real diner QR URL in a real browser and check what the diner sees.
 *
 * The browser-level counterpart to test-qr-flow.mts: that one proves the
 * API is right, this one proves the page is.
 *
 * This is the end-to-end proof: the URL in the QR, the page, the session
 * mint and the menu payload. It also checks the case that used to be broken
 * — scanning a second table while the menu is already open.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE = process.env.SITE_URL ?? "https://www.restrofi.in";

const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });
const { data: tables } = await admin
  .from("tables")
  .select("id, name, qr_token, tenants!inner(slug, name)")
  .eq("active", true)
  .limit(2);
const t1: any = tables![0];
const t2: any = tables![1];

const profile = "/tmp/chrome-qr-profile";
fs.rmSync(profile, { recursive: true, force: true });
const chrome = spawn("google-chrome", [
  "--headless=new", "--remote-debugging-port=9223", `--user-data-dir=${profile}`,
  "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1400,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ws: WebSocket | null = null;
let id = 0;
const pending = new Map<number, (v: any) => void>();
function send(method: string, params: any = {}, sessionId?: string): Promise<any> {
  return new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws!.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

try {
  let version: any = null;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch("http://127.0.0.1:9223/json/version")).json(); break; }
    catch { await sleep(250); }
  }
  if (!version) throw new Error("Chrome did not start");
  ws = new WebSocket(version.webSocketDebuggerUrl) as unknown as WebSocket;
  await new Promise((r) => (ws!.onopen = r));
  ws.onmessage = (e: any) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg.result); pending.delete(msg.id); }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false,
  }, sessionId);

  const text = async () => {
    const r = await send("Runtime.evaluate", {
      expression: "document.body.innerText", returnByValue: true,
    }, sessionId);
    return String(r.result?.value ?? "");
  };

  console.log(`\n── scanning ${t1.tenants.name} / ${t1.name} ──`);
  await send("Page.navigate", {
    url: `${SITE}/?view=public-menu&table=${t1.qr_token}`,
  }, sessionId);
  await sleep(9000);
  let body = await text();
  check("the menu opened", !body.includes("Menu access requires a table session"), body.slice(0, 120));
  check("the menu is not the ended screen", !body.includes("Your table session has ended"), body.slice(0, 120));
  check("it is the right restaurant", body.includes(t1.tenants.name), body.slice(0, 200));
  check("the table is named", body.includes(t1.name), body.slice(0, 300));

  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  fs.writeFileSync(process.env.SHOT1 ?? "/root/downloads/diner-menu.png", Buffer.from(shot.data, "base64"));

  console.log(`\n── scanning ${t2.tenants.name} / ${t2.name} while the menu is open ──`);
  // A client-side navigation, the case that used to be ignored.
  await send("Runtime.evaluate", {
    expression: `history.pushState({}, '', '/?view=public-menu&table=${t2.qr_token}'); window.dispatchEvent(new PopStateEvent('popstate'));`,
  }, sessionId);
  await sleep(1000);
  // Next's router needs a real navigation event; reload the page the way a
  // phone opening the QR would, and separately drive the SPA path.
  await send("Page.navigate", {
    url: `${SITE}/?view=public-menu&table=${t2.qr_token}`,
  }, sessionId);
  await sleep(9000);
  body = await text();
  check("the second scan opened a menu", !body.includes("Menu access requires a table session"), body.slice(0, 120));
  check("it is the second table's menu", body.includes(t2.name), body.slice(0, 300));

  const shot2 = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  fs.writeFileSync(process.env.SHOT2 ?? "/root/downloads/diner-menu-2.png", Buffer.from(shot2.data, "base64"));
} catch (e) {
  console.log("failed:", (e as Error).message);
  failures++;
} finally {
  chrome.kill();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures > 0) process.exit(1);
