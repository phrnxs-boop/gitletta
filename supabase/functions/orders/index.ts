// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/orders
 *   GET                       list orders (orders.view)
 *   GET    /sync              incremental poll + summary (orders.view)
 *   GET    /:id               single order (orders.view)
 *   POST                      create order — PUBLIC diner path when the body
 *                             carries `tableSessionToken`, otherwise POS path
 *                             guarded by (orders.manage)
 *   PATCH  /:id               update order (orders.manage)
 *   DELETE /:id               delete order (orders.manage)
 *   POST   /:id/items         add item to order (orders.manage)
 *   PATCH  /:id/items         update/remove item (orders.manage)
 *
 * Ported from src/app/api/orders/*. Responses keep the legacy camelCase shape
 * (mapOrder/mapOrderItem) — the views depend on it.
 *
 * Tenant scoping fix: the Next.js [id] routes filtered PATCH/DELETE/GET and the
 * order_items writes by `id` alone, letting a signed-in user of one restaurant
 * mutate another restaurant's orders. Every read/write here is scoped by the
 * tenant returned by guard() (or by the table session on the public path).
 */

const ORDER_SELECT = "*, items:order_items(*), table:tables(*), servedBy:profiles(id,name)";

function mapOrderItem(row: any) {
  return {
    id: row.id,
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    notes: row.notes,
    status: row.status,
  };
}

function mapOrder(row: any) {
  const table = Array.isArray(row.table) ? row.table[0] : row.table;
  const servedBy = Array.isArray(row.servedBy) ? row.servedBy[0] : row.servedBy;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderNumber: row.order_number,
    tableId: row.table_id,
    tableSessionId: row.table_session_id,
    orderType: row.order_type,
    status: row.status,
    itemsTotal: row.items_total,
    discount: row.discount,
    tax: row.tax,
    serviceCharge: row.service_charge,
    total: row.total,
    promoCodeId: row.promo_code_id,
    promoCode: row.promo_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    notes: row.notes,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    servedById: row.served_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    items: Array.isArray(row.items) ? row.items.map(mapOrderItem) : [],
    table: table
      ? {
          id: table.id,
          tenantId: table.tenant_id,
          name: table.name,
          seats: table.seats,
          area: table.area,
          qrToken: table.qr_token,
          active: table.active,
          createdAt: table.created_at,
        }
      : null,
    servedBy: servedBy ? { id: servedBy.id, name: servedBy.name } : null,
  };
}

/**
 * Best-effort Supabase Realtime broadcast. Replaces src/lib/order-events.ts.
 * Never throws and never blocks the response: the DB write already succeeded.
 */
function publishEvent(event: { type: string; tenantId: string; order: any }) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const fullEvent = { ...event, timestamp: new Date().toISOString() };
  const pending = fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({
      messages: [{ topic: `orders:${event.tenantId}`, event: event.type, payload: fullEvent }],
    }),
  }).catch(() => {});
  try {
    (globalThis as any).EdgeRuntime?.waitUntil?.(pending);
  } catch {
    /* no waitUntil — the fire-and-forget fetch still runs */
  }
}

/** Public diner session check. Same error contract as validateTableSession(). */
async function validateDinerSession(
  token: string,
): Promise<{ ok: true; tenantId: string } | { ok: false; error: string; status: number }> {
  if (!token) {
    return { ok: false, error: "Missing session credentials. Please scan the table QR code.", status: 401 };
  }
  const { data: row } = await admin()
    .from("table_sessions")
    .select("id, tenant_id, table_id, status, table:tables(id, active)")
    .eq("token", token)
    .maybeSingle();
  if (!row) {
    return { ok: false, error: "Invalid session. Please scan the table QR code.", status: 401 };
  }
  if (row.status !== "ACTIVE") {
    return {
      ok: false,
      error: "Session ended. Please scan the table QR code again to continue.",
      status: 403,
    };
  }
  const rel = (row as any).table;
  const table = Array.isArray(rel) ? rel[0] : rel;
  if (!table || table.active === false) {
    return { ok: false, error: "This table is no longer available.", status: 403 };
  }
  return { ok: true, tenantId: row.tenant_id };
}

