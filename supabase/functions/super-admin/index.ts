import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight, subPath } from "../_shared/http.ts";
import { admin } from "../_shared/db.ts";
import { superGuard } from "../_shared/super_admin.ts";

// Inline payments logic to avoid bundling issues with local files in the MCP deploy script
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
      return json(req, { error: "Not found" }, 404);
    }

    return json(req, { error: "Method not allowed" }, 405);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
