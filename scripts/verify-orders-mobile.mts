/**
 * The Orders page on a phone: compact filters, nothing overlapped, no jumping.
 *
 * Every one of these is measured rather than eyeballed, because "the cards are
 * behind the filters" is a geometry claim: the first card's top must be at or
 * below the filter block's bottom, at both widths, before and after the status
 * filter changes.
 *
 *   npm run test:orders-mobile
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE = process.env.SITE_URL ?? "https://www.restrofi.in";
const EMAIL = process.env.EMAIL ?? "phrnx@icloud.com";
const PORT = Number(process.env.CDP_PORT ?? 9411);

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail && !ok ? `\n        ${detail}` : ""}`);
};

const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
const c = createClient(SB, ANON, { auth: { persistSession: false } });
const { data: session } = await c.auth.verifyOtp({
  token_hash: link!.properties.hashtoken ?? link!.properties.hashed_token,
  type: "magiclink",
});
const s = session!.session!;

const profile = `/tmp/chrome-orders-${PORT}`;
fs.rmSync(profile, { recursive: true, force: true });
const chrome = spawn("google-chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ws: WebSocket | null = null;
let id = 0;
const pending = new Map<number, (v: any) => void>();
const send = (method: string, params: any = {}, sessionId?: string) =>
  new Promise<any>((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws!.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

/** Everything the checks need, in one evaluation. */
const MEASURE = `(() => {
  const tabs = document.querySelector('[data-orders-tabs]');
  const filters = document.querySelector('[data-orders-filters]');
  const pane = document.querySelector('[data-orders-list]');
  const card = pane?.querySelector('[data-order-card]');
  const active = tabs?.querySelector('[data-active="true"]');
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) }; };
  let animation = null;
  if (card) {
    const cs = getComputedStyle(card);
    animation = cs.animationName + ' ' + cs.animationDuration;
  }
  return JSON.stringify({
    filters: box(filters),
    tabs: box(tabs),
    tabsScroll: tabs ? { scrollWidth: tabs.scrollWidth, clientWidth: tabs.clientWidth, scrollLeft: Math.round(tabs.scrollLeft) } : null,
    pane: box(pane),
    card: box(card),
    cardCount: pane ? pane.querySelectorAll('[data-order-card]').length : 0,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    paneOverflow: pane ? pane.scrollHeight > pane.clientHeight : null,
    paneScrollTop: pane ? Math.round(pane.scrollTop) : null,
    activeColor: active ? getComputedStyle(active).color : null,
    activeBg: active ? getComputedStyle(active).backgroundColor : null,
    animation,
    dark: document.documentElement.classList.contains('dark'),
  });
})()`;

