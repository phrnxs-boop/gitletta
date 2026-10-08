// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/bill/:orderId
 *   GET   finalized bill data for an order (orders.view)
 *
 * Ported from src/app/api/bill/[orderId]/route.ts. The Next version looked the
 * order up by `id` alone — every read here is scoped to the caller's tenant.
 */

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const url = new URL(req.url);
  const segments = subPath(req, "bill");
  const orderId = segments[0] ?? url.searchParams.get("orderId") ?? url.searchParams.get("id");

  try {
    if (req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);
    return await get(req, orderId);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function get(req: Request, orderId: string | null): Promise<Response> {
  const g = await guard(req, { permission: "orders.view" });
  if (!g.ok) return g.response;
  if (!orderId) return json(req, { error: "Order not found" }, 404);

  const db = admin();
  const { data: order, error } = await db
    .from("orders")
    .select("*, items:order_items(*), table:tables(*), tenant:tenants(*), servedBy:profiles(id,name)")
    .eq("id", orderId)
    .eq("tenant_id", g.session.tenantId) // tenant scoping — see header
    .maybeSingle();

  if (error) return json(req, { error: error.message }, 500);
  if (!order) return json(req, { error: "Order not found" }, 404);

  const tenant = Array.isArray(order.tenant) ? order.tenant[0] : order.tenant;
  const table = Array.isArray(order.table) ? order.table[0] : order.table;
  const servedBy = Array.isArray(order.servedBy) ? order.servedBy[0] : order.servedBy;
  const items = Array.isArray(order.items) ? order.items : [];

  // Fetch GSTIN/FSSAI from settings (never fake these)
  const { data: settings } = await db
    .from("settings")
    .select("key, value")
    .eq("tenant_id", tenant.id);
  const settingsMap: Record<string, string> = {};
  for (const s of settings || []) settingsMap[s.key] = s.value;

  const gstin = settingsMap.gstin || null;
  const fssai = settingsMap.fssai || null;

  // Calculate GST breakup (CGST + SGST = half each of total tax, for intra-state)
  const taxRate = tenant.tax_rate;
  const cgstRate = taxRate / 2;
  const sgstRate = taxRate / 2;
  const cgstAmount = +(order.tax / 2).toFixed(2);
  const sgstAmount = +(order.tax - cgstAmount).toFixed(2);

  // Generate bill number (order number with prefix)
  const billNumber = `BILL-${String(order.order_number).padStart(6, "0")}`;

  const bill = {
    // Restaurant info
    restaurant: {
      name: tenant.name,
      tagline: tenant.tagline,
      logo: tenant.logo,
      address: tenant.address,
      phone: tenant.phone,
      email: tenant.email,
      currency: tenant.currency,
      currencySymbol: tenant.currency_symbol,
      gstin,
      fssai,
    },
    // Bill metadata
    billNumber,
    orderNumber: order.order_number,
    invoiceDate: order.created_at,
    completedAt: order.completed_at,
    // Table/session info
    table: table ? { name: table.name, seats: table.seats, area: table.area } : null,
    orderType: order.order_type,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    servedBy: servedBy?.name || null,
    // Itemized items
    items: items.map((it: any) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.price,
      total: +(it.price * it.quantity).toFixed(2),
      notes: it.notes,
    })),
    // Totals
    subtotal: order.items_total,
    discount: order.discount,
    promoCode: order.promo_code,
    taxableAmount: +(order.items_total - order.discount).toFixed(2),
    // Tax breakup
    taxBreakup: {
      rate: taxRate,
      cgstRate,
      sgstRate,
      cgstAmount,
      sgstAmount,
      totalTax: order.tax,
    },
    serviceCharge: order.service_charge,
    grandTotal: order.total,
    // Payment
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    orderStatus: order.status,
    // Footer terms
    terms: [
      "Thank you for dining with us!",
      "This is a computer-generated bill and does not require a signature.",
    ],
  };

  return json(req, bill);
}
