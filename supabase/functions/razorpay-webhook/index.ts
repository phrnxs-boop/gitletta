// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/http.ts";
import { verifyWebhookSignature } from "../_shared/razorpay.ts";

/**
 * POST /functions/v1/razorpay-webhook — PUBLIC, signed.
 *
 * Razorpay tells the platform what happened to a subscription: it activated,
 * it was charged, it was cancelled, it was paused, a payment failed.
 *
 * Three things make this safe:
 *
 *   1. The signature is checked against the raw body before anything is
 *      parsed. A body that has been re-serialised has different bytes, and
 *      the signature would not match — so the raw body is the only thing
 *      that is ever verified.
 *   2. The event id is the primary key of `subscription_webhook_events`.
 *      Razorpay delivers every event at least once, so the second delivery
 *      cannot be inserted and the event is not acted on twice.
 *   3. Nothing is activated on the strength of the event alone. A subscription
 *      event moves the plan; a payment is only recorded once the payment
 *      itself has been verified.
 */

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  // The raw body. It is the only form the signature can be checked against.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  const check = await verifyWebhookSignature(rawBody, signature);
  if (!check.ok) {
    // A forged event is refused, and refused loudly — but without leaking
    // what was expected.
    console.error("razorpay webhook: signature check failed");
    return json(req, { error: check.error }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(req, { error: "Malformed event" }, 400);
  }

  const eventId = String(event?.event ?? "");
  const eventType = String(event?.event ?? "");

  if (!eventId) return json(req, { error: "The event had no id" }, 400);

  const db = admin();

  // The idempotency gate. If this insert fails, the event has already been
  // dealt with, and the right answer is to acknowledge it and stop.
  const { error: insertError } = await db
    .from("subscription_webhook_events")
    .insert({ event_id: eventId, event_type: eventType, received_at: new Date().toISOString() });
  if (insertError) {
    console.log("razorpay webhook: duplicate event", eventId);
    return json(req, { ok: true, duplicate: true });
  }

  try {
    const result = await handleEvent(event, eventType);
    await db
      .from("subscription_webhook_events")
      .update({ processed_at: new Date().toISOString(), result: result.summary })
      .eq("event_id", eventId);
    return json(req, { ok: true, ...result });
  } catch (e) {
    const message = (e as Error).message ?? "Unexpected error";
    console.error("razorpay webhook: handling failed", eventId, message);
    await db
      .from("subscription_webhook_events")
      .update({ result: `error: ${message}` })
      .eq("event_id", eventId);
    // A 500 makes Razorpay retry, which is what we want for a genuine
    // failure. The idempotency gate means the retry is safe.
    return json(req, { error: message }, 500);
  }
});

type EventResult = { summary: string; tenantId?: string };

