// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/table-session
 *   POST               diner QR handshake — PUBLIC (scoped by the anon QR token)
 *   GET  /validate     PUBLIC session check + menu payload
 *   GET  /active       active sessions grouped by table (tables.view)
 *   GET  /end          list recent sessions for a table (tables.view)
 *   POST /end          end session(s) (orders.manage)
 *   GET  /bill         resolve the latest bill for a session (orders.view)
 *
 * Ported from src/app/api/table-session/*. The diner routes carry no Supabase
 * JWT and are authenticated by the session/QR token itself, so they must not
 * call guard(). Everything else is tenant-scoped to the guard() session.
 */

interface SessionShape {
  session: {
    id: string;
    token: string;
    status: string;
    tenantId: string;
    tableId: string;
    createdAt: Date;
    endedAt: Date | null;
  };
  tenant: {
    id: string;
    name: string;
    currencySymbol: string;
    taxRate: number;
    serviceCharge: number;
  };
  table: { id: string; name: string; seats: number; area: string; active: boolean };
}

/** Mirrors shape() from src/lib/table-session.ts. Dates serialise to ISO JSON. */
function shape(row: any): SessionShape {
  const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
  const table = Array.isArray(row.table) ? row.table[0] : row.table;
  return {
    session: {
      id: row.id,
      token: row.token,
      status: row.status,
      tenantId: row.tenant_id,
      tableId: row.table_id,
      createdAt: new Date(row.created_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : null,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      currencySymbol: tenant.currency_symbol,
      taxRate: Number(tenant.tax_rate),
      serviceCharge: Number(tenant.service_charge),
    },
    table: {
      id: table.id,
      name: table.name,
      seats: table.seats,
      area: table.area,
      active: table.active,
    },
  };
}

/** Mirrors validateTableSession() from src/lib/table-session.ts. */
async function validateTableSession(params: {
  tenantId?: string | null;
  tableId?: string | null;
  sessionToken?: string | null;
}): Promise<{ ok: true; data: SessionShape } | { ok: false; error: string; status: number }> {
  const { tenantId, tableId, sessionToken } = params;

  if (!sessionToken) {
    return {
      ok: false,
      error: "Missing session credentials. Please scan the table QR code.",
      status: 401,
    };
  }

  const { data: row } = await admin()
    .from("table_sessions")
    .select("*, tenant:tenants(*), table:tables(*)")
    .eq("token", sessionToken)
    .maybeSingle();

  if (!row) {
    return { ok: false, error: "Invalid session. Please scan the table QR code.", status: 401 };
  }
  if (tenantId && row.tenant_id !== tenantId) {
    return {
      ok: false,
      error: "Session does not match this restaurant. Please scan the table QR code.",
      status: 403,
    };
  }
  if (tableId && row.table_id !== tableId) {
    return {
      ok: false,
      error: "Session does not match this table. Please scan the table QR code.",
      status: 403,
    };
  }
  if (row.status !== "ACTIVE") {
    return {
      ok: false,
      error: "Session ended. Please scan the table QR code again to continue.",
      status: 403,
    };
  }

  const data = shape(row);
  if (!data.table || !data.table.active) {
    return { ok: false, error: "This table is no longer available.", status: 403 };
  }
  return { ok: true, data };
}

/** Mirrors activateTableSession() from src/lib/table-session.ts. */
async function activateTableSession(params: { qrToken: string; deviceFp?: string }) {
  const { qrToken, deviceFp } = params;
  if (!qrToken) {
    return {
      ok: false as const,
      error: "Missing QR token. Please scan the table QR code.",
      status: 400,
    };
  }

  const { data, error } = await admin().rpc("start_table_session", {
    p_qr_token: qrToken,
    p_device_fp: deviceFp || null,
  });

  if (error) {
    if (error.message.includes("INVALID_QR")) {
      return {
        ok: false as const,
        error: "Invalid QR code. Please scan the QR code on your table.",
        status: 404,
      };
    }
    if (error.message.includes("RESTAURANT_UNAVAILABLE")) {
      return { ok: false as const, error: "This restaurant is currently unavailable.", status: 403 };
    }
    return {
      ok: false as const,
      error: "Could not start your table session. Please try again.",
      status: 500,
    };
  }

  const { data: row } = await admin()
    .from("table_sessions")
    .select("*, tenant:tenants(*), table:tables(*)")
    .eq("token", (data as any).session_token)
    .maybeSingle();

  if (!row) {
    return {
      ok: false as const,
      error: "Could not start your table session. Please try again.",
      status: 500,
    };
  }
  return { ok: true as const, data: shape(row) };
}

/** Mirrors endTableSession() from src/lib/table-session.ts. */
async function endTableSession(params: { tenantId: string; sessionId?: string; tableId?: string }) {
  const { tenantId, sessionId, tableId } = params;
  let query = admin()
    .from("table_sessions")
    .update({ status: "ENDED", ended_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");
  if (sessionId) query = query.eq("id", sessionId);
  if (tableId) query = query.eq("table_id", tableId);

  const { data, error } = await query.select("id");
  if (error) return { ok: false as const, error: error.message, status: 500 };
  return { ok: true as const, ended: data?.length ?? 0 };
}

function publishSessionEnded(tenantId: string, payload: any) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const event = { type: "SESSION_ENDED", tenantId, order: payload, timestamp: new Date().toISOString() };
  const pending = fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({
      messages: [{ topic: `orders:${tenantId}`, event: "SESSION_ENDED", payload: event }],
    }),
  }).catch(() => {});
  try {
    (globalThis as any).EdgeRuntime?.waitUntil?.(pending);
  } catch {
    /* best-effort */
  }
}

