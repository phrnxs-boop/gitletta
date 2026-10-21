// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight, subPath } from "../_shared/http.ts";
import { admin } from "../_shared/db.ts";
import { superGuard, logAdminAction } from "../_shared/super_admin.ts";
import {
  getGeminiConfig,
  maskKey,
  testGeminiConnection,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
} from "../_shared/gemini.ts";
import {
  getGoogleConfig,
  maskSecret,
  defaultRedirectUri,
  testGoogleCredentials,
  GOOGLE_CONFIG_ID,
  GBP_SCOPE,
} from "../_shared/google.ts";

/**
 * /functions/v1/super-admin
 *
 * The global administrative API. Every route is behind superGuard(), which
 * checks the `super_admins` allowlist. There is no tenant filter anywhere in
 * this file on purpose — the guard is the boundary.
 *
 *   GET    overview             business KPIs, trend, distributions
 *   GET    crm?q=               restaurant directory
 *   GET    crm/:id              one restaurant, with its activity and notes
 *   POST   crm/:id/notes        add a follow-up note
 *   GET    conversion           the signup → paid funnel
 *   GET    payments             revenue, transactions, plan catalogue
 *   GET    usage                usage per restaurant, feature adoption
 *   GET    retention            inactive restaurants, expiring trials, prospects
 *   GET    reports?from=&to=    dated report rows
 *   GET    reports/csv?type=    the same, as CSV
 *   GET    audit                administrative audit log
 *   GET    search?q=            restaurants and people
 *   GET    issues               support issues
 *   GET    ai-provider          the AI provider settings, key masked
 *   GET    google               the Google OAuth configuration, secret masked
 *   POST   google               save or update the Google OAuth configuration
 *   POST   google/test          check the Google credentials against Google
 *   POST   ai-provider          save or update the provider settings
 *   POST   ai-provider/test     test the stored key against the provider
 *   PATCH  issues/:id           change an issue's status
 *   PATCH  tenants/:id          plan, subscription status, active flag
 *
 * A rule this file follows without exception: a query that fails returns the
 * error. The first version of this function destructured `{ data }` and
 * ignored `error`, which turned a missing table into a confident zero and
 * made the dashboard report numbers that were not real.
 */

const DAY = 86_400_000;

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  onboarding_done: boolean;
  created_at: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The core dataset, fetched once and reused by most of the read routes.
 * Every query is checked; a failure is a 500, never a silent empty list.
 */
async function loadCore() {
  const db = admin();

  const [tenantsRes, profilesRes, plansRes, paymentsRes, dailyRes] = await Promise.all([
    db
      .from("tenants")
      .select(
        "id, name, slug, plan, active, onboarding_done, created_at, subscription_status, trial_ends_at, current_period_end",
      )
      .order("created_at", { ascending: false }),
    db.from("profiles").select("id, email, name, tenant_id, last_login, is_super_admin"),
    db.from("subscription_plans").select("*").order("sort_order"),
    db
      .from("subscription_payments")
      .select("id, tenant_id, amount, currency, status, payment_method, plan_id, billing_period, created_at"),
    db.from("daily_tenant_metrics").select("tenant_id, date, order_count, order_value"),
  ]);

  const firstError = [tenantsRes, profilesRes, plansRes, paymentsRes, dailyRes].find(
    (r) => r.error,
  );
  if (firstError?.error) {
    return { error: firstError.error.message as string };
  }

  const tenants = (tenantsRes.data ?? []) as TenantRow[];
  const profiles = (profilesRes.data ?? []) as any[];
  const plans = (plansRes.data ?? []) as any[];
  const payments = (paymentsRes.data ?? []) as any[];
  const daily = (dailyRes.data ?? []) as any[];

  // Per-tenant rollups from the daily counters the orders trigger maintains.
  const perTenant = new Map<
    string,
    { orders: number; value: number; lastOrder: string | null }
  >();
  for (const row of daily) {
    const cur = perTenant.get(row.tenant_id) ?? { orders: 0, value: 0, lastOrder: null };
    cur.orders += Number(row.order_count ?? 0);
    cur.value += Number(row.order_value ?? 0);
    if (!cur.lastOrder || row.date > cur.lastOrder) cur.lastOrder = row.date;
    perTenant.set(row.tenant_id, cur);
  }

  // The owner of each tenant is the profile on that tenant.
  const ownerByTenant = new Map<string, any>();
  for (const p of profiles) {
    if (!p.tenant_id) continue;
    if (!ownerByTenant.has(p.tenant_id)) ownerByTenant.set(p.tenant_id, p);
  }

  return { tenants, profiles, plans, payments, daily, perTenant, ownerByTenant };
}

function planPrice(plans: any[], planId: string, period: "monthly" | "yearly" = "monthly"): number {
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return 0;
  return Number(period === "yearly" ? plan.price_yearly : plan.price_monthly) || 0;
}

// --- Business overview ------------------------------------------------------

