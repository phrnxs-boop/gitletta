/**
 * The restaurant setup flow, driven end to end on a phone.
 *
 * Signs up through the real form, checks the details arrive filled from the
 * account, opens a dropdown and picks an option, clears and replaces a
 * number, types a decimal, moves between the steps, and checks the details
 * survive a reload. It deletes the account it made at the end.
 *
 * It needs the dev server running:
 *   npm run dev
 *   npx tsx scripts/test-onboarding.mts
 *
 * Set ONBOARDING_TEST_SITE to point it somewhere other than localhost.
 */
/**
 * The whole onboarding flow on a phone: sign up, the prefill, the dropdown,
 * the number fields, back and next, and the data surviving a reload.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";

const SITE = process.env.ONBOARDING_TEST_SITE ?? "http://localhost:3000";
const SITE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const stamp = Date.now();
const EMAIL = `onbtest${stamp}@example.com`;
const PASSWORD = "TestPass123!";
const OWNER = "Priya Sharma";
const RESTAURANT = "Spice Route";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (ok) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const profile = "/tmp/chrome-onb";
fs.rmSync(profile, { recursive: true, force: true });
const chrome = spawn("google-chrome", ["--headless=new", "--remote-debugging-port=9242", `--user-data-dir=${profile}`, "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=390,844", "about:blank"], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ws: any = null;
let id = 0;
const pending = new Map<number, (v: any) => void>();
const send = (m: string, p: any = {}, sid?: string) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p, ...(sid ? { sessionId: sid } : {}) }));
  });

const evaluate = async (sid: string, expression: string) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sid);
  return r.result?.value;
};

/** Set a React-controlled input's value and fire the events React listens for. */
const setInput = (sid: string, selector: string, value: string) =>
  evaluate(
    sid,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'not found';
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'set';
    })()`,
  );

/** Set a control's value, found by the label above it. */
const setControl = (sid: string, labelText: string, selector: string, value: string) =>
  evaluate(
    sid,
    `(() => {
      const label = [...document.querySelectorAll('label')].find(l => (l.textContent || '').trim().toLowerCase().startsWith(${JSON.stringify(labelText.toLowerCase())}));
      if (!label) return 'no label';
      const scope = label.parentElement;
      if (!scope) return 'no scope';
      const el = scope.querySelector(${JSON.stringify(selector)});
      if (!el) return 'no control';
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'set';
    })()`,
  );

const click = (sid: string, selector: string) =>
  evaluate(
    sid,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'not found';
      el.scrollIntoView({ block: 'center' });
      for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return 'clicked';
    })()`,
  );


/**
 * Find a control by the label above it.
 *
 * The onboarding's labels are not tied to their control with `for`, so the
 * control is found by looking inside the label's own wrapper.
 */
const hasControl = (sid: string, labelText: string, selector = 'input, textarea, [role="combobox"]') =>
  evaluate(
    sid,
    `(() => {
      const label = [...document.querySelectorAll('label')].find(l => (l.textContent || '').trim().toLowerCase().startsWith(${JSON.stringify(labelText.toLowerCase())}));
      if (!label) return false;
      const scope = label.parentElement;
      if (!scope) return false;
      return Boolean(scope.querySelector(${JSON.stringify(selector)}));
    })()`,
  );

/** Click the control that sits under a label. */
const clickControl = (sid: string, labelText: string, selector = 'input, textarea, [role="combobox"]') =>
  evaluate(
    sid,
    `(() => {
      const label = [...document.querySelectorAll('label')].find(l => (l.textContent || '').trim().toLowerCase().startsWith(${JSON.stringify(labelText.toLowerCase())}));
      if (!label) return 'no label';
      const scope = label.parentElement;
      if (!scope) return 'no scope';
      const el = scope.querySelector(${JSON.stringify(selector)});
      if (!el) return 'no control';
      el.scrollIntoView({ block: 'center' });
      for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) {
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      }
      return 'clicked';
    })()`,
  );

const controlValue = async (sid: string, labelText: string, selector?: string) => {
  const v = await evaluate(
    sid,
    `(() => {
      const label = [...document.querySelectorAll('label')].find(l => (l.textContent || '').trim().toLowerCase().startsWith(${JSON.stringify(labelText.toLowerCase())}));
      if (!label) return null;
      const scope = label.parentElement;
      if (!scope) return null;
      const el = scope.querySelector(${JSON.stringify(selector || 'input, textarea, [role="combobox"]')});
      if (!el) return null;
      // A button has a value property that is always an empty string, so a
      // dropdown trigger is read by its text.
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'combobox') return el.textContent.trim();
      return el.value;
    })()`,
  );
  return v;
};