async function endTableSession(tenantId: string, tableId?: string, sessionId?: string) {
  let query = admin()
    .from("table_sessions")
    .update({ status: "ENDED", ended_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");
  if (sessionId) query = query.eq("id", sessionId);
  if (tableId) query = query.eq("table_id", tableId);
  await query;
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "orders");
  const url = new URL(req.url);

  try {
    switch (req.method) {
      case "GET":
        if (segments[0] === "sync") return await sync(req);
        if (segments[0]) return await getOne(req, segments[0]);
        if (url.searchParams.get("id")) return await getOne(req, url.searchParams.get("id")!);
        return await list(req);
      case "POST":
        if (segments[0] && segments[1] === "items") return await addItem(req, segments[0]);
        return await create(req);
      case "PATCH":
      case "PUT":
        if (segments[0] && segments[1] === "items") return await patchItem(req, segments[0]);
        return await update(req, segments[0] ?? url.searchParams.get("id"));
      case "DELETE":
        return await remove(req, segments[0] ?? url.searchParams.get("id"));
      default:
        return json(req, { error: "Method not allowed" }, 405);
    }
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function list(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "orders.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  let query = admin()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);
  if (type && type !== "all") query = query.eq("order_type", type);

  const { data, error } = await query;
  if (error) return json(req, { error: error.message }, 500);

  return json(req, (data || []).map(mapOrder));
}

async function getOne(req: Request, id: string): Promise<Response> {
  const g = await guard(req, { permission: "orders.view" });
  if (!g.ok) return g.response;

  const { data, error } = await admin()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .eq("tenant_id", g.session.tenantId) // tenant scoping — see header
    .maybeSingle();

  if (error) return json(req, { error: error.message }, 500);
  if (!data) return json(req, { error: "Not found" }, 404);
  return json(req, mapOrder(data));
}

async function create(req: Request): Promise<Response> {
  try {
    const b = await body(req) as any;
    const {
      orderType,
      items,
      promoCode,
      customerName,
      customerPhone,
      notes,
      servedById,
      tableSessionToken,
    } = b;

    const db = admin();

    // ── 1. Public: customer order via scanned table QR code ────────────────
    // Prices are recomputed server-side by `place_order`; the client's prices
    // are never trusted. The session is validated first so the exact 401/403
    // contract the public menu relies on is preserved.
    if (tableSessionToken) {
      const session = await validateDinerSession(tableSessionToken);
      if (!session.ok) return json(req, { error: session.error }, session.status);

      const { data: rpcData, error: rpcError } = await db.rpc("place_order", {
        p_session_token: tableSessionToken,
        p_items: (items || []).map((it: any) => ({
          menuItemId: it.menuItemId,
          quantity: Math.max(1, Number(it.quantity) || 1),
          notes: it.notes || null,
        })),
        p_customer_name: customerName || null,
        p_customer_phone: customerPhone || null,
        p_notes: notes || null,
        p_order_type: orderType || "DINE_IN",
        p_promo_code: promoCode || null,
      });

      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("EMPTY_CART")) return json(req, { error: "No valid items in order" }, 400);
        if (msg.includes("ITEM_UNAVAILABLE")) {
          return json(req, { error: "One or more items are no longer available" }, 400);
        }
        if (msg.includes("INVALID_SESSION") || msg.includes("SESSION_REQUIRED")) {
          return json(
            req,
            { error: "Session ended. Please scan the table QR code again to continue." },
            403,
          );
        }
        return json(req, { error: msg || "Failed to place order" }, 500);
      }

      const orderId = (rpcData as any)?.order_id;
      const { data: orderRow, error: fetchError } = await db
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", orderId)
        .eq("tenant_id", session.tenantId)
        .single();

      if (fetchError || !orderRow) {
        return json(req, { error: fetchError?.message || "Failed to load order" }, 500);
      }

      const order = mapOrder(orderRow);
      publishEvent({ type: "ORDER_CREATED", tenantId: order.tenantId, order });
      return json(req, order, 201);
    }

    // ── 2. POS / Staff / Dashboard order ───────────────────────────────────
    const g = await guard(req, { permission: "orders.manage" });
    if (!g.ok) return g.response;
    const tenantId = g.session.tenantId;

    let tableId: string | null = null;
    let tableSessionId: string | null = null;

    if (b.tableId) {
      tableId = b.tableId;
      const { data: activeSession } = await db
        .from("table_sessions")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("table_id", tableId)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (activeSession) tableSessionId = activeSession.id;
    }

    // Verify servedById if provided
    let validServedById: string | null = null;
    if (servedById) {
      const { data: user } = await db
        .from("profiles")
        .select("id")
        .eq("id", servedById)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (user) validServedById = user.id;
    }

    // Compute item totals from the database (never from client prices)
    let itemsTotal = 0;
    const itemData: any[] = [];
    for (const it of items || []) {
      const { data: mi } = await db
        .from("menu_items")
        .select("id, tenant_id, name, price")
        .eq("id", it.menuItemId)
        .maybeSingle();
      if (!mi) continue;
      if (mi.tenant_id !== tenantId) continue; // ensure item belongs to this tenant
      const qty = Math.max(1, Number(it.quantity) || 1);
      itemsTotal += mi.price * qty;
      itemData.push({
        menu_item_id: mi.id,
        name: mi.name,
        price: mi.price,
        quantity: qty,
        notes: it.notes || null,
        status: "PENDING",
      });
    }

    if (itemData.length === 0) {
      return json(req, { error: "No valid items in order" }, 400);
    }

    const { data: tenant } = await db
      .from("tenants")
      .select("tax_rate, service_charge")
      .eq("id", tenantId)
      .maybeSingle();
    const taxRate = (tenant?.tax_rate ?? 8) / 100;
    const serviceRate = (tenant?.service_charge ?? 0) / 100;

    let discount = 0;
    let promoCodeId: string | undefined;
    let promoCodeStr: string | undefined;
    if (promoCode) {
      const { data: promo } = await db
        .from("promo_codes")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("code", promoCode)
        .eq("active", true)
        .maybeSingle();

      if (promo) {
        if (promo.type === "PERCENTAGE") {
          discount = (itemsTotal * promo.value) / 100;
          if (promo.max_discount > 0) discount = Math.min(discount, promo.max_discount);
        } else {
          discount = promo.value;
        }
        if (itemsTotal >= promo.min_order) {
          promoCodeId = promo.id;
          promoCodeStr = promo.code;
          await db
            .from("promo_codes")
            .update({ used_count: (promo.used_count ?? 0) + 1 })
            .eq("id", promo.id)
            .eq("tenant_id", tenantId);
        } else {
          discount = 0;
        }
      }
    }

    const tax = +((itemsTotal - discount) * taxRate).toFixed(2);
    const serviceCharge = +(itemsTotal * serviceRate).toFixed(2);
    const total = +(itemsTotal - discount + tax + serviceCharge).toFixed(2);

    const { data: created, error: orderError } = await db
      .from("orders")
      .insert({
        tenant_id: tenantId,
        table_id: tableId,
        table_session_id: tableSessionId,
        order_type: orderType || "DINE_IN",
        status: "PENDING",
        items_total: +itemsTotal.toFixed(2),
        discount: +discount.toFixed(2),
        tax,
        service_charge: serviceCharge,
        total,
        promo_code_id: promoCodeId,
        promo_code: promoCodeStr,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        notes: notes || null,
        served_by_id: validServedById,
      })
      .select()
      .single();

    if (orderError || !created) {
      return json(req, { error: orderError?.message || "Failed to place order" }, 500);
    }

    const { error: itemsError } = await db
      .from("order_items")
      .insert(itemData.map((it) => ({ ...it, order_id: created.id })));

    if (itemsError) return json(req, { error: itemsError.message }, 500);

    const { data: orderRow, error: fetchError } = await db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", created.id)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !orderRow) {
      return json(req, { error: fetchError?.message || "Failed to load order" }, 500);
    }

    const order = mapOrder(orderRow);
    publishEvent({ type: "ORDER_CREATED", tenantId, order });
    return json(req, order, 201);
  } catch (error: any) {
    console.error("Order creation error:", error);
    return json(req, { error: error?.message || "Failed to place order" }, 500);
  }
}