async function getBusinessOverview(req: Request) {
  const core = await loadCore();
  if ("error" in core) return json(req, { error: core.error }, 500);

  const { tenants, profiles, plans, payments, perTenant } = core;
  const now = Date.now();
  const d30 = now - 30 * DAY;
  const d7 = now - 7 * DAY;

  const newRestaurants30d = tenants.filter((t) => new Date(t.created_at).getTime() >= d30).length;
  const completedOnboarding = tenants.filter((t) => t.onboarding_done).length;

  const usersWithLogin = profiles.filter((p) => p.last_login);
  const activeUsers7d = usersWithLogin.filter(
    (p) => new Date(p.last_login).getTime() >= d7,
  ).length;
  const activeUsers30d = usersWithLogin.filter(
    (p) => new Date(p.last_login).getTime() >= d30,
  ).length;
  const neverLoggedIn = profiles.filter((p) => !p.last_login).length;

  const trials = tenants.filter((t) => t.subscription_status === "trial").length;
  const paid = tenants.filter((t) => t.subscription_status === "active").length;
  const canceled = tenants.filter((t) => t.subscription_status === "canceled").length;
  const pastDue = tenants.filter((t) => t.subscription_status === "past_due").length;

  // Contracted MRR: what the tenants on an active plan should be paying.
  const contractedMrr = tenants
    .filter((t) => t.subscription_status === "active")
    .reduce((sum, t) => sum + planPrice(plans, t.plan), 0);

  // Realised MRR: what actually came in over the last 30 days.
  const succeeded = payments.filter(
    (p) => p.status === "succeeded" && new Date(p.created_at).getTime() >= d30,
  );
  const realizedMrr = succeeded.reduce((sum, p) => {
    const amount = Number(p.amount) || 0;
    return sum + (p.billing_period === "yearly" ? amount / 12 : amount);
  }, 0);

  const churned30d = payments.filter(
    (p) => p.status === "refunded" && new Date(p.created_at).getTime() >= d30,
  ).length;
  const churnRate = tenants.length ? +((canceled / tenants.length) * 100).toFixed(1) : 0;

  // A 30-day trend: new restaurants, orders and revenue per day.
  const days = 30;
  const trend: any[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = dateKey(d);
    const sameDay = core.daily.filter((r: any) => r.date === key);
    trend.push({
      date: key,
      restaurants: tenants.filter((t) => dateKey(new Date(t.created_at)) === key).length,
      orders: sameDay.reduce((s: number, r: any) => s + Number(r.order_count ?? 0), 0),
      revenue: +sameDay.reduce((s: number, r: any) => s + Number(r.order_value ?? 0), 0).toFixed(2),
    });
  }

  const planDistribution = Object.entries(
    tenants.reduce((acc: Record<string, number>, t) => {
      acc[t.plan] = (acc[t.plan] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([plan, count]) => ({ plan, count }));

  const statusDistribution = Object.entries(
    tenants.reduce((acc: Record<string, number>, t) => {
      const s = t.subscription_status ?? "unknown";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([status, count]) => ({ status, count }));

  // The most recent things that happened, whatever they were.
  const recentActivity = [
    ...tenants.map((t) => ({
      type: "restaurant_signup",
      label: `${t.name} joined`,
      at: t.created_at,
      tenantId: t.id,
    })),
    ...payments.map((p) => ({
      type: `payment_${p.status}`,
      label: `${p.status} payment of ${p.amount} ${p.currency ?? "INR"}`,
      at: p.created_at,
      tenantId: p.tenant_id,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);

  return json(req, {
    kpis: {
      totalRestaurants: tenants.length,
      activeRestaurants: tenants.filter((t) => t.active).length,
      newRestaurants30d,
      completedOnboarding,
      onboardingIncomplete: tenants.length - completedOnboarding,
      onboardingRate: tenants.length
        ? +((completedOnboarding / tenants.length) * 100).toFixed(1)
        : 0,
      totalUsers: profiles.length,
      activeUsers7d,
      activeUsers30d,
      inactiveUsers: Math.max(0, profiles.length - activeUsers30d),
      neverLoggedIn,
      trials,
      paid,
      canceled,
      pastDue,
      mrr: +contractedMrr.toFixed(2),
      mrrRealized: +realizedMrr.toFixed(2),
      arr: +(contractedMrr * 12).toFixed(2),
      churnRate,
      churned30d,
      totalOrders: [...perTenant.values()].reduce((s, r) => s + r.orders, 0),
    },
    trend,
    planDistribution,
    statusDistribution,
    recentActivity,
  });
}

// --- Restaurant CRM ---------------------------------------------------------

async function getCrm(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "";
  const plan = url.searchParams.get("plan") ?? "";

  const core = await loadCore();
  if ("error" in core) return json(req, { error: core.error }, 500);
  const { tenants, perTenant, ownerByTenant, payments } = core;

  const { data: menuCounts } = await admin()
    .from("menu_items")
    .select("tenant_id")
    .limit(5000);
  const { data: staffCounts } = await admin()
    .from("staff")
    .select("tenant_id")
    .limit(5000);

  const menuByTenant = new Map<string, number>();
  for (const m of menuCounts ?? []) {
    menuByTenant.set(m.tenant_id, (menuByTenant.get(m.tenant_id) ?? 0) + 1);
  }
  const staffByTenant = new Map<string, number>();
  for (const s of staffCounts ?? []) {
    staffByTenant.set(s.tenant_id, (staffByTenant.get(s.tenant_id) ?? 0) + 1);
  }

  const paidTenantIds = new Set(
    payments.filter((p) => p.status === "succeeded").map((p) => p.tenant_id),
  );

  let rows = tenants.map((t) => {
    const owner = ownerByTenant.get(t.id);
    const roll = perTenant.get(t.id);
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      active: t.active,
      onboardingDone: t.onboarding_done,
      subscriptionStatus: t.subscription_status ?? "unknown",
      trialEndsAt: t.trial_ends_at,
      currentPeriodEnd: t.current_period_end,
      createdAt: t.created_at,
      lastActivity: roll?.lastOrder ?? t.created_at,
      orderCount: roll?.orders ?? 0,
      orderValue: +(roll?.value ?? 0).toFixed(2),
      menuItemCount: menuByTenant.get(t.id) ?? 0,
      staffCount: staffByTenant.get(t.id) ?? 0,
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.name ?? null,
      hasPayment: paidTenantIds.has(t.id),
    };
  });

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.slug.toLowerCase().includes(needle) ||
        (r.ownerEmail ?? "").toLowerCase().includes(needle) ||
        (r.ownerName ?? "").toLowerCase().includes(needle),
    );
  }
  if (status) rows = rows.filter((r) => r.subscriptionStatus === status);
  if (plan) rows = rows.filter((r) => r.plan === plan);

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return json(req, rows);
}

async function getCrmDetail(req: Request, tenantId: string) {
  const db = admin();

  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr) return json(req, { error: tErr.message }, 500);
  if (!tenant) return json(req, { error: "Restaurant not found" }, 404);

  const [ownerRes, noteRes, issueRes, payRes, orderRes, menuRes, staffRes, metricRes] =
    await Promise.all([
      db.from("profiles").select("id, email, name, last_login").eq("tenant_id", tenantId),
      db
        .from("tenant_notes")
        .select("*, author:profiles!tenant_notes_admin_id_fkey(email, name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("support_issues")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      db
        .from("subscription_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      db
        .from("orders")
        .select("id, order_number, total, status, created_at, order_type")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(25),
      db.from("menu_items").select("id, name, price, available, updated_at").eq("tenant_id", tenantId),
      db.from("staff").select("id, name, active").eq("tenant_id", tenantId),
      db
        .from("daily_tenant_metrics")
        .select("date, order_count, order_value")
        .eq("tenant_id", tenantId)
        .order("date", { ascending: false })
        .limit(30),
    ]);

  const firstError = [ownerRes, noteRes, issueRes, payRes, orderRes, menuRes, staffRes, metricRes].find(
    (r) => r.error,
  );
  if (firstError?.error) return json(req, { error: firstError.error.message }, 500);

  return json(req, {
    tenant,
    owners: ownerRes.data ?? [],
    notes: noteRes.data ?? [],
    issues: issueRes.data ?? [],
    payments: payRes.data ?? [],
    recentOrders: orderRes.data ?? [],
    menuItems: menuRes.data ?? [],
    staff: staffRes.data ?? [],
    dailyMetrics: metricRes.data ?? [],
  });
}

async function addNote(req: Request, tenantId: string, adminId: string) {
  const db = admin();
  const b = await req.json().catch(() => ({})) as any;
  const body = String(b.body ?? "").trim();
  if (!body) return json(req, { error: "Note body is required" }, 400);

  const { data, error } = await db
    .from("tenant_notes")
    .insert({
      tenant_id: tenantId,
      admin_id: adminId,
      body,
      kind: ["note", "call", "email", "issue"].includes(b.kind) ? b.kind : "note",
    })
    .select()
    .single();
  if (error) return json(req, { error: error.message }, 500);

  await logAdminAction(adminId, "tenant.note_added", { note: body }, tenantId);
  return json(req, data, 201);
}

// --- Conversion funnel ------------------------------------------------------

async function getConversion(req: Request) {
  const core = await loadCore();
  if ("error" in core) return json(req, { error: core.error }, 500);
  const { tenants, perTenant, ownerByTenant } = core;

  const { data: menuRows } = await admin().from("menu_items").select("tenant_id").limit(5000);
  const tenantsWithMenu = new Set((menuRows ?? []).map((m) => m.tenant_id));

  const signedUp = tenants.length;
  const completedOnboarding = tenants.filter((t) => t.onboarding_done).length;
  const publishedMenu = tenants.filter((t) => tenantsWithMenu.has(t.id)).length;
  const firstOrder = tenants.filter((t) => (perTenant.get(t.id)?.orders ?? 0) > 0).length;
  const trial = tenants.filter((t) => t.subscription_status === "trial").length;
  const paid = tenants.filter((t) => t.subscription_status === "active").length;

  const stages = [
    { key: "signup", label: "Signed up", count: signedUp },
    { key: "onboarding", label: "Completed onboarding", count: completedOnboarding },
    { key: "menu", label: "Published a menu", count: publishedMenu },
    { key: "first_order", label: "Took first order", count: firstOrder },
    { key: "trial", label: "On a trial", count: trial },
    { key: "paid", label: "Became a paying customer", count: paid },
  ];

  return json(req, {
    stages: stages.map((s, i) => ({
      ...s,
      rate: signedUp ? +((s.count / signedUp) * 100).toFixed(1) : 0,
      stepRate: i === 0 || !stages[i - 1].count
        ? 100
        : +((s.count / stages[i - 1].count) * 100).toFixed(1),
      dropOff: i === 0 ? 0 : stages[i - 1].count - s.count,
    })),
    totals: { signedUp, completedOnboarding, publishedMenu, firstOrder, trial, paid },
  });
}

// --- Revenue and payments ---------------------------------------------------

async function getPayments(req: Request) {
  const core = await loadCore();
  if ("error" in core) return json(req, { error: core.error }, 500);
  const { tenants, plans, payments } = core;
  const now = Date.now();
  const d30 = now - 30 * DAY;

  const succeeded = payments.filter((p) => p.status === "succeeded");
  const failed = payments.filter((p) => p.status === "failed");
  const refunded = payments.filter((p) => p.status === "refunded");
  const pending = payments.filter((p) => p.status === "pending");
  const renewals = succeeded.filter((p) => p.billing_period === "monthly" && p.created_at);

  const contractedMrr = tenants
    .filter((t) => t.subscription_status === "active")
    .reduce((sum, t) => sum + planPrice(plans, t.plan), 0);
  const realizedMrr = succeeded
    .filter((p) => new Date(p.created_at).getTime() >= d30)
    .reduce((sum, p) => {
      const amount = Number(p.amount) || 0;
      return sum + (p.billing_period === "yearly" ? amount / 12 : amount);
    }, 0);

  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));

  return json(req, {
    metrics: {
      mrr: +contractedMrr.toFixed(2),
      mrrRealized: +realizedMrr.toFixed(2),
      arr: +(contractedMrr * 12).toFixed(2),
      verifiedRevenue30d: +succeeded
        .filter((p) => new Date(p.created_at).getTime() >= d30)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0)
        .toFixed(2),
      successfulCount: succeeded.length,
      failedCount: failed.length,
      failedAmount30d: +failed
        .filter((p) => new Date(p.created_at).getTime() >= d30)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0)
        .toFixed(2),
      refundCount: refunded.length,
      refundAmount: +refunded.reduce((s, p) => s + (Number(p.amount) || 0), 0).toFixed(2),
      pendingCount: pending.length,
      renewalCount: renewals.length,
      cancellations: tenants.filter((t) => t.subscription_status === "canceled").length,
      trials: tenants.filter((t) => t.subscription_status === "trial").length,
      paid: tenants.filter((t) => t.subscription_status === "active").length,
    },
    transactions: payments
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100)
      .map((p) => ({ ...p, tenantName: tenantName.get(p.tenant_id) ?? "Unknown" })),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: Number(p.price_monthly),
      priceYearly: Number(p.price_yearly),
      currency: p.currency,
      trialDays: p.trial_days,
      features: p.features,
      isActive: p.is_active,
      subscribers: tenants.filter((t) => t.plan === p.id).length,
    })),
  });
}