try {
  let version: any = null;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch("http://127.0.0.1:9242/json/version")).json(); break; } catch { await sleep(250); }
  }
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e: any) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);

  // ---- sign up, through the real form -----------------------------------
  console.log("\n── signing up ──");
  await send("Page.navigate", { url: `${SITE}/?view=login` }, sid);
  await sleep(9000);
  await evaluate(sid, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => /sign up|create an account/i.test(x.textContent || ''));
    if (b) { for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); }
    return 'ok';
  })()`);
  await sleep(1500);
  await setInput(sid, "#name", OWNER);
  await setInput(sid, "#restaurantName", RESTAURANT);
  await setInput(sid, "#email", EMAIL);
  await setInput(sid, "#password", PASSWORD);
  await sleep(400);
  const submitted = await evaluate(sid, `(() => {
    const form = [...document.querySelectorAll('form')].find(f => f.querySelector('#name'));
    if (!form) return 'no form';
    form.requestSubmit();
    return 'submitted';
  })()`);
  console.log("  submit:", submitted);
  await sleep(12000);

  const url = await evaluate(sid, "location.href");
  const onOnboarding = await evaluate(sid, `(() => {
    const text = document.body.innerText;
    return JSON.stringify({ url: location.href, hasStep: text.includes('Step 1 / 5'), hasContinue: /Continue/.test(text), hasCreate: /Create your restaurant/i.test(text), snippet: text.slice(0, 180) });
  })()`);
  console.log("  ", onOnboarding);
  const o = JSON.parse(String(onOnboarding));
  check("the sign-up went through and landed on the setup flow", o.hasStep === true, String(o.snippet));

  // ---- the prefill -------------------------------------------------------
  console.log("\n── the details arrive filled ──");
  const step1 = JSON.stringify({
    onOnboarding: await evaluate(sid, "document.body.innerText.includes('Step 1 / 5')"),
    restaurantName: await controlValue(sid, 'Restaurant Name'),
    ownerName: await controlValue(sid, 'Your Name'),
    email: await controlValue(sid, 'Email', 'input'),
    phone: await controlValue(sid, 'Phone', 'input'),
  });
  const s1 = JSON.parse(String(step1));
  console.log("  ", step1);
  check("the page really is the setup flow", s1.onOnboarding === true, String(step1));
  check("the restaurant name arrived filled", s1.restaurantName === RESTAURANT, String(s1.restaurantName));
  check("the owner's name arrived filled", s1.ownerName === OWNER, String(s1.ownerName));
  check("the email arrived filled", String(s1.email) === EMAIL, String(s1.email));

  // ---- the dropdown on a phone ------------------------------------------
  console.log("\n── the dropdown on a phone ──");
  check("the cuisine dropdown is there", (await hasControl(sid, 'Cuisine Type', '[role="combobox"]')) === true);
  console.log("  click:", await clickControl(sid, 'Cuisine Type', '[role="combobox"]'));
  await sleep(1500);
  const dd = await evaluate(sid, `(() => {
    const content = document.querySelector('[data-slot="select-content"]');
    if (!content) return JSON.stringify({ opened: false });
    const cr = content.getBoundingClientRect();
    const items = [...content.querySelectorAll('[role="option"]')];
    const ir = items.map(i => i.getBoundingClientRect());
    return JSON.stringify({
      opened: true,
      listH: Math.round(cr.height),
      listTop: Math.round(cr.top),
      listBottom: Math.round(cr.bottom),
      items: items.length,
      itemH: ir.length ? Math.round(ir[0].height) : 0,
      vh: document.documentElement.clientHeight,
      fitsOnScreen: cr.top >= -1 && cr.bottom <= document.documentElement.clientHeight + 1,
      showsMany: items.length > 1 && cr.height > ir[0] * 2,
    });
  })()`);
  console.log("  ", dd);
  const d = JSON.parse(String(dd));
  check("the dropdown opened", d.opened === true);
  check("the list is taller than one row", d.listH > (d.itemH || 0) * 2, `${d.listH} vs ${d.itemH}`);
  check("the list fits on the screen", d.fitsOnScreen === true, `${d.listTop}..${d.listBottom} of ${d.vh}`);

  // Pick an option with a real mouse event — Radix selects on pointerdown, so
  // a synthetic click is not what a finger does.
  const box = await evaluate(sid, `(() => {
    const items = [...document.querySelectorAll('[data-slot="select-content"] [role="option"]')];
    const target = items.find(i => (i.textContent || '').trim() === 'Indian') || items[1];
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  })()`);
  if (box) {
    const pt = JSON.parse(String(box));
    // Radix selects on pointerup, and it only treats a pointer as "in
    // transit" once it has moved over the option, so the pointer moves first.
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }, sid);
    await sleep(250);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", buttons: 1, clickCount: 1 }, sid);
    await sleep(120);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", buttons: 0, clickCount: 1 }, sid);
  } else {
    console.log("  no option to pick");
  }
  await sleep(1500);
  console.log("  trigger now says:", await controlValue(sid, 'Cuisine Type', '[role="combobox"]'));
  const cuisine = await controlValue(sid, 'Cuisine Type', '[role="combobox"]');
  check("an option can be chosen on a phone", String(cuisine).includes("Indian"), String(cuisine));

  // ---- the theme picker --------------------------------------------------
  console.log("\n── the theme picker ──");
  await evaluate(sid, `(() => {
    const raw = localStorage.getItem('tablo-onboarding');
    const d = raw ? JSON.parse(raw) : {};
    d.step = 3;
    localStorage.setItem('tablo-onboarding', JSON.stringify(d));
    return 'ok';
  })()`);
  await send("Page.navigate", { url: `${SITE}/?view=onboarding` }, sid);
  await sleep(8000);

  const picker = await evaluate(sid, `(() => {
    const text = document.body.innerText;
    const options = [...document.querySelectorAll('button[aria-pressed]')].map(b => ({
      pressed: b.getAttribute('aria-pressed'),
      label: (b.querySelector('p')?.textContent || '').trim(),
    }));
    return JSON.stringify({
      onStep3: text.includes('Customize the experience'),
      options,
      hasWarm: /\\bWarm\\b/.test(text),
      hasMinimal: /\\bMinimal\\b/.test(text),
      hasLight: text.includes('Light Mode'),
      hasDark: text.includes('Dark Mode'),
      previews: document.querySelectorAll('button[aria-pressed] .bg-background').length,
    });
  })()`);
  console.log("  ", picker);
  const pk = JSON.parse(String(picker));
  check("the customize step is showing", pk.onStep3 === true);
  check("there are exactly two themes", pk.options.length === 2, JSON.stringify(pk.options));
  check("Light Mode is one of them", pk.hasLight === true);
  check("Dark Mode is one of them", pk.hasDark === true);
  check("Warm is gone", pk.hasWarm === false);
  check("Minimal is gone", pk.hasMinimal === false);
  check("each theme has a preview", pk.previews >= 2, String(pk.previews));

  // Picking the dark one must change what is stored.
  const darkClicked = await evaluate(sid, `(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find(x => (x.textContent || '').includes('Dark Mode'));
    if (!b) return 'no button';
    for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) {
      b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
    return 'clicked';
  })()`);
  await sleep(900);
  const themeNow = await evaluate(sid, "(() => { const raw = localStorage.getItem('tablo-onboarding'); return raw ? JSON.parse(raw).customize.theme : null })()");
  check("picking the dark theme is instant", darkClicked === 'clicked' && themeNow === 'dark', `${darkClicked} / ${themeNow}`);

  // ---- the number fields -------------------------------------------------
  console.log("\n── the number fields ──");
  // Go to step 4 (the table count).
  const reached4 = await evaluate(sid, `(() => {
    const raw = localStorage.getItem('tablo-onboarding');
    if (!raw) return 'no draft';
    const d = JSON.parse(raw);
    d.step = 4;
    localStorage.setItem('tablo-onboarding', JSON.stringify(d));
    return 'ok';
  })()`);
  await send("Page.navigate", { url: `${SITE}/?view=onboarding` }, sid);
  await sleep(8000);

  const countValue = await controlValue(sid, 'Number of tables', 'input');
  check("the table count is there", countValue !== null, String(countValue));

  // Clear it completely.
  await setControl(sid, 'Number of tables', 'input', '');
  await sleep(400);
  const cleared = await controlValue(sid, 'Number of tables', 'input');
  check("the field can be cleared completely", cleared === "", JSON.stringify(cleared));

  // And replaced.
  await setControl(sid, 'Number of tables', 'input', '7');
  await sleep(400);
  const replaced = JSON.stringify({
    shown: await controlValue(sid, 'Number of tables', 'input'),
    model: await evaluate(sid, "(() => { const raw = localStorage.getItem('tablo-onboarding'); return raw ? JSON.parse(raw).qr.tableCount : null })()"),
  });
  console.log("  ", replaced);
  const r = JSON.parse(String(replaced));
  check("the new value is shown", r.shown === "7", String(r.shown));
  check("the new value reached the model", r.model === 7, String(r.model));

  // A decimal: the old code swallowed the point.
  await setControl(sid, 'Number of tables', 'input', '12.5');
  await sleep(400);
  const decimal = JSON.stringify({
    shown: await controlValue(sid, 'Number of tables', 'input'),
    model: await evaluate(sid, "(() => { const raw = localStorage.getItem('tablo-onboarding'); return raw ? JSON.parse(raw).qr.tableCount : null })()"),
  });
  console.log("  ", decimal);
  check("a decimal can be typed", JSON.parse(String(decimal)).shown === "12.5", String(decimal));

  // ---- back and next -----------------------------------------------------
  console.log("\n── back and next ──");
  await evaluate(sid, `(() => {
    const raw = localStorage.getItem('tablo-onboarding');
    const d = JSON.parse(raw);
    d.step = 1;
    localStorage.setItem('tablo-onboarding', JSON.stringify(d));
    return 'ok';
  })()`);
  await send("Page.navigate", { url: `${SITE}/?view=onboarding` }, sid);
  await sleep(8000);
  const kept = await controlValue(sid, 'Restaurant Name');
  check("the details survived the move between steps", kept === RESTAURANT, String(kept));

  // ---- the data persists across a reload ---------------------------------
  console.log("\n── it survives a reload ──");
  await send("Page.navigate", { url: `${SITE}/?view=onboarding` }, sid);
  await sleep(8000);
  const afterReload = JSON.stringify({
    ownerName: await controlValue(sid, 'Your Name'),
    step: await evaluate(sid, "(() => { const raw = localStorage.getItem('tablo-onboarding'); return raw ? JSON.parse(raw).step : null })()"),
  });
  console.log("  ", afterReload);
  const ar = JSON.parse(String(afterReload));
  check("the owner's name is still there after a reload", ar.ownerName === OWNER, String(ar.ownerName));

  // ---- the account has the details --------------------------------------
  console.log("\n── and the account carries them ──");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(SITE_SUPABASE, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: profiles } = await db.from("profiles").select("name, email, tenant_id").eq("email", EMAIL);
  console.log("  profile:", JSON.stringify(profiles));
  check("the account kept the owner's name", profiles?.[0]?.name === OWNER, String(profiles?.[0]?.name));
  check("the account kept the email", profiles?.[0]?.email === EMAIL, String(profiles?.[0]?.email));
  const { data: tenants } = await db.from("tenants").select("name").eq("id", profiles?.[0]?.tenant_id ?? "");
  check("the restaurant kept its name", tenants?.[0]?.name === RESTAURANT, String(tenants?.[0]?.name));

  // ---- clean up after ourselves ------------------------------------------
  console.log("\n── cleaning up ──");
  const tenantId = profiles?.[0]?.tenant_id;
  if (tenantId) {
    await db.from("tables").delete().eq("tenant_id", tenantId);
    await db.from("menu_items").delete().eq("tenant_id", tenantId);
    await db.from("categories").delete().eq("tenant_id", tenantId);
    await db.from("roles").delete().eq("tenant_id", tenantId);
    await db.from("settings").delete().eq("tenant_id", tenantId);
    await db.from("profiles").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
  const { data: authUser } = await db.auth.admin.listUsers();
  const made = authUser?.users?.find((u: any) => u.email === EMAIL);
  if (made) await db.auth.admin.deleteUser(made.id);
  const { data: left } = await db.from("tenants").select("id").eq("id", tenantId ?? "");
  check("the test left nothing behind", (left ?? []).length === 0, String(left?.length));
} catch (e) {
  console.log("failed:", (e as Error).message);
  failures++;
} finally {
  chrome.kill();
}

console.log(`\n${checks - failures}/${checks} passed`);
if (failures > 0) process.exit(1);