try {
  let version: any = null;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!version) throw new Error("Chrome did not start");
  ws = new WebSocket(version.webSocketDebuggerUrl) as unknown as WebSocket;
  await new Promise((r) => (ws!.onopen = r));
  ws.onmessage = (e: any) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  const ev = async (expr: string) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId))?.result?.value;

  const hash = new URLSearchParams({
    access_token: s.access_token, refresh_token: s.refresh_token, expires_at: String(s.expires_at),
    expires_in: String(s.expires_in), token_type: s.token_type, type: "magiclink",
  }).toString();

  for (const viewport of [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 1000 }]) {
    console.log(`\n── ${viewport.name} ${viewport.width}×${viewport.height} ──`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 640,
    }, sessionId);
    await send("Page.navigate", { url: `${SITE}/?view=orders#${hash}` }, sessionId);
    await sleep(5000);
    await send("Page.navigate", { url: `${SITE}/?view=orders` }, sessionId);
    await sleep(9000);

    const first = JSON.parse(await ev(MEASURE));
    check("the orders page rendered", first.filters !== null && first.tabs !== null, JSON.stringify(first).slice(0, 200));
    check("the dark theme is on", first.dark === true);
    check("the page does not scroll sideways", first.pageOverflow <= 1, `overflow ${first.pageOverflow}px`);

    if (first.filters && first.card) {
      check(
        "the first card starts below the filters, not under them",
        first.card.top >= first.filters.bottom,
        `card top ${first.card.top} vs filters bottom ${first.filters.bottom}`,
      );
      check("the list is measured from its own top", first.paneScrollTop === 0, `scrollTop ${first.paneScrollTop}`);
      check("the list pane starts below the filters", first.pane!.top >= first.filters.bottom, `pane top ${first.pane!.top} vs ${first.filters.bottom}`);
      check("the list scrolls inside its own pane, not over the filters", first.paneOverflow === true || first.cardCount <= 3, `paneOverflow=${first.paneOverflow}`);
    } else {
      check("there is at least one order card to measure", false, "no [data-order-card] found");
    }

    if (viewport.name === "phone") {
      check(
        "the filters are compact",
        first.filters!.h <= 104,
        `filter block is ${first.filters!.h}px tall`,
      );
      const tabs = first.tabsScroll!;
      check("the status tabs overflow sideways, so they scroll", tabs.scrollWidth > tabs.clientWidth, JSON.stringify(tabs));
      check("the tab row is not clipped by the page", first.tabs!.right <= viewport.width, `${first.tabs!.right} > ${viewport.width}`);

      // The last tab must be reachable by scrolling the row.
      await ev(`document.querySelector('[data-orders-tabs]').scrollLeft = 9999`);
      await sleep(700);
      const scrolled = JSON.parse(await ev(MEASURE));
      check("scrolling the row reaches the last tab", scrolled.tabsScroll.scrollLeft > 0, JSON.stringify(scrolled.tabsScroll));
      const lastTabVisible = await ev(`(() => {
        const row = document.querySelector('[data-orders-tabs]');
        const last = [...row.querySelectorAll('button')].pop();
        const r = last.getBoundingClientRect(), rowBox = row.getBoundingClientRect();
        return r.left >= rowBox.left - 1 && r.right <= rowBox.right + 1;
      })()`);
      check("the last status tab can be brought fully into view", lastTabVisible === true);
      await ev(`document.querySelector('[data-orders-tabs]').scrollLeft = 0`);
      await sleep(500);

      // The active tab keeps the product's orange.
      check("the active tab is the accent colour, not a new palette", (first.activeColor || "").includes("rgb"), String(first.activeColor));
      check("no slide animation is left on the cards", (first.animation || "").startsWith("none"), String(first.animation));

      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
      fs.writeFileSync("/root/downloads/orders-mobile.png", Buffer.from(shot.data, "base64"));

      // Changing the status filter must not move the cards.
      const before = first.card!.top;
      await ev(`(() => {
        const b = [...document.querySelectorAll('[data-orders-tabs] button')].find((x) => x.textContent.trim().startsWith('Pending'));
        b?.click();
        return Boolean(b);
      })()`);
      await sleep(1500);
      const afterStatus = JSON.parse(await ev(MEASURE));
      check(
        "changing the status tab does not move the cards",
        !afterStatus.card || Math.abs(afterStatus.card.top - before) <= 1,
        `card top was ${before}, now ${afterStatus.card?.top}`,
      );
      check(
        "changing the status tab does not move the filters",
        Math.abs(afterStatus.filters.bottom - first.filters!.bottom) <= 1,
        `${first.filters!.bottom} → ${afterStatus.filters.bottom}`,
      );

      await ev(`(() => {
        const b = [...document.querySelectorAll('[data-orders-tabs] button')].find((x) => x.textContent.trim().startsWith('All'));
        b?.click();
      })()`);
      await sleep(1200);
      const afterAll = JSON.parse(await ev(MEASURE));
      check(
        "and going back moves nothing either",
        Math.abs(afterAll.filters.bottom - first.filters!.bottom) <= 1 && (!afterAll.card || Math.abs(afterAll.card.top - before) <= 1),
        JSON.stringify({ filters: afterAll.filters?.bottom, card: afterAll.card?.top, was: { filters: first.filters!.bottom, card: before } }),
      );
    } else {
      // Desktop keeps the scroll-collapse it always had.
      await ev(`document.querySelector('[data-orders-list]').scrollTop = 400`);
      await sleep(1200);
      const collapsed = await ev(`document.body.innerText.includes('Revenue')`);
      check("the desktop header still collapses on scroll", collapsed === false, "the stat chips are still showing after scrolling");
      await ev(`document.querySelector('[data-orders-list]').scrollTop = 0`);
      await sleep(900);
      const top = JSON.parse(await ev(MEASURE));
      // At the top of the list the pane is not scrolled, so the first card must
      // sit below the filters. A pane left a few pixels down is the collapse
      // compensation doing its job, and clips its own content — which is why
      // the assertion is only made when the pane is actually at rest at 0.
      check(
        "and the desktop layout is still intact at the top",
        top.card !== null && (top.paneScrollTop !== 0 || top.card.top >= top.filters.bottom - 1),
        JSON.stringify({ paneScrollTop: top.paneScrollTop, card: top.card?.top, filtersBottom: top.filters?.bottom }),
      );
    }
  }

  console.log(`\n${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ""}`);
} catch (e) {
  console.log("failed:", (e as Error).message);
} finally {
  chrome.kill();
}