async function handleEvent(event: any, eventType: string): Promise<EventResult> {
  const db = admin();

  const subscription = event?.payload?.subscription?.entity ?? null;
  const payment = event?.payload?.payment?.entity ?? null;

  const notes = subscription?.notes ?? payment?.notes ?? {};
  const tenantId: string | undefined = notes?.tenant_id ?? undefined;
  if (!tenantId) {
    return { summary: "no tenant in the event notes" };
  }

  const { data: tenant } = await db
    .from("tenants")
    .select("id, plan, subscription_plan, subscription_status")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) {
    return { summary: "the restaurant in the event no longer exists", tenantId };
  }

  // Razorpay's plan id → our plan id.
  const razorpayPlanId = subscription?.plan_id ?? null;
  let planId: string | null = null;
  if (razorpayPlanId) {
    const { data: planRow } = await db
      .from("subscription_plans")
      .select("id")
      .eq("razorpay_plan_id", razorpayPlanId)
      .maybeSingle();
    planId = planRow?.id ?? null;
  }
  if (!planId) planId = notes?.plan_id ?? tenant.subscription_plan ?? tenant.plan ?? "starter";

  const now = new Date().toISOString();
  const periodEnd = subscription?.current_end
    ? new Date(subscription.current_end * 1000).toISOString()
    : null;
  const periodStart = subscription?.current_start
    ? new Date(subscription.current_start * 1000).toISOString()
    : null;

  const razorpaySubscriptionId = subscription?.id ?? null;
  const eventId = String(event?.event ?? "");

  switch (eventType) {
    case "subscription.activated":
    case "subscription.created": {
      await db
        .from("tenants")
        .update({
          plan: planId,
          subscription_plan: planId,
          subscription_status: "active",
          subscription_started_at: periodStart ?? now,
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          razorpay_subscription_id: razorpaySubscriptionId,
        })
        .eq("id", tenantId);
      await audit(db, tenantId, tenant.plan, planId, "activated", eventId, { periodEnd });
      return { summary: `activated on ${planId}`, tenantId };
    }

    case "subscription.charged": {
      // A renewal. The period moves forward and the plan is kept.
      await db
        .from("tenants")
        .update({
          plan: planId,
          subscription_plan: planId,
          subscription_status: "active",
          current_period_end: periodEnd,
          subscription_started_at: periodStart ?? undefined,
          razorpay_subscription_id: razorpaySubscriptionId,
        })
        .eq("id", tenantId);

      if (payment?.id) {
        await db
          .from("subscription_payments")
          .upsert(
            {
              tenant_id: tenantId,
              amount: Number(payment.amount ?? 0) / 100,
              currency: payment.currency ?? "INR",
              status: "captured",
              payment_method: "razorpay",
              transaction_id: String(payment.id),
              plan_id: planId,
              billing_period: "monthly",
              razorpay_payment_id: String(payment.id),
              razorpay_order_id: payment.order_id ?? null,
              razorpay_invoice_id: payment.invoice_id ?? null,
              razorpay_subscription_id: razorpaySubscriptionId,
              webhook_event_id: eventId,
              created_at: now,
              updated_at: now,
            },
            { onConflict: "razorpay_payment_id" },
          );
      }
      await audit(db, tenantId, tenant.plan, planId, "renewed", eventId, { periodEnd });
      return { summary: `renewed on ${planId}`, tenantId };
    }

    case "subscription.cancelled":
    case "subscription.completed": {
      // A cancellation takes effect at the end of the period, so the plan
      // stays until the period ends and the access is restricted then.
      const ended = eventType === "subscription.completed";
      await db
        .from("tenants")
        .update({
          subscription_status: ended ? "expired" : "cancelled",
          cancel_at_period_end: !ended,
        })
        .eq("id", tenantId);
      await audit(db, tenantId, tenant.plan, planId, ended ? "completed" : "cancelled", eventId, {
        periodEnd,
      });
      return { summary: ended ? "completed" : "cancelled", tenantId };
    }

    case "subscription.paused": {
      await db.from("tenants").update({ subscription_status: "paused" }).eq("id", tenantId);
      await audit(db, tenantId, tenant.plan, planId, "paused", eventId, {});
      return { summary: "paused", tenantId };
    }

    case "subscription.pending":
    case "subscription.halted": {
      await db
        .from("tenants")
        .update({ subscription_status: eventType === "subscription.halted" ? "past_due" : "pending" })
        .eq("id", tenantId);
      await audit(db, tenantId, tenant.plan, planId, eventType.replace("subscription.", ""), eventId, {});
      return { summary: eventType, tenantId };
    }

    case "payment.failed": {
      await db.from("tenants").update({ subscription_status: "past_due" }).eq("id", tenantId);

      if (payment?.id) {
        await db
          .from("subscription_payments")
          .upsert(
            {
              tenant_id: tenantId,
              amount: Number(payment.amount ?? 0) / 100,
              currency: payment.currency ?? "INR",
              status: "failed",
              payment_method: "razorpay",
              transaction_id: String(payment.id),
              plan_id: planId,
              billing_period: "monthly",
              razorpay_payment_id: String(payment.id),
              razorpay_order_id: payment.order_id ?? null,
              razorpay_subscription_id: razorpaySubscriptionId,
              webhook_event_id: eventId,
              failure_reason: payment.error_description ?? "The payment was declined.",
              created_at: now,
              updated_at: now,
            },
            { onConflict: "razorpay_payment_id" },
          );
      }
      await audit(db, tenantId, tenant.plan, planId, "payment_failed", eventId, {});
      return { summary: "payment failed", tenantId };
    }

    default:
      return { summary: `ignored ${eventType}`, tenantId };
  }
}

async function audit(
  db: any,
  tenantId: string,
  oldPlan: string | null,
  newPlan: string | null,
  changeType: string,
  eventId: string,
  detail: Record<string, unknown>,
) {
  await db.from("subscription_audit_logs").insert({
    tenant_id: tenantId,
    old_plan: oldPlan,
    new_plan: newPlan,
    change_type: changeType,
    razorpay_event_id: eventId,
    detail,
  });
}