async function update(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "orders.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);

  const b = await body(req) as any;
  const data: any = {};
  if (b.status) {
    data.status = b.status;
    if (b.status === "COMPLETED") {
      data.completed_at = new Date().toISOString();
      data.payment_status = "PAID";
    }
  }
  if (b.paymentMethod) data.payment_method = b.paymentMethod;
  if (b.paymentStatus) data.payment_status = b.paymentStatus;
  if (b.tableId !== undefined) data.table_id = b.tableId || null;
  if (b.customerName !== undefined) data.customer_name = b.customerName;
  if (b.notes !== undefined) data.notes = b.notes;

  const { data: updated, error: updateError } = await admin()
    .from("orders")
    .update(data)
    .eq("id", id)
    .eq("tenant_id", g.session.tenantId) // tenant scoping — see header
    .select(ORDER_SELECT)
    .single();

  if (updateError || !updated) {
    return json(req, { error: updateError?.message || "Failed to update order" }, 500);
  }

  const order = mapOrder(updated);

  // If order was marked COMPLETED for a table, instantly end any active session
  // for that table. Best-effort — a failure must not fail the request.
  if (order.status === "COMPLETED" && order.tableId) {
    try {
      await endTableSession(order.tenantId, order.tableId);
    } catch (e) {
      console.error("Failed to end table session on order completion:", e);
    }
  }

  publishEvent({ type: "ORDER_UPDATED", tenantId: order.tenantId, order });
  if (order.status === "COMPLETED" && order.tableId) {
    publishEvent({
      type: "SESSION_ENDED",
      tenantId: order.tenantId,
      order: { id: order.id, tableId: order.tableId, status: "COMPLETED" },
    });
  }

  return json(req, order);
}