// --- Usage analytics --------------------------------------------------------

async function getUsage(req: Request) {
  const core = await loadCore();
  if ("error" in core) return json(req, { error: core.error }, 500);
  const { tenants, perTenant, daily } = core;

  const db = admin();
  const [featureRes, logRes, menuRes] = await Promise.all([
    db.from("feature_usage").select("tenant_id, feature_id, action, created_at").limit(20000),
    db.from("security_logs").select("tenant_id, action, created_at").limit(20000),
    db.from("menu_items").select("tenant_id, updated_at").limit(20000),
  ]);
  const firstError = [featureRes, logRes, menuRes].find((r) => r.error);
  if (firstError?.error) return json(req, { error: firstError.error.message }, 500);

  const features = featureRes.data ?? [];
  const logs = logRes.data ?? [];
  const menuItems = menuRes.data ?? [];

  const featureByTenant = new Map<string, Set<string>>();
  for (const f of features) {
    if (!featureByTenant.has(f.tenant_id)) featureByTenant.set(f.tenant_id, new Set());
    featureByTenant.get(f.tenant_id)!.add(f.feature_id);
  }
  const loginsByTenant = new Map<string, number>();
  for (const l of logs) {
    if (l.action === "LOGIN" || l.action === "LOGIN_SUCCESS") {
      loginsByTenant.set(l.tenant_id, (loginsByTenant.get(l.tenant_id) ?? 0) + 1);
    }
  }
  const menuEditsByTenant = new Map<string, number>();
  for (const m of menuItems) {
    if (m.updated_at) {
      menuEditsByTenant.set(m.tenant_id, (menuEditsByTenant.get(m.tenant_id) ?? 0) + 1);
    }
  }

  const perRestaurant = tenants.map((t) => {
    const roll = perTenant.get(t.id);
    const used = featureByTenant.get(t.id) ?? new Set<string>();
    return {
      id: t.id,
      name: t.name,
      plan: t.plan,
      orders: roll?.orders ?? 0,
      orderValue: +(roll?.value ?? 0).toFixed(2),
      lastOrder: roll?.lastOrder ?? null,
      logins: loginsByTenant.get(t.id) ?? 0,
      menuEdits: menuEditsByTenant.get(t.id) ?? 0,
      features: [...used].sort(),
      featureCount: used.size,
    };
  });

  // Which features are popular across the platform.
  const adoption = new Map<string, Set<string>>();
  for (const f of features) {
    if (!adoption.has(f.feature_id)) adoption.set(f.feature_id, new Set());
    adoption.get(f.feature_id)!.add(f.tenant_id);
  }
  const featureAdoption = [...adoption.entries()]
    .map(([featureId, tenantSet]) => ({
      feature: featureId,
      restaurants: tenantSet.size,
      rate: tenants.length ? +((tenantSet.size / tenants.length) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.restaurants - a.restaurants);

  // A daily order/revenue trend for the chart.
  const byDate = new Map<string, { orders: number; revenue: number }>();
  for (const row of daily) {
    const cur = byDate.get(row.date) ?? { orders: 0, revenue: 0 };
    cur.orders += Number(row.order_count ?? 0);
    cur.revenue += Number(row.order_value ?? 0);
    byDate.set(row.date, cur);
  }
  const trend = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([date, v]) => ({ date, orders: v.orders, revenue: +v.revenue.toFixed(2) }));

  return json(req, { perRestaurant, featureAdoption, trend, totalEvents: features.length });
}

// --- Retention --------------------------------------------------------------

async function getRetention(req: Request) {
  const core = await loadCore();
  if ("error" in core) return json(req, { error: core.error }, 500);
  const { tenants, perTenant, ownerByTenant, payments } = core;
  const now = Date.now();
  const in14 = now - 14 * DAY;
  const in7 = now + 7 * DAY;

  const { data: logRows } = await admin()
    .from("security_logs")
    .select("tenant_id, action, created_at")
    .limit(20000);
  const lastLoginByTenant = new Map<string, string>();
  for (const l of logRows ?? []) {
    if (l.action !== "LOGIN" && l.action !== "LOGIN_SUCCESS") continue;
    const cur = lastLoginByTenant.get(l.tenant_id);
    if (!cur || l.created_at > cur) lastLoginByTenant.set(l.tenant_id, l.created_at);
  }

  const describe = (t: TenantRow) => {
    const roll = perTenant.get(t.id);
    const owner = ownerByTenant.get(t.id);
    const lastOrder = roll?.lastOrder ?? null;
    const lastActivity = [lastOrder, lastLoginByTenant.get(t.id) ?? null]
      .filter(Boolean)
      .sort()
      .pop() ?? t.created_at;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      subscriptionStatus: t.subscription_status ?? "unknown",
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.name ?? null,
      createdAt: t.created_at,
      orderCount: roll?.orders ?? 0,
      orderValue: +(roll?.value ?? 0).toFixed(2),
      lastOrder,
      lastActivity,
      daysSinceActivity: Math.floor((now - new Date(lastActivity).getTime()) / DAY),
      trialEndsAt: t.trial_ends_at,
    };
  };

  const all = tenants.map(describe);

  // A restaurant that has not taken an order in a fortnight.
  const inactive = all
    .filter((t) => t.orderCount === 0 || t.daysSinceActivity >= 14)
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  // A trial that is about to run out.
  const expiringTrials = all
    .filter(
      (t) =>
        t.subscriptionStatus === "trial" &&
        t.trialEndsAt &&
        new Date(t.trialEndsAt).getTime() <= in7 &&
        new Date(t.trialEndsAt).getTime() >= now,
    )
    .sort((a, b) => new Date(a.trialEndsAt!).getTime() - new Date(b.trialEndsAt!).getTime());

  // A trial that has run out but is still open.
  const expiredTrials = all
    .filter(
      (t) =>
        t.subscriptionStatus === "trial" &&
        t.trialEndsAt &&
        new Date(t.trialEndsAt).getTime() < now,
    )
    .sort((a, b) => new Date(a.trialEndsAt!).getTime() - new Date(b.trialEndsAt!).getTime());

  // Using the product but not paying for it.
  const paidTenantIds = new Set(
    payments.filter((p) => p.status === "succeeded").map((p) => p.tenant_id),
  );
  const prospects = all
    .filter(
      (t) =>
        t.subscriptionStatus !== "active" &&
        !paidTenantIds.has(t.id) &&
        (t.orderCount > 0 || t.daysSinceActivity < 14),
    )
    .sort((a, b) => b.orderCount - a.orderCount);

  return json(req, {
    inactive,
    expiringTrials,
    expiredTrials,
    prospects,
    summary: {
      inactiveCount: inactive.length,
      expiringTrialCount: expiringTrials.length,
      expiredTrialCount: expiredTrials.length,
      prospectCount: prospects.length,
    },
  });
}

// --- Reports ----------------------------------------------------------------

async function getReports(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? dateKey(daysAgo(29));
  const to = url.searchParams.get("to") ?? dateKey(new Date());
  const type = url.searchParams.get("type") ?? "revenue";

  const db = admin();
  const fromIso = new Date(`${from}T00:00:00Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59Z`).toISOString();

  const { data: orders, error } = await db
    .from("orders")
    .select("id, tenant_id, total, status, order_type, created_at, payment_method")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .limit(20000);
  if (error) return json(req, { error: error.message }, 500);

  const { data: tenants } = await db.from("tenants").select("id, name, plan");
  const nameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  const byTenant = new Map<string, { orders: number; revenue: number; completed: number }>();
  for (const o of orders ?? []) {
    const cur = byTenant.get(o.tenant_id) ?? { orders: 0, revenue: 0, completed: 0 };
    cur.orders += 1;
    cur.revenue += Number(o.total) || 0;
    if (o.status === "COMPLETED") cur.completed += 1;
    byTenant.set(o.tenant_id, cur);
  }

  const rows = [...byTenant.entries()]
    .map(([tenantId, v]) => ({
      tenantId,
      restaurant: nameById.get(tenantId) ?? "Unknown",
      orders: v.orders,
      completedOrders: v.completed,
      revenue: +v.revenue.toFixed(2),
      averageOrderValue: v.orders ? +(v.revenue / v.orders).toFixed(2) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders ?? []) {
    const key = dateKey(new Date(o.created_at));
    const cur = byDay.get(key) ?? { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += Number(o.total) || 0;
    byDay.set(key, cur);
  }
  const daily = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, orders: v.orders, revenue: +v.revenue.toFixed(2) }));

  return json(req, {
    range: { from, to, type },
    rows,
    daily,
    totals: {
      orders: (orders ?? []).length,
      revenue: +rows.reduce((s, r) => s + r.revenue, 0).toFixed(2),
      restaurants: rows.length,
    },
  });
}

async function getCsvReport(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "crm";
  const from = url.searchParams.get("from") ?? dateKey(daysAgo(29));
  const to = url.searchParams.get("to") ?? dateKey(new Date());

  const db = admin();

  if (type === "revenue" || type === "orders") {
    const { data: orders, error } = await db
      .from("orders")
      .select("id, tenant_id, total, status, order_type, created_at")
      .gte("created_at", new Date(`${from}T00:00:00Z`).toISOString())
      .lte("created_at", new Date(`${to}T23:59:59Z`).toISOString())
      .limit(20000);
    if (error) return json(req, { error: error.message }, 500);
    const { data: tenants } = await db.from("tenants").select("id, name");
    const nameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const csv = toCsv(
      ["Date", "Restaurant", "Order", "Status", "Type", "Total"],
      (orders ?? []).map((o) => [
        o.created_at,
        nameById.get(o.tenant_id) ?? "Unknown",
        o.id,
        o.status,
        o.order_type,
        Number(o.total).toFixed(2),
      ]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="swixo-${type}-${from}-to-${to}.csv"`,
      },
    });
  }

  if (type === "retention") {
    const r = await getRetention(req);
    const payload = await r.json();
    const csv = toCsv(
      ["Restaurant", "Owner", "Status", "Orders", "Last activity", "Days since activity"],
      (payload.inactive ?? []).map((t: any) => [
        t.name,
        t.ownerEmail ?? "",
        t.subscriptionStatus,
        t.orderCount,
        t.lastActivity,
        t.daysSinceActivity,
      ]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="swixo-retention-${from}-to-${to}.csv"`,
      },
    });
  }

  // crm
  const r = await getCrm(req);
  const payload = await r.json();
  const csv = toCsv(
    ["Restaurant", "Slug", "Owner", "Plan", "Status", "Orders", "Revenue", "Menu items", "Signed up", "Last activity"],
    (payload as any[]).map((t) => [
      t.name,
      t.slug,
      t.ownerEmail ?? "",
      t.plan,
      t.subscriptionStatus,
      t.orderCount,
      t.orderValue.toFixed(2),
      t.menuItemCount,
      t.createdAt,
      t.lastActivity,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="swixo-restaurants.csv"`,
    },
  });
}

// --- Audit, search, issues, tenant management -------------------------------

async function getAudit(req: Request) {
  const { data, error } = await admin()
    .from("super_admin_audit_logs")
    .select("*, admin:profiles!super_admin_audit_logs_admin_id_fkey(email, name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return json(req, { error: error.message }, 500);
  return json(req, data ?? []);
}

async function getSearch(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return json(req, { restaurants: [], users: [] });
  const needle = `%${q}%`;

  const [tRes, pRes] = await Promise.all([
    admin().from("tenants").select("id, name, slug, plan").or(`name.ilike.${needle},slug.ilike.${needle}`).limit(10),
    admin().from("profiles").select("id, email, name, tenant_id").or(`email.ilike.${needle},name.ilike.${needle}`).limit(10),
  ]);
  if (tRes.error) return json(req, { error: tRes.error.message }, 500);
  if (pRes.error) return json(req, { error: pRes.error.message }, 500);

  return json(req, { restaurants: tRes.data ?? [], users: pRes.data ?? [] });
}

async function getIssues(req: Request) {
  const { data, error } = await admin()
    .from("support_issues")
    .select("*, tenant:tenants(id, name, slug)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return json(req, { error: error.message }, 500);
  return json(req, data ?? []);
}

async function createIssue(req: Request, adminId: string) {
  const b = await req.json().catch(() => ({})) as any;
  const subject = String(b.subject ?? "").trim();
  if (!subject) return json(req, { error: "Subject is required" }, 400);

  const { data, error } = await admin()
    .from("support_issues")
    .insert({
      tenant_id: b.tenantId ?? null,
      opened_by: adminId,
      subject,
      detail: b.detail ?? null,
      priority: ["low", "normal", "high", "urgent"].includes(b.priority) ? b.priority : "normal",
      status: "open",
    })
    .select()
    .single();
  if (error) return json(req, { error: error.message }, 500);

  await logAdminAction(adminId, "issue.created", { subject, detail: b.detail }, b.tenantId);
  return json(req, data, 201);
}

async function updateIssue(req: Request, issueId: string, adminId: string) {
  const b = await req.json().catch(() => ({})) as any;
  const patch: any = {};
  if (b.status && ["open", "in_progress", "resolved"].includes(b.status)) {
    patch.status = b.status;
    patch.resolved_at = b.status === "resolved" ? new Date().toISOString() : null;
  }
  if (b.priority && ["low", "normal", "high", "urgent"].includes(b.priority)) {
    patch.priority = b.priority;
  }
  if (!Object.keys(patch).length) return json(req, { error: "Nothing to update" }, 400);

  const { data, error } = await admin()
    .from("support_issues")
    .update(patch)
    .eq("id", issueId)
    .select()
    .single();
  if (error) return json(req, { error: error.message }, 500);

  await logAdminAction(adminId, "issue.updated", { issueId, ...patch }, data.tenant_id);
  return json(req, data);
}

async function updateTenant(req: Request, tenantId: string, adminId: string) {
  const b = await req.json().catch(() => ({})) as any;
  const patch: any = {};

  if (b.plan) {
    const { data: plan } = await admin()
      .from("subscription_plans")
      .select("id")
      .eq("id", b.plan)
      .maybeSingle();
    if (!plan) return json(req, { error: `Unknown plan: ${b.plan}` }, 400);
    patch.plan = b.plan;
  }
  if (b.subscriptionStatus) {
    const allowed = ["trial", "active", "past_due", "canceled"];
    if (!allowed.includes(b.subscriptionStatus)) {
      return json(req, { error: `Unknown subscription status: ${b.subscriptionStatus}` }, 400);
    }
    patch.subscription_status = b.subscriptionStatus;
  }
  if (b.active !== undefined) patch.active = Boolean(b.active);
  if (b.trialEndsAt !== undefined) {
    patch.trial_ends_at = b.trialEndsAt ? new Date(b.trialEndsAt).toISOString() : null;
  }
  if (b.currentPeriodEnd !== undefined) {
    patch.current_period_end = b.currentPeriodEnd
      ? new Date(b.currentPeriodEnd).toISOString()
      : null;
  }
  if (!Object.keys(patch).length) return json(req, { error: "Nothing to update" }, 400);

  const { data, error } = await admin()
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select("id, name, slug, plan, active, subscription_status, trial_ends_at, current_period_end")
    .single();
  if (error) return json(req, { error: error.message }, 500);

  await logAdminAction(adminId, "tenant.updated", patch, tenantId);
  return json(req, data);
}

// --- Router -----------------------------------------------------------------

/**
 * The AI provider settings, as the dashboard sees them.
 *
 * The key is never returned. The dashboard gets a mask, the source it came
 * from and the model names, which is everything it needs to show and nothing
 * it could leak.
 */
async function getAiProvider(req: Request) {
  const config = await getGeminiConfig("gemini");
  return json(req, {
    provider: config.provider,
    configured: Boolean(config.apiKey),
    maskedKey: maskKey(config.apiKey),
    source: config.source,
    textModel: config.textModel,
    imageModel: config.imageModel,
    updatedAt: config.updatedAt,
    defaultTextModel: DEFAULT_TEXT_MODEL,
    defaultImageModel: DEFAULT_IMAGE_MODEL,
  });
}

/**
 * Save or update the provider settings.
 *
 * An empty key means "leave the key alone" — the dashboard sends the masked
 * value back unchanged most of the time, and writing that masked value over
 * the real key would break it. A key is only replaced when a new one is
 * actually supplied.
 */
async function saveAiProvider(req: Request, adminId: string) {
  const b = await req.json().catch(() => ({})) as any;

  const provider = String(b.provider ?? "gemini").trim() || "gemini";
  if (provider !== "gemini") {
    return json(req, { error: `Unknown provider "${provider}"` }, 400);
  }

  const textModel = String(b.textModel ?? "").trim() || DEFAULT_TEXT_MODEL;
  const imageModel = String(b.imageModel ?? "").trim() || DEFAULT_IMAGE_MODEL;

  const incoming = typeof b.apiKey === "string" ? b.apiKey.trim() : "";
  const current = await getGeminiConfig(provider);

  // The dashboard sends the masked key back when the field is untouched. That
  // is not a new key and must not overwrite the real one.
  const isMasked = incoming.length > 0 && incoming.includes("\u2022");
  // An empty field means "keep the key" — the dashboard sends the masked
  // value back untouched most of the time, and writing that over the real
  // key would break it. Removing a key is an explicit action.
  const nextKey = b.clearKey === true ? null : incoming && !isMasked ? incoming : current.apiKey;

  const { data, error } = await admin()
    .from("ai_provider_settings")
    .upsert(
      {
        provider,
        api_key: nextKey,
        text_model: textModel,
        image_model: imageModel,
        enabled: b.enabled === false ? false : true,
        updated_at: new Date().toISOString(),
        updated_by: adminId,
      },
      { onConflict: "provider" },
    )
    .select("provider, updated_at")
    .single();
  if (error) return json(req, { error: error.message }, 500);

  await logAdminAction(
    adminId,
    "ai_provider.updated",
    { provider, textModel, imageModel, keyChanged: Boolean(incoming && !isMasked) },
  );

  return json(req, {
    ok: true,
    provider: data.provider,
    configured: Boolean(nextKey),
    maskedKey: maskKey(nextKey),
    source: nextKey ? "database" : "none",
    textModel,
    imageModel,
    updatedAt: data.updated_at,
  });
}

/**
 * Prove the stored key works, without ever showing it.
 */
async function testAiProvider(req: Request) {
  const config = await getGeminiConfig("gemini");
  if (!config.apiKey) {
    return json(
      req,
      { error: "No API key is configured. Save one first." },
      400,
    );
  }

  try {
    const result = await testGeminiConnection({
      model: config.textModel,
      apiKey: config.apiKey,
    });
    return json(req, {
      ok: true,
      model: result.model,
      reply: result.reply,
      message: "Connected. The API key works.",
    });
  } catch (e: any) {
    return json(req, {
      ok: false,
      model: config.textModel,
      error: e?.message || "Could not reach the provider.",
    }, 400);
  }
}

/**
 * The Google Business Profile OAuth configuration, as the dashboard sees it.
 *
 * The client secret is never returned — only a mask. The client id and the
 * redirect URI are shown in full, because the administrator has to copy them
 * into the Google Cloud console, and neither is a secret.
 */
async function getGoogleConfigSettings(req: Request) {
  const config = await getGoogleConfig();
  return json(req, {
    configured: Boolean(config.clientId && config.clientSecret),
    clientId: config.clientId ?? "",
    maskedSecret: maskSecret(config.clientSecret),
    redirectUri: config.redirectUri ?? defaultRedirectUri(),
    defaultRedirectUri: defaultRedirectUri(),
    source: config.source,
    scope: GBP_SCOPE,
    updatedAt: config.updatedAt,
  });
}

/**
 * Save or update the Google OAuth configuration.
 *
 * The secret is only replaced when a new one is actually supplied; the
 * dashboard sends the masked value back untouched most of the time, and
 * writing that over the real secret would break the connection.
 */
async function saveGoogleConfig(req: Request, adminId: string) {
  const b = await req.json().catch(() => ({})) as any;
  const current = await getGoogleConfig();

  const clientId = String(b.clientId ?? "").trim();
  const redirectUri = String(b.redirectUri ?? "").trim();
  const incoming = typeof b.clientSecret === "string" ? b.clientSecret.trim() : "";

  // The dashboard sends the masked value back when the field is untouched.
  const isMasked = incoming.length > 0 && incoming.includes("\u2022");
  const nextSecret = incoming && !isMasked ? incoming : current.clientSecret;
  const nextClientId = clientId || current.clientId;

  if (!nextClientId || !nextSecret) {
    return json(req, { error: "A client id and a client secret are both needed." }, 400);
  }
  if (redirectUri && !/^https:\/\//i.test(redirectUri)) {
    return json(req, { error: "The redirect URI must start with https://" }, 400);
  }

  const { data, error } = await admin()
    .from("google_oauth_config")
    .upsert(
      {
        id: GOOGLE_CONFIG_ID,
        client_id: nextClientId,
        client_secret: nextSecret,
        redirect_uri: redirectUri || defaultRedirectUri(),
        updated_at: new Date().toISOString(),
        updated_by: adminId,
      },
      { onConflict: "id" },
    )
    .select("id, updated_at")
    .single();
  if (error) return json(req, { error: error.message }, 500);

  await logAdminAction(adminId, "google_oauth.updated", {
    clientId: nextClientId,
    redirectUri: redirectUri || defaultRedirectUri(),
    secretChanged: Boolean(incoming && !isMasked),
  });

  return json(req, {
    ok: true,
    configured: true,
    clientId: nextClientId,
    maskedSecret: maskSecret(nextSecret),
    redirectUri: redirectUri || defaultRedirectUri(),
    source: "database",
    updatedAt: data.updated_at,
  });
}

/**
 * Check the configured credentials against Google.
 */
async function testGoogleConfig(req: Request) {
  const config = await getGoogleConfig();
  if (!config.clientId || !config.clientSecret) {
    return json(req, { ok: false, error: "No client id or client secret is configured. Save one first." }, 400);
  }

  const result = await testGoogleCredentials(config);
  return json(req, {
    ok: result.ok,
    message: result.message,
    redirectUri: config.redirectUri ?? defaultRedirectUri(),
  });
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "super-admin");
  const route = segments[0] ?? "";

  const auth = await superGuard(req);
  if (!auth.ok) return auth.response;
  const adminId = auth.admin.userId;

  try {
    const method = req.method;

    if (method === "GET") {
      switch (route) {
        case "overview":
          return await getBusinessOverview(req);
        case "crm":
          return segments[1] ? await getCrmDetail(req, segments[1]) : await getCrm(req);
        case "conversion":
          return await getConversion(req);
        case "payments":
          return await getPayments(req);
        case "usage":
          return await getUsage(req);
        case "retention":
          return await getRetention(req);
        case "reports":
          if (segments[1] === "csv") return await getCsvReport(req);
          return await getReports(req);
        case "audit":
          return await getAudit(req);
        case "search":
          return await getSearch(req);
        case "issues":
          return await getIssues(req);
        case "ai-provider":
          return await getAiProvider(req);
        case "google":
          return await getGoogleConfigSettings(req);
        default:
          return json(req, { error: "Not found" }, 404);
      }
    }

    if (method === "POST") {
      if (route === "crm" && segments[2] === "notes") {
        return await addNote(req, segments[1], adminId);
      }
      if (route === "issues") return await createIssue(req, adminId);
      if (route === "google") {
        if (segments[1] === "test") return await testGoogleConfig(req);
        return await saveGoogleConfig(req, adminId);
      }
      if (route === "ai-provider") {
        // POST /ai-provider/test is the Test Connection button. Without this
        // branch the test would silently save the settings instead of
        // testing them.
        if (segments[1] === "test") return await testAiProvider(req);
        return await saveAiProvider(req, adminId);
      }
      return json(req, { error: "Not found" }, 404);
    }

    if (method === "PATCH") {
      if (route === "issues" && segments[1]) {
        return await updateIssue(req, segments[1], adminId);
      }
      if (route === "tenants" && segments[1]) {
        return await updateTenant(req, segments[1], adminId);
      }
      return json(req, { error: "Not found" }, 404);
    }

    return json(req, { error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("super-admin error:", err);
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
