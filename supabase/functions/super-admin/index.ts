import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight, subPath } from "../_shared/http.ts";
import { admin } from "../_shared/db.ts";
import { superGuard } from "../_shared/super_admin.ts";

/**
 * /functions/v1/super-admin
 * 
 * Protected administrative endpoints for global business overview and CRM.
 */

async function getBusinessOverview(req: Request) {
  // 1. Total Restaurants
  const { count: totalTenants } = await admin().from("tenants").select("*", { count: "exact", head: true });
  
  // 2. New signups (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { count: newSignups } = await admin()
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo.toISOString());

  // 3. Completed onboarding
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
    .select(`
      *,
      profiles(email)
    `)
    .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    .order("created_at", { ascending: false });

  if (error) return json(req, { error: error.message }, 500);
  return json(req, restaurants);
}

import { getPaymentAnalytics, getRevenueReports } from "./payments.ts";

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "super-admin");
  const route = segments[0];

  // Security: All super-admin routes are protected by superGuard
  const auth = await superGuard(req);
  if (!auth.ok) return auth.response;

  try {
    if (req.method === "GET") {
      if (route === "payments") return await getPaymentAnalytics(req);
      if (route === "reports") return await getRevenueReports(req);
      if (route === "overview") return await getBusinessOverview(req);
      if (route === "crm") return await getRestaurantCRM(req);
      return json(req, { error: "Not found" }, 404);
    }

    return json(req, { error: "Method not allowed" }, 405);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
