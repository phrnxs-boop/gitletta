// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";
import {
  planCatalogue,
  resolvePlan,
  type EffectivePlan,
} from "../_shared/plans.ts";
import {
  cancelSubscription,
  createOrder,
  createSubscription,
  razorpayConfigured,
  razorpayConfig,
  verifyPaymentSignature,
} from "../_shared/razorpay.ts";

/**
 * /functions/v1/subscriptions
 *
 *   GET    state          the plan in force, the trial dates, the catalogue
 *   POST   checkout       create a Razorpay subscription and an order
 *   POST   verify         check the payment signature and activate the plan
 *   POST   upgrade        move to another plan
 *   POST   cancel         cancel the subscription at the end of the period
 *
 * Everything that changes a restaurant's plan happens here, on the server,
 * and only after a signature has been checked. The browser never tells the
 * server that a payment succeeded — it tells the server which payment to
 * check, and the server decides.
 */

const MONTHS = 12;

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "subscriptions");
  const action = segments[0] ?? "state";

  try {
    // The webhook has its own function and its own signature check, so
    // everything here is an owner acting on their own restaurant.
    const g = await guard(req, { permission: "settings.manage" });
    if (!g.ok) return g.response;
    // Billing is the owner's business. A member of staff may have the
    // settings permission, but they do not get to buy the restaurant a plan
    // or read its payment history.
    if (g.session.kind !== "owner") {
      return json(req, { error: "Only the restaurant owner can manage billing." }, 403);
    }
    const tenantId = g.session.tenantId;

    switch (action) {
      case "state":
        if (req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);
        return await state(req, tenantId);
      case "checkout":
        if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
        return await checkout(req, tenantId);
      case "verify":
        if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
        return await verify(req, tenantId);
      case "upgrade":
        if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
        return await upgrade(req, tenantId);
      case "cancel":
        if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
        return await cancel(req, tenantId);
      default:
        return json(req, { error: "Not found" }, 404);
    }
  } catch (err) {
    console.error("subscriptions error:", err);
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

/** The restaurant as the billing page sees it. */
async function state(req: Request, tenantId: string): Promise<Response> {
  const plan = await resolvePlan(tenantId);
  const catalogue = await planCatalogue();
  const { data: tenant } = await admin()
    .from("tenants")
    .select("name, email")
    .eq("id", tenantId)
    .maybeSingle();

  const { data: payments } = await admin()
    .from("subscription_payments")
    .select(
      "id, amount, currency, status, plan_id, billing_period, created_at, razorpay_payment_id, failure_reason",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(12);

  return json(req, {
    plan: publicPlan(plan),
    plans: catalogue,
    restaurant: { name: tenant?.name ?? null, email: tenant?.email ?? null },
    razorpayConfigured: razorpayConfigured(),
    payments: payments ?? [],
  });
}

/** The part of the plan the browser is allowed to see. */
function publicPlan(plan: EffectivePlan) {
  return {
    planId: plan.planId,
    planName: plan.planName,
    status: plan.status,
    isPaid: plan.isPaid,
    isTrial: plan.isTrial,
    isRestricted: plan.isRestricted,
    trialStartedAt: plan.trialStartedAt,
    trialEndsAt: plan.trialEndsAt,
    trialDaysRemaining: plan.trialDaysRemaining,
    subscriptionPlan: plan.subscriptionPlan,
    subscriptionStartedAt: plan.subscriptionStartedAt,
    currentPeriodEnd: plan.currentPeriodEnd,
    cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
    limits: plan.limits,
    features: plan.features,
    priceMonthly: plan.priceMonthly,
    currency: plan.currency,
  };
}

/**
 * Create a subscription and an order for the checkout.
 *
 * The plan id is Razorpay's own, which comes from the plan catalogue and is
 * set by the Super Admin. If it is not set, the answer says exactly what is
 * missing rather than failing somewhere inside Razorpay.
 */
async function checkout(req: Request, tenantId: string): Promise<Response> {
  const b = await body(req);
  const planId = String(b.planId ?? "").trim();
  if (!planId) return json(req, { error: "planId is required" }, 400);

  if (!razorpayConfigured()) {
    return json(
      req,
      {
        error:
          "Payments are not set up on the server yet. The Super Admin has to add the Razorpay keys first.",
      },
      503,
    );
  }

  const db = admin();
  const { data: planRow } = await db
    .from("subscription_plans")
    .select("id, name, price_monthly, currency, razorpay_plan_id, is_active")
    .eq("id", planId)
    .maybeSingle();

  if (!planRow) return json(req, { error: "That plan does not exist." }, 404);
  if (!planRow.is_active) return json(req, { error: "That plan is not available." }, 400);
  if (!planRow.razorpay_plan_id) {
    return json(
      req,
      {
        error: `The Razorpay plan for ${planRow.name} has not been set yet. The Super Admin has to add it.`,
      },
      503,
    );
  }

  const { data: tenant } = await db
    .from("tenants")
    .select("name, email")
    .eq("id", tenantId)
    .maybeSingle();
  const { data: profile } = await db
    .from("profiles")
    .select("email, full_name")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  const notes = {
    tenant_id: tenantId,
    plan_id: planId,
    restaurant: tenant?.name ?? "Restaurant",
  };

  const subscription = await createSubscription({
    razorpayPlanId: planRow.razorpay_plan_id,
    totalCount: MONTHS,
    customer: {
      name: tenant?.name ?? profile?.full_name ?? "Restaurant",
      email: profile?.email ?? tenant?.email ?? "",
    },
    notes,
  });
  if (!subscription.ok) {
    return json(req, { error: `Razorpay would not create the subscription: ${subscription.error}` }, 400);
  }

  const order = await createOrder({
    amount: Number(planRow.price_monthly),
    currency: planRow.currency ?? "INR",
    receipt: `sub_${subscription.data.id}`.slice(0, 40),
    notes: { ...notes, subscription_id: subscription.data.id },
  });
  if (!order.ok) {
    return json(req, { error: `Razorpay would not create the order: ${order.error}` }, 400);
  }

  // Remember the subscription before the payment, so the webhook can find the
  // restaurant even if the browser never comes back.
  await db
    .from("tenants")
    .update({ razorpay_subscription_id: subscription.data.id })
    .eq("id", tenantId);

  return json(req, {
    keyId: razorpayConfig().keyId,
    razorpaySubscriptionId: subscription.data.id,
    razorpayOrderId: order.data.id,
    amount: Number(planRow.price_monthly),
    currency: planRow.currency ?? "INR",
    planId: planRow.id,
    planName: planRow.name,
  });
}

/**
 * Check the payment and activate the plan.
 *
 * The browser sends what Razorpay gave it. The server recomputes the
 * signature with its own secret and compares. If it does not match, nothing
 * changes — a restaurant cannot activate a plan by saying it paid.
 */
async function verify(req: Request, tenantId: string): Promise<Response> {
  const b = await body(req);
  const razorpayOrderId = String(b.razorpayOrderId ?? "");
  const razorpayPaymentId = String(b.razorpayPaymentId ?? "");
  const razorpaySignature = String(b.razorpaySignature ?? "");
  const razorpaySubscriptionId = String(b.razorpaySubscriptionId ?? "");

  const check = await verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });
  if (!check.ok) {
    return json(req, { error: check.error, activated: false }, 400);
  }

  const db = admin();

  // The order has to be one of ours. The signature proves the payment is
  // genuine; this proves it is for this restaurant's order.
  const { data: order } = await admin()
    .from("subscription_payments")
    .select("id, tenant_id, plan_id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  const { data: tenant } = await db
    .from("tenants")
    .select("razorpay_subscription_id")
    .eq("id", tenantId)
    .maybeSingle();

  const knownSubscription = razorpaySubscriptionId || tenant?.razorpay_subscription_id || null;

  if (order && order.tenant_id !== tenantId) {
    return json(req, { error: "That order belongs to another restaurant.", activated: false }, 403);
  }
  if (!order && !knownSubscription) {
    return json(req, { error: "That order is not one of yours.", activated: false }, 403);
  }

  // A payment for an order we did not record is still a real payment, so it
  // is written down and the plan is activated from the order's notes.
  let planId = order?.plan_id ?? null;
  if (!planId) {
    const { data: sub } = await db
      .from("tenants")
      .select("subscription_plan, plan")
      .eq("id", tenantId)
      .maybeSingle();
    planId = sub?.subscription_plan ?? sub?.plan ?? "starter";
  }

  const { data: planRow } = await db
    .from("subscription_plans")
    .select("id, name, price_monthly, currency")
    .eq("id", planId)
    .maybeSingle();

  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();

  await db
    .from("subscription_payments")
    .upsert(
      {
        tenant_id: tenantId,
        amount: Number(planRow?.price_monthly ?? 0),
        currency: planRow?.currency ?? "INR",
        status: "captured",
        payment_method: "razorpay",
        transaction_id: razorpayPaymentId,
        plan_id: planId,
        billing_period: "monthly",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_order_id: razorpayOrderId,
        razorpay_subscription_id: knownSubscription,
        razorpay_signature: razorpaySignature,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "razorpay_payment_id" },
    );

  await db
    .from("tenants")
    .update({
      plan: planId,
      subscription_plan: planId,
      subscription_status: "active",
      subscription_started_at: now,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      razorpay_subscription_id: knownSubscription,
      subscription_razorpay_payment_id: razorpayPaymentId,
    })
    .eq("id", tenantId);

  await db.from("subscription_audit_logs").insert({
    tenant_id: tenantId,
    old_plan: null,
    new_plan: planId,
    change_type: "activated",
    razorpay_event_id: razorpayPaymentId,
    detail: { razorpayPaymentId, razorpayOrderId, razorpaySubscriptionId: knownSubscription },
  });

  const plan = await resolvePlan(tenantId);
  return json(req, { ok: true, activated: true, plan: publicPlan(plan) });
}

/**
 * Move to another plan.
 *
 * A restaurant that has no subscription yet just starts a checkout. One that
 * has a subscription has Razorpay change the plan on it, so the renewal
 * continues on the new plan and the difference is prorated.
 */
async function upgrade(req: Request, tenantId: string): Promise<Response> {
  const b = await body(req);
  const planId = String(b.planId ?? "").trim();
  if (!planId) return json(req, { error: "planId is required" }, 400);

  const db = admin();
  const { data: tenant } = await db
    .from("tenants")
    .select("razorpay_subscription_id, subscription_plan, plan, subscription_status")
    .eq("id", tenantId)
    .maybeSingle();

  // No subscription yet — this is a first purchase, not an upgrade.
  if (!tenant?.razorpay_subscription_id) {
    return checkout(req, tenantId);
  }

  const { data: planRow } = await db
    .from("subscription_plans")
    .select("id, name, price_monthly, currency, razorpay_plan_id, is_active")
    .eq("id", planId)
    .maybeSingle();
  if (!planRow) return json(req, { error: "That plan does not exist." }, 404);
  if (!planRow.is_active) return json(req, { error: "That plan is not available." }, 400);
  if (!planRow.razorpay_plan_id) {
    return json(
      req,
      { error: `The Razorpay plan for ${planRow.name} has not been set yet.` },
      503,
    );
  }

  const result = await updateSubscriptionPlan(
    tenant.razorpay_subscription_id,
    planRow.razorpay_plan_id,
  );
  if (!result.ok) {
    return json(req, { error: `Razorpay would not change the plan: ${result.error}` }, 400);
  }

  await db
    .from("tenants")
    .update({ subscription_plan: planId })
    .eq("id", tenantId);

  await db.from("subscription_audit_logs").insert({
    tenant_id: tenantId,
    old_plan: tenant.subscription_plan ?? tenant.plan,
    new_plan: planId,
    change_type: "upgraded",
    detail: { razorpaySubscriptionId: tenant.razorpay_subscription_id },
  });

  return json(req, { ok: true, upgraded: true, planId });
}

/** Razorpay changes the plan on the subscription itself. */
async function updateSubscriptionPlan(
  subscriptionId: string,
  razorpayPlanId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { RAZORPAY_API, razorpayConfig } = await import("../_shared/razorpay.ts");
  const config = razorpayConfig();
  if (!config.keyId || !config.keySecret) {
    return { ok: false, error: "Razorpay is not configured on the server." };
  }

  const res = await fetch(`${RAZORPAY_API}/subscriptions/${encodeURIComponent(subscriptionId)}/update`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.keyId}:${config.keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan_id: razorpayPlanId, prorate: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { ok: false, error: body?.error?.description || text || `Razorpay answered ${res.status}` };
  }
  return { ok: true };
}

/** Cancel at the end of the period. The restaurant keeps what it paid for. */
async function cancel(req: Request, tenantId: string): Promise<Response> {
  const db = admin();
  const { data: tenant } = await db
    .from("tenants")
    .select("razorpay_subscription_id, subscription_plan, plan, current_period_end")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant?.razorpay_subscription_id) {
    return json(req, { error: "There is no subscription to cancel." }, 400);
  }

  const result = await cancelSubscription(tenant.razorpay_subscription_id, true);
  if (!result.ok) {
    return json(req, { error: `Razorpay would not cancel the subscription: ${result.error}` }, 400);
  }

  await db
    .from("tenants")
    .update({ cancel_at_period_end: true, subscription_status: "cancelled" })
    .eq("id", tenantId);

  await db.from("subscription_audit_logs").insert({
    tenant_id: tenantId,
    old_plan: tenant.subscription_plan ?? tenant.plan,
    new_plan: tenant.subscription_plan ?? tenant.plan,
    change_type: "cancelled",
    detail: { razorpaySubscriptionId: tenant.razorpay_subscription_id },
  });

  return json(req, { ok: true, cancelAtPeriodEnd: true });
}