async function remove(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "orders.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);

  const db = admin();
  const { data: order } = await db
    .from("orders")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", g.session.tenantId) // tenant scoping — see header
    .maybeSingle();

  if (order) {
    await db.from("orders").delete().eq("id", id).eq("tenant_id", g.session.tenantId);
    publishEvent({ type: "ORDER_DELETED", tenantId: order.tenant_id, order: { id } });
  }

  return json(req, { success: true });
}

/** Recompute an order's totals from its current items, matching the old logic. */
async function recalcOrderTotals(orderId: string, tenantId: string) {
  const db = admin();

  const { data: order } = await db
    .from("orders")
    .select("tenant_id, discount")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!order) return;

  const { data: items } = await db
    .from("order_items")
    .select("price, quantity")
    .eq("order_id", orderId);

  const itemsTotal = (items || []).reduce((s, i) => s + i.price * i.quantity, 0);

  const { data: tenant } = await db
    .from("tenants")
    .select("tax_rate, service_charge")
    .eq("id", order.tenant_id)
    .maybeSingle();

  const taxRate = (tenant?.tax_rate ?? 8) / 100;
  const serviceRate = (tenant?.service_charge ?? 0) / 100;
  const discount = order.discount || 0;
  const tax = +((itemsTotal - discount) * taxRate).toFixed(2);
  const serviceCharge = +(itemsTotal * serviceRate).toFixed(2);
  const total = +(itemsTotal - discount + tax + serviceCharge).toFixed(2);

  await db
    .from("orders")
    .update({
      items_total: +itemsTotal.toFixed(2),
      tax,
      service_charge: serviceCharge,
      total,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
}

// Add item to existing order
async function addItem(req: Request, orderId: string): Promise<Response> {
  const g = await guard(req, { permission: "orders.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req) as any;
  const db = admin();

  // The order must belong to the caller's tenant.
  const { data: orderRow } = await db
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!orderRow) return json(req, { error: "Order not found" }, 404);

  const { data: mi, error: miError } = await db
    .from("menu_items")
    .select("id, name, price")
    .eq("id", b.menuItemId)
    .eq("tenant_id", tenantId) // tenant scoping — see header
    .maybeSingle();

  if (miError) return json(req, { error: miError.message }, 500);
  if (!mi) return json(req, { error: "Menu item not found" }, 404);

  const { data: item, error: itemError } = await db
    .from("order_items")
    .insert({
      order_id: orderId,
      menu_item_id: mi.id,
      name: mi.name,
      price: mi.price,
      quantity: b.quantity || 1,
      notes: b.notes,
      status: "PENDING",
    })
    .select()
    .single();

  if (itemError || !item) {
    return json(req, { error: itemError?.message || "Failed to add item" }, 500);
  }

  await recalcOrderTotals(orderId, tenantId);
  return json(req, mapOrderItem(item), 201);
}

// Update item quantity / remove
async function patchItem(req: Request, orderId: string): Promise<Response> {
  const g = await guard(req, { permission: "orders.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req) as any;
  const db = admin();

  const { data: orderRow } = await db
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!orderRow) return json(req, { error: "Order not found" }, 404);

  if (b.itemId) {
    if (b.action === "remove") {
      await db.from("order_items").delete().eq("id", b.itemId).eq("order_id", orderId);
    } else if (b.quantity) {
      await db
        .from("order_items")
        .update({ quantity: b.quantity })
        .eq("id", b.itemId)
        .eq("order_id", orderId);
    }
  }

  await recalcOrderTotals(orderId, tenantId);

  const { data: order } = await db
    .from("orders")
    .select("*, items:order_items(*), table:tables(*)")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (order) return json(req, mapOrder(order));
  return json(req, { error: "Order not found" }, 404);
}

async function sync(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "orders.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const db = admin();

  // Incremental poll: orders changed after `since`.
  let changedQuery = db
    .from("orders")
    .select("*, items:order_items(*), table:tables(*), servedBy:profiles(id,name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      changedQuery = changedQuery.gt("updated_at", sinceDate.toISOString());
    }
  }

  const [{ data: changedOrders }, { data: allOrders }] = await Promise.all([
    changedQuery,
    db
      .from("orders")
      .select("id, status, total, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const orders = (changedOrders || []).map(mapOrder);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysOrders = (allOrders || []).filter((o) => new Date(o.created_at) >= today);
  const revenue = todaysOrders
    .filter((o) => o.status === "COMPLETED")
    .reduce((s, o) => s + o.total, 0);
  const activeOrders = (allOrders || []).filter(
    (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
  ).length;

  return json(req, {
    orders,
    summary: {
      revenue: +revenue.toFixed(2),
      ordersToday: todaysOrders.length,
      activeOrders,
    },
    serverTime: new Date().toISOString(),
  });
}
