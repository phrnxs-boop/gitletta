// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/http.ts";

/**
 * /functions/v1/analytics
 *   GET   aggregated analytics for the caller's tenant (analytics.view)
 *
 * Ported faithfully from src/app/api/analytics/route.ts — same aggregations,
 * same rounding, same response shape.
 */

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  if (req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);

  try {
    return await get(req);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function get(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "analytics.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "7");

  const db = admin();

  const { data: orderRows, error: ordersError } = await db
    .from("orders")
    .select("*, items:order_items(*), table:tables(*)")
    .eq("tenant_id", tenantId)
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(500);
  if (ordersError) return json(req, { error: ordersError.message }, 500);

  const orders = (orderRows ?? []).map((o: any) => {
    const table = Array.isArray(o.table) ? o.table[0] : o.table;
    return {
      total: o.total,
      orderType: o.order_type,
      tableId: o.table_id,
      createdAt: o.created_at,
      items: (o.items ?? []).map((it: any) => ({
        menuItemId: it.menu_item_id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
      })),
      table: table ? { name: table.name } : null,
    };
  });

  // revenue over last N days
  const now = new Date();
  const dailyRevenue: { date: string; label: string; revenue: number; orders: number }[] = [];
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayOrders = orders.filter(
      (o: any) => new Date(o.createdAt) >= d && new Date(o.createdAt) < next,
    );
    dailyRevenue.push({
      date: d.toISOString().split("T")[0],
      label: labels[d.getDay()],
      revenue: +dayOrders.reduce((s: number, o: any) => s + o.total, 0).toFixed(2),
      orders: dayOrders.length,
    });
  }

  const totalRevenue = orders.reduce((s: number, o: any) => s + o.total, 0);
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;

  // top items
  const itemCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const o of orders) {
    for (const it of o.items) {
      if (!itemCounts[it.menuItemId]) itemCounts[it.menuItemId] = { name: it.name, qty: 0, revenue: 0 };
      itemCounts[it.menuItemId].qty += it.quantity;
      itemCounts[it.menuItemId].revenue += it.price * it.quantity;
    }
  }
  const topItems = Object.values(itemCounts).sort((a, b) => b.qty - a.qty).slice(0, 6);

  // order type breakdown
  const typeBreakdown: Record<string, { count: number; revenue: number }> = {};
  for (const o of orders) {
    const t = o.orderType;
    if (!typeBreakdown[t]) typeBreakdown[t] = { count: 0, revenue: 0 };
    typeBreakdown[t].count++;
    typeBreakdown[t].revenue += o.total;
  }

  // table performance
  const tablePerf: Record<string, { name: string; orders: number; revenue: number }> = {};
  for (const o of orders) {
    if (!o.tableId) continue;
    const name = o.table?.name || "Unknown";
    if (!tablePerf[o.tableId]) tablePerf[o.tableId] = { name, orders: 0, revenue: 0 };
    tablePerf[o.tableId].orders++;
    tablePerf[o.tableId].revenue += o.total;
  }
  const topTables = Object.values(tablePerf).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  // hourly distribution
  const hourly: number[] = new Array(24).fill(0);
  for (const o of orders) {
    hourly[new Date(o.createdAt).getHours()]++;
  }

  // category breakdown
  const { data: menuRows, error: menuError } = await db
    .from("menu_items")
    .select("id, category:categories(name)")
    .eq("tenant_id", tenantId)
    .limit(5000);
  if (menuError) return json(req, { error: menuError.message }, 500);

  const catMap: Record<string, string> = {};
  for (const m of menuRows ?? []) {
    const category = Array.isArray((m as any).category) ? (m as any).category[0] : (m as any).category;
    catMap[(m as any).id] = category?.name || "Other";
  }
  const catRevenue: Record<string, number> = {};
  for (const o of orders) {
    for (const it of o.items) {
      const cat = catMap[it.menuItemId] || "Other";
      catRevenue[cat] = (catRevenue[cat] || 0) + it.price * it.quantity;
    }
  }
  const categoryBreakdown = Object.entries(catRevenue)
    .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
    .sort((a, b) => b.value - a.value);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysOrders = orders.filter((o: any) => new Date(o.createdAt) >= today);
  const todaysRevenue = todaysOrders.reduce((s: number, o: any) => s + o.total, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yestOrders = orders.filter(
    (o: any) => new Date(o.createdAt) >= yesterday && new Date(o.createdAt) < today,
  );
  const yestRevenue = yestOrders.reduce((s: number, o: any) => s + o.total, 0);
  const revenueChange = yestRevenue ? ((todaysRevenue - yestRevenue) / yestRevenue) * 100 : 0;

  return json(req, {
    totalRevenue: +totalRevenue.toFixed(2),
    totalOrders: orders.length,
    avgOrder: +avgOrder.toFixed(2),
    todaysRevenue: +todaysRevenue.toFixed(2),
    todaysOrders: todaysOrders.length,
    revenueChange: +revenueChange.toFixed(1),
    dailyRevenue,
    topItems: topItems.map((t) => ({ ...t, revenue: +t.revenue.toFixed(2) })),
    typeBreakdown: Object.entries(typeBreakdown).map(([type, v]) => ({
      type,
      ...v,
      revenue: +v.revenue.toFixed(2),
    })),
    topTables: topTables.map((t) => ({ ...t, revenue: +t.revenue.toFixed(2) })),
    hourly,
    categoryBreakdown,
  });
}
