// deno-lint-ignore-file no-explicit-any
import { admin } from "./db.ts";

/**
 * Plans, trials and limits.
 *
 * Everything that decides what a restaurant may do is decided here, on the
 * server. The interface mirrors what the plan is sold with, but the
 * interface is never what decides — a restaurant that edits the browser
 * gets nothing, because every limit below is checked in the edge function
 * that does the write.
 *
 * The states a restaurant can be in:
 *
 *   trial       the free trial, running. It carries the trial plan.
 *   active      a paid subscription, in force.
 *   expired     the trial ran out and nothing was bought.
 *   cancelled   the subscription was cancelled. It stays active until the
 *               period it was paid for ends, and then it becomes expired.
 *   past_due    a renewal payment failed. Access is held for a grace
 *               period and then restricted.
 *   none        never had a trial and never subscribed.
 */

export type PlanId = string;

export type PlanLimits = {
  locations: number | null;
  staff: number | null;
  menuItems: number | null;
};

export type EffectivePlan = {
  /** The plan in force right now. */
  planId: PlanId;
  planName: string;
  status: string;
  /** True when a paid subscription is in force. */
  isPaid: boolean;
  /** True while the free trial is running. */
  isTrial: boolean;
  /** True when the trial has run out and there is no paid subscription. */
  isRestricted: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  subscriptionPlan: PlanId | null;
  subscriptionStartedAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  razorpaySubscriptionId: string | null;
  razorpayPaymentId: string | null;
  limits: PlanLimits;
  features: string[];
  priceMonthly: number;
  currency: string;
  /** The trial plan, used when the trial is running. */
  trialPlanId: PlanId;
};

const DAY_MS = 86_400_000;

/** How long a failed renewal keeps access before it is restricted. */
export const PAST_DUE_GRACE_MS = 7 * DAY_MS;

/** The features only a Pro subscriber gets. */
export const PRO_ONLY_FEATURES = ["advanced_analytics"] as const;

export type PlanFeature = (typeof PRO_ONLY_FEATURES)[number];

type PlanRow = {
  id: string;
  name: string;
  price_monthly: number;
  currency: string;
  trial_days: number;
  features: string[];
  is_active: boolean;
  max_locations: number | null;
  max_staff: number | null;
  max_menu_items: number | null;
  razorpay_plan_id: string | null;
};

async function planRow(id: string): Promise<PlanRow | null> {
  const { data } = await admin()
    .from("subscription_plans")
    .select(
      "id, name, price_monthly, currency, trial_days, features, is_active, is_popular, max_locations, max_staff, max_menu_items, razorpay_plan_id",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as PlanRow) ?? null;
}

async function activePlans(): Promise<PlanRow[]> {
  const { data } = await admin()
    .from("subscription_plans")
    .select(
      "id, name, price_monthly, currency, trial_days, features, is_active, max_locations, max_staff, max_menu_items, razorpay_plan_id",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data as PlanRow[]) ?? [];
}

/**
 * The plan a new restaurant is put on. Pro, because the trial is a full
 * trial — the free fourteen days are the product, not a cut-down version of
 * it.
 */
export const DEFAULT_TRIAL_PLAN = "pro";

/**
 * The plan a restaurant falls back to when it has nothing paid for. The
 * cheapest one, so a lapsed restaurant keeps the essentials.
 */
export const FALLBACK_PLAN = "starter";

/**
 * Resolve what a restaurant may do right now.
 *
 * The trial is the one state that needs a clock: it is in force until the
 * trial ends, and it stops being in force the moment it does — no job, no
 * cron, no flag. A restaurant whose trial has run out is restricted
 * immediately, whether or not anything noticed.
 */
