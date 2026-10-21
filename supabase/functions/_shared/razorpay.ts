// deno-lint-ignore-file no-explicit-any
import { admin } from "./db.ts";

/**
 * Razorpay client.
 *
 * The key id and the key secret are read from the function's own environment
 * and never leave it. Nothing here returns a secret, and nothing here is
 * called from the browser — the browser asks the edge function to create a
 * subscription and receives an id, a plan and an amount.
 *
 * Two signatures matter:
 *
 *   - the payment signature, which proves the browser really was talking to
 *     Razorpay about this order and this payment. It is checked before a
 *     subscription is activated.
 *   - the webhook signature, which proves the event really came from
 *     Razorpay. It is checked against the raw body, because re-serialising
 *     the JSON would change the bytes and break the comparison.
 */

export const RAZORPAY_API = "https://api.razorpay.com/v1";

export type RazorpayConfig = {
  keyId: string | null;
  keySecret: string | null;
  /** The secret Razorpay signs webhooks with. Falls back to the key secret. */
  webhookSecret: string | null;
};

export function razorpayConfig(): RazorpayConfig {
  return {
    keyId: (Deno.env.get("RAZORPAY_KEY_ID") ?? "").trim() || null,
    keySecret: (Deno.env.get("RAZORPAY_KEY_SECRET") ?? "").trim() || null,
    webhookSecret: (Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "").trim() || null,
  };
}

export function razorpayConfigured(): boolean {
  const c = razorpayConfig();
  return Boolean(c.keyId && c.keySecret);
}

function authHeader(): string {
  const { keyId, keySecret } = razorpayConfig();
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as edge function secrets.",
    );
  }
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

/** HMAC-SHA256 of a message, hex encoded — the form Razorpay uses. */
export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check the signature Razorpay returns after the checkout.
 *
 * The signed string is the order id and the payment id, joined by a pipe.
 * This is what proves the payment really is for this order — without it, a
 * browser could post any payment id it liked and have a subscription
 * activated.
 */
export async function verifyPaymentSignature(opts: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { keySecret } = razorpayConfig();
  if (!keySecret) {
    return { ok: false, error: "Razorpay is not configured on the server." };
  }
  if (!opts.razorpayOrderId || !opts.razorpayPaymentId || !opts.razorpaySignature) {
    return { ok: false, error: "The payment details are incomplete." };
  }

  const expected = await hmacSha256Hex(
    `${opts.razorpayOrderId}|${opts.razorpayPaymentId}`,
    keySecret,
  );

  if (!timingSafeEqual(expected, opts.razorpaySignature)) {
    return { ok: false, error: "The payment signature did not match. The payment was not accepted." };
  }
  return { ok: true };
}

/**
 * Check the signature on a webhook event.
 *
 * The signature is over the raw body, so the body is read as text and
 * verified before it is parsed.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = razorpayConfig();
  const secret = config.webhookSecret ?? config.keySecret;
  if (!secret) {
    return { ok: false, error: "Razorpay is not configured on the server." };
  }
  if (!signature) {
    return { ok: false, error: "The webhook had no signature." };
  }

  const expected = await hmacSha256Hex(rawBody, secret);
  if (!timingSafeEqual(expected, signature)) {
    return { ok: false, error: "The webhook signature did not match." };
  }
  return { ok: true };
}

export type RazorpaySubscription = {
  id: string;
  status: string;
  plan_id: string;
  total_count?: number;
  current_start?: number;
  current_end?: number;
  customer_id?: string;
  notes?: Record<string, string>;
};

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  notes?: Record<string, string>;
};

async function razorpayRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  let res: Response;
  try {
    res = await fetch(`${RAZORPAY_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach Razorpay: ${(e as Error).message}`, status: 0 };
  }

  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!res.ok) {
    const message = body?.error?.description || body?.message || `Razorpay answered ${res.status}`;
    return { ok: false, error: message, status: res.status };
  }
  return { ok: true, data: body as T };
}

/**
 * Create a subscription for a plan.
 *
 * The plan id is the one Razorpay knows, which comes from the plan
 * catalogue and is set by the Super Admin — it cannot be invented here.
 */
export async function createSubscription(opts: {
  razorpayPlanId: string;
  totalCount: number;
  customer: { name: string; email: string };
  notes: Record<string, string>;
}): Promise<{ ok: true; data: RazorpaySubscription } | { ok: false; error: string }> {
  const res = await razorpayRequest<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: opts.razorpayPlanId,
      total_count: opts.totalCount,
      quantity: 1,
      customer_notify: 1,
      notes: opts.notes,
    },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data };
}

/** Create the order the checkout is started against. */
export async function createOrder(opts: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ ok: true; data: RazorpayOrder } | { ok: false; error: string }> {
  const res = await razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: Math.round(opts.amount * 100), // Razorpay works in paise
      currency: opts.currency,
      receipt: opts.receipt,
      notes: opts.notes,
    },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data };
}

export async function fetchSubscription(
  id: string,
): Promise<{ ok: true; data: RazorpaySubscription } | { ok: false; error: string }> {
  const res = await razorpayRequest<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(id)}`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data };
}

export async function cancelSubscription(
  id: string,
  cancelAtCycleEnd: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await razorpayRequest<unknown>(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: cancelAtCycleEnd },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/**
 * The restaurant a Razorpay subscription belongs to.
 *
 * The tenant id travels in the subscription's notes, which Razorpay echoes
 * back on every webhook. The webhook itself is signed, so the notes cannot
 * be forged by anyone else.
 */
export async function tenantFromNotes(
  notes: Record<string, string> | undefined | null,
): Promise<string | null> {
  const tenantId = notes?.tenant_id ?? notes?.tenantId ?? null;
  if (!tenantId) return null;
  const { data } = await admin()
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.id ?? null;
}
