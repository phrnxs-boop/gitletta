import { json } from "../_shared/http.ts";
import { admin } from "../_shared/db.ts";

/**
 * Handles revenue and payment analytics for the super admin.
 */
export async function getPaymentAnalytics(req: Request) {
  const db = admin();

  // 1. Calculate MRR (Monthly Recurring Revenue)
  // We sum the amount of all 'succeeded' payments in the last 30 days
  // normalized to a monthly value.
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

  // 2. Failed Transactions (last 30 days)
  const { data: failedPayments, count: failedCount } = await db
    .from("subscription_payments")
    .select("*, tenants(name)")
    .eq("status", "failed")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  // 3. Subscription Distribution
  const { data: planDist } = await db
    .from("tenants")
    .select("plan")
    .then(res => {
      const counts: Record<string, number> = {};
      res.data?.forEach(r => {
        counts[r.plan] = (counts[r.plan] || 0) + 1;
      });
      return counts;
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

export async function getRevenueReports(req: Request) {
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