function mapTable(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    seats: row.seats,
    area: row.area,
    qrToken: row.qr_token,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapCategory(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapMenuItem(row: any) {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    available: row.available,
    prepTime: row.prep_time,
    tags: row.tags,
    calories: row.calories,
    sortOrder: row.sort_order,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: category ? mapCategory(category) : null,
  };
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "table-session");
  const route = segments[0];

  try {
    if (req.method === "POST") {
      if (route === "end") return await endSession(req);
      if (!route) return await startSession(req);
      return json(req, { error: "Not found" }, 404);
    }

    if (req.method === "GET") {
      if (route === "validate") return await validate(req);
      if (route === "active") return await active(req);
      if (route === "end") return await listSessions(req);
      if (route === "bill") return await bill(req);
      return json(req, { error: "Not found" }, 404);
    }

    return json(req, { error: "Method not allowed" }, 405);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

/** POST /table-session — PUBLIC. Customer scans a table QR code. */
async function startSession(req: Request): Promise<Response> {
  const b = await body(req);
  const result = await activateTableSession({
    qrToken: String(b.qrToken ?? ""),
    deviceFp: b.deviceFp ? String(b.deviceFp) : undefined,
  });
  if (!result.ok) return json(req, { error: result.error }, result.status);

  return json(
    req,
    {
      sessionToken: result.data.session.token,
      sessionId: result.data.session.id,
      status: result.data.session.status,
      tenant: result.data.tenant,
      table: result.data.table,
    },
    201,
  );
}

/** GET /table-session/validate — PUBLIC. Session check + menu payload. */
async function validate(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const tableId = url.searchParams.get("tableId");
  const sessionToken = url.searchParams.get("sessionToken");

  const result = await validateTableSession({ tenantId, tableId, sessionToken });
  if (!result.ok) {
    return json(req, { error: result.error, sessionStatus: "INVALID" }, result.status);
  }

  const { tenant, table } = result.data;
  const db = admin();

  const [{ data: categories }, { data: menuItems }, { data: socialSettings }] = await Promise.all([
    db.from("categories").select("*").eq("tenant_id", tenant.id).order("sort_order", { ascending: true }),
    db
      .from("menu_items")
      .select("*, category:categories(*)")
      .eq("tenant_id", tenant.id)
      .eq("available", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db.from("settings").select("*").eq("tenant_id", tenant.id).in("key", ["instagram", "facebook", "youtube"]),
  ]);

  const social: Record<string, string> = {};
  for (const s of socialSettings || []) social[s.key] = s.value;

  return json(req, {
    sessionStatus: "ACTIVE",
    session: result.data.session,
    tenant,
    table,
    social,
    categories: (categories || []).map(mapCategory),
    menuItems: (menuItems || []).map(mapMenuItem),
  });
}

/** GET /table-session/active — active sessions grouped by table (tables.view). */
async function active(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "tables.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const { data, error } = await admin()
    .from("table_sessions")
    .select("*, table:tables(*), order_rows:orders(id)")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) return json(req, { error: error.message }, 500);

  const sessions = (data || []).map((row: any) => {
    const table = Array.isArray(row.table) ? row.table[0] : row.table;
    const orders = row.order_rows || [];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tableId: row.table_id,
      token: row.token,
      status: row.status,
      deviceFp: row.device_fp,
      createdAt: row.created_at,
      endedAt: row.ended_at,
      table: table ? mapTable(table) : null,
      _count: { orders: Array.isArray(orders) ? orders.length : 0 },
    };
  });

  const byTable: Record<string, { id: string; tableId: string; table: any; sessions: any[] }> = {};
  for (const s of sessions) {
    if (!byTable[s.tableId]) {
      byTable[s.tableId] = { id: s.id, tableId: s.tableId, table: s.table, sessions: [] };
    }
    byTable[s.tableId].sessions.push(s);
  }

  return json(req, Object.values(byTable));
}

/** POST /table-session/end — end session(s) (orders.manage). */
async function endSession(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "orders.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const b = await body(req);
  const tableId = b.tableId ? String(b.tableId) : undefined;
  const sessionId = b.sessionId ? String(b.sessionId) : undefined;

  const result = await endTableSession({ tenantId, tableId, sessionId });
  if (!result.ok) return json(req, { error: result.error }, result.status);

  publishSessionEnded(tenantId, { tableId, sessionId, status: "ENDED" });

  return json(req, { success: true, ended: result.ended });
}

/** GET /table-session/end — recent sessions for a table (tables.view). */
async function listSessions(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "tables.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const url = new URL(req.url);
  const tableId = url.searchParams.get("tableId");

  let query = admin()
    .from("table_sessions")
    .select("*, table:tables(*)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (tableId) query = query.eq("table_id", tableId);

  const { data, error } = await query;
  if (error) return json(req, { error: error.message }, 500);

  return json(
    req,
    (data || []).map((row: any) => {
      const table = Array.isArray(row.table) ? row.table[0] : row.table;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        tableId: row.table_id,
        token: row.token,
        status: row.status,
        deviceFp: row.device_fp,
        createdAt: row.created_at,
        endedAt: row.ended_at,
        table: table ? mapTable(table) : null,
      };
    }),
  );
}

/** GET /table-session/bill — resolve the latest order for a session (orders.view). */
async function bill(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "orders.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  try {
    const db = admin();
    const url = new URL(req.url);
    const orderIdParam = url.searchParams.get("orderId");
    const sessionToken = url.searchParams.get("sessionToken");
    const tableIdParam = url.searchParams.get("tableId");
    const qrTokenParam =
      url.searchParams.get("qrToken") || url.searchParams.get("qr") || url.searchParams.get("table");

    // Every lookup is anchored to the caller's tenant — the Next.js version had
    // an unscoped "latest order in the system" fallback that crossed tenants.
    const latestFor = async (filters: Record<string, string>) => {
      let q = db
        .from("orders")
        .select("id, order_number")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { data } = await q.maybeSingle();
      return data;
    };

    // 1. Direct orderId lookup
    if (orderIdParam) {
      const { data: order } = await db
        .from("orders")
        .select("id, order_number")
        .eq("id", orderIdParam)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (order) {
        return json(req, { ok: true, orderId: order.id, orderNumber: order.order_number });
      }
    }

    // 1b. Direct qrToken lookup from QR scan
    if (qrTokenParam) {
      const { data: table } = await db
        .from("tables")
        .select("id, tenant_id")
        .eq("qr_token", qrTokenParam)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (table) {
        const order = await latestFor({ table_id: table.id });
        if (order) {
          return json(req, { ok: true, orderId: order.id, orderNumber: order.order_number });
        }
      }
    }

    // 2. Lookup by sessionToken
    if (sessionToken) {
      const { data: session } = await db
        .from("table_sessions")
        .select("id, tenant_id, table_id")
        .eq("token", sessionToken)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (session) {
        let order = await latestFor({ table_session_id: session.id });
        if (!order) order = await latestFor({ table_id: session.table_id });
        if (order) {
          return json(req, { ok: true, orderId: order.id, orderNumber: order.order_number });
        }
      }
    }

    // 3. Lookup by tableId
    if (tableIdParam) {
      const order = await latestFor({ table_id: tableIdParam });
      if (order) {
        return json(req, { ok: true, orderId: order.id, orderNumber: order.order_number });
      }
    }

    // 4. Fallback: latest order for this tenant
    const latestOrder = await latestFor({});
    if (latestOrder) {
      return json(req, { ok: true, orderId: latestOrder.id, orderNumber: latestOrder.order_number });
    }

    return json(req, { ok: false, error: "No bill found" }, 404);
  } catch (error: any) {
    console.error("Error finding bill for session:", error);
    return json(req, { ok: false, error: "Failed to retrieve bill" }, 500);
  }
}