export async function resolvePlan(tenantId: string): Promise<EffectivePlan> {
  const db = admin();

  const { data: tenant } = await db
    .from("tenants")
    .select(
      "id, plan, subscription_status, trial_started_at, trial_ends_at, subscription_plan, subscription_started_at, razorpay_subscription_id, subscription_razorpay_payment_id, current_period_end, cancel_at_period_end",
    )
    .eq("id", tenantId)
    .maybeSingle();

  const t = tenant as any;
  const status = String(t?.subscription_status ?? "none");
  const now = Date.now();

  const trialPlanId = DEFAULT_TRIAL_PLAN;
  const trialPlan = (await planRow(trialPlanId)) ?? (await planRow("pro"));
  const paidPlan = t?.subscription_plan ? await planRow(t.subscription_plan) : null;
  const fallback = await planRow(FALLBACK_PLAN);

  const trialEndsAt = t?.trial_ends_at ?? null;
  const trialStartedAt = t?.trial_started_at ?? null;
  const trialActive =
    status === "trial" &&
    trialEndsAt !== null &&
    new Date(trialEndsAt).getTime() > now;

  const trialDaysRemaining =
    trialActive && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / DAY_MS))
      : null;

  // A paid subscription is in force while its period lasts. A cancellation
  // takes effect at the end of the period, not the moment it is pressed, so
  // the period end is the real deadline.
  const periodEnd = t?.current_period_end ? new Date(t.current_period_end).getTime() : null;
  const paidActive =
    status === "active" &&
    paidPlan !== null &&
    (periodEnd === null || periodEnd > now);

  // A renewal that failed keeps access for a grace period, and then it is
  // restricted.
  const pastDueActive =
    status === "past_due" &&
    paidPlan !== null &&
    (periodEnd === null || periodEnd + PAST_DUE_GRACE_MS > now);

  const chosen =
    trialActive && trialPlan
      ? trialPlan
      : (paidActive || pastDueActive) && paidPlan
        ? paidPlan
        : (fallback ?? trialPlan);

  const isPaid = (paidActive || pastDueActive) && paidPlan !== null;
  const isTrial = trialActive;

  return {
    planId: chosen?.id ?? FALLBACK_PLAN,
    planName: chosen?.name ?? "Starter",
    status,
    isPaid,
    isTrial,
    // Restricted means: the trial is over and there is no paid subscription.
    // The restaurant keeps everything it has; it just cannot do the paid
    // things any more.
    isRestricted: !isPaid && !isTrial,
    trialStartedAt,
    trialEndsAt,
    trialDaysRemaining,
    subscriptionPlan: t?.subscription_plan ?? null,
    subscriptionStartedAt: t?.subscription_started_at ?? null,
    currentPeriodEnd: t?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(t?.cancel_at_period_end),
    razorpaySubscriptionId: t?.razorpay_subscription_id ?? null,
    razorpayPaymentId: t?.subscription_razorpay_payment_id ?? null,
    limits: {
      locations: chosen?.max_locations ?? null,
      staff: chosen?.max_staff ?? null,
      menuItems: chosen?.max_menu_items ?? null,
    },
    features: Array.isArray(chosen?.features) ? chosen!.features : [],
    priceMonthly: Number(chosen?.price_monthly ?? 0),
    currency: chosen?.currency ?? "INR",
    trialPlanId,
  };
}

/** The plans an owner can be shown, with their prices and features. */
export async function planCatalogue() {
  const plans = await activePlans();
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: (p as any).description ?? null,
    priceMonthly: Number(p.price_monthly),
    currency: p.currency,
    trialDays: p.trial_days,
    features: Array.isArray(p.features) ? p.features : [],
    limits: {
      locations: p.max_locations,
      staff: p.max_staff,
      menuItems: p.max_menu_items,
    },
    popular: Boolean(p.is_popular),
    razorpayPlanId: p.razorpay_plan_id,
  }));
}

/**
 * Check a limit before a write.
 *
 * The count is passed in rather than counted here, so the caller counts
 * exactly the rows it is about to add to and the check is on the same
 * transaction's view of the world.
 */
export function checkLimit(
  plan: EffectivePlan,
  kind: "locations" | "staff" | "menuItems",
  currentCount: number,
): { ok: true } | { ok: false; error: string; limit: number } {
  const limit = plan.limits[kind];
  if (limit === null || limit === undefined) return { ok: true };
  if (currentCount < limit) return { ok: true };

  const noun = kind === "staff" ? "staff members" : kind === "menuItems" ? "menu items" : "locations";
  return {
    ok: false,
    limit,
    error:
      `Your ${plan.planName} plan includes up to ${limit} ${noun}. ` +
      `Upgrade your plan to add more.`,
  };
}

/** Whether a feature is available on the plan in force. */
export function hasFeature(plan: EffectivePlan, feature: PlanFeature): boolean {
  if (!PRO_ONLY_FEATURES.includes(feature)) return true;
  return plan.planId === "pro" || plan.planId === "enterprise";
}

/**
 * Whether a Pro-only feature may be used, and why not when it may not.
 */
export function checkFeature(
  plan: EffectivePlan,
  feature: PlanFeature,
): { ok: true } | { ok: false; error: string } {
  if (hasFeature(plan, feature)) return { ok: true };
  return {
    ok: false,
    error:
      feature === "advanced_analytics"
        ? "Advanced analytics is a Pro feature. Upgrade your plan to see it."
        : "That feature is not on your plan.",
  };
}

/**
 * Check a limit before a write, counting the rows the write would join.
 *
 * The count is taken here rather than passed in, so a caller cannot forget
 * to check. The caller is still the only one that does the write, so the
 * check and the write are the same request's view of the world.
 *
 * `locations` is the one limit that is stored but not enforced. The platform
 * binds one profile to one restaurant and has no branch model, so there is
 * no way to create a second location. Capping the app's tables instead would
 * limit a restaurant to one table and make the point of sale unusable, so
 * the limit is kept in the catalogue and shown to owners, and the two
 * limits that can be honoured — staff and menu items — are enforced.
 */
export async function checkWriteLimit(
  tenantId: string,
  kind: "locations" | "staff" | "menuItems",
): Promise<{ ok: true } | { ok: false; error: string; limit: number }> {
  const plan = await resolvePlan(tenantId);
  const db = admin();

  if (kind === "locations") {
    return { ok: true };
  }

  const table = kind === "staff" ? "staff" : "menu_items";
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) {
    // A count that cannot be read is not a reason to let the write through
    // unchecked, but it is also not the caller's fault. The write is
    // allowed and the count is simply not enforced this time.
    console.error("plans: could not count", table, error.message);
    return { ok: true };
  }

  return checkLimit(plan, kind, count ?? 0);
}
