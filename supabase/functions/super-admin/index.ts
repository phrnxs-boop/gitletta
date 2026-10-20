import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight, subPath } from "../_shared/http.ts";
import { admin } from "../_shared/db.ts";
import { superGuard } from "../_shared/super_admin.ts";

// --- Payments Logic ---
async function getPaymentAnalytics(req: Request) {
  const db = admin();

  const { data: payments } = await db
    .from("subscription_payments")
    .select("amount, billing_period")
    .eq("status", "succeeded")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  let mrr = 0;
  payments?.forEach(p => {
    if (p.billing_period === 'yearly') {
      mrr += (p.amount / 12);
    } else {
      mrr += p.amount;
    }
  });

  const { data: failedPayments, count: failedCount } = await db
    .from("subscription_payments")
    .select("*, tenants(name)")
    .eq("status", "failed")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  const { data: tenants } = await db.from("tenants").select("plan");
  const planDist: Record<string, number> = {};
  tenants?.forEach(t => {
    planDist[t.plan] = (planDist[t.plan] || 0) + 1;
  });

  return json(req, {
    metrics: {
      mrr: mrr,
      failedTransactions: failedCount,
      planDistribution: planDist,
    },
    recentFailures: failedPayments,
  });
}

async function getRevenueReports(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = url.searchParams.get("end") || new Date().toISOString();

  const { data: reports, error } = await admin()
    .from("subscription_payments")
    .select("*, tenants(name)")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (error) return json(req, { error: error.message }, 500);
  return json(req, reports);
}

// --- Usage Analytics Logic ---
async function getUsageAnalytics(req: Request) {
  const db = admin();

  const { data: featureUsage } = await db
    .from("feature_usage")
    .select("feature_id, count(*)")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .group("feature_id");

  const { count: activeTenants } = await db
    .from("table_sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVE")
    .gte("last_seen_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { data: orderTrend } = await db
    .from("orders")
    .select("created_at, id")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const dailyOrders: Record<string, number> = {};
  orderTrend?.forEach(o => {
    const date = new Date(o.created_at).toISOString().split('T')[0];
    dailyOrders[date] = (dailyOrders[date] || 0) + 1;
  });

  return json(req, {
    metrics: {
      activeTenants_24h: activeTenants,
      topFeatures: featureUsage,
    },
    orderTrend: dailyOrders,
  });
}

// --- Retention & Reports Logic ---
async function getRetentionData(req: Request) {
  const db = admin();

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const { data: expiringTrials } = await db
    .from("tenants")
    .select("*, profiles(email)")
    .eq("subscription_status", "trial")
    .lte("trial_ends_at", nextWeek.toISOString())
    .gte("trial_ends_at", new Date().toISOString());

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data: inactiveSessions } = await db
    .from("table_sessions")
    .select("tenant_id")
    .lt("last_seen_at", twoWeeksAgo.toISOString())
    .eq("status", "ACTIVE");

  const inactiveSet = new Set(inactiveSessions?.map(s => s.tenant_id) || []);
  const { data: inactiveDetails } = await db
    .from("tenants")
    .select("*, profiles(email)")
    .in("id", Array.from(inactiveSet));

  return json(req, {
    expiringTrials: expiringTrials || [],
    inactiveTenants: inactiveDetails || [],
  });
}

async function getCsvReport(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "crm";
  
  let query = "";
  let headers = "";

  if (type === "crm") {
    headers = "Restaurant,Email,Plan,Status,Joined\n";
    const { data } = await admin()
      .from("tenants")
      .select("name, profiles(email), plan, active, created_at");
    
    const rows = data?.map(r => 
      `"${r.name}","${r.profiles?.email || ''}","${r.plan}","${r.active}","${r.created_at}"`
    ).join("\n") || "";
    query = headers + rows;
  } else if (type === "revenue") {
    headers = "Amount,Currency,Status,Date,Restaurant\n";
    const { data } = await admin()
      .from("subscription_payments")
      .select("amount, currency, status, created_at, tenants(name)");
    
    const rows = data?.map(r => 
      `"${r.amount}","${r.currency}","${r.status}","${r.created_at}","${r.tenants?.name || ''}"`
    ).join("\n") || "";
    query = headers + rows;
  } else {
    return json(req, { error: "Invalid report type" }, 400);
  }

  await admin()
    .from("super_admin_reports")
    .insert({
      admin_id: (await admin().auth.getUser()).data.user?.id,
      report_type: type,
      created_at: new Date().toISOString()
    });

  return new Response(query, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=swixo_${type}_report.csv`,
    },
  });
}

async function getBusinessOverview(req: Request) {
  const { count: totalTenants } = await admin().from("tenants").select("*", { count: "exact", head: true });
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { count: newSignups } = await admin()
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo.toISOString());

  const { count: completedOnboarding } = await admin()
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .eq("onboarding_done", true);

  return json(req, {
    summary: {
      totalRestaurants: totalTenants,
      newSignups: newSignups,
      completedOnboarding: completedOnboarding,
    }
  });
}

async function getRestaurantCRM(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("q") || "";

  const { data: restaurants, error } = await admin()
    .from("tenants")
    .select(`*, profiles(email)`)
    .or(`name.ilike.%${search}%,profiles.email.ilike.%${search}%`)
    .order("created_at", { ascending: false });

  if (error) return json(req, { error: error.message }, 500);
  return json(req, restaurants);
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "super-admin");
  const route = segments[0];

  const auth = await superGuard(req);
  if (!auth.ok) return auth.response;

  try {
    if (req.method === "GET") {
      if (route === "overview") return await getBusinessOverview(req);
      if (route === "crm") return await getRestaurantCRM(req);
      if (route === "payments") return await getPaymentAnalytics(req);
      if (route === "reports") return await getRevenueReports(req);
      if (route === "analytics") return await getUsageAnalytics(req);
      if (route === "retention") return await getRetentionData(req);
      if (route === "reports/csv") return await getCsvReport(req);
      return json(req, { error: "Not found" }, 404);
    }

    return json(req, { error: "Method not allowed" }, 405);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
