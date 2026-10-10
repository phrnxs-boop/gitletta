// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Buffer } from "node:buffer";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { embedCount, toCamel } from "../_shared/case.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/staff/<sub>
 *   GET     login                    tenant + active staff list (PUBLIC)
 *   POST    login                    PIN login; returns session token (PUBLIC)
 *   POST    logout                   end the staff session (PUBLIC)
 *   GET     me                       staff dashboard bootstrap (staff session)
 *   GET     manage                   list staff (staff.view)
 *   POST    manage                   create staff (staff.manage)
 *   PATCH   manage/[id]              update staff (staff.manage)
 *   DELETE  manage/[id]              delete staff (staff.manage)
 *   POST    manage/[id]/reset-pin    reset PIN (staff.manage)
 *   GET     activity                 staff activity log (staff.view)
 *
 * Ported from src/app/api/staff/*. The scrypt PIN hashing mirrors
 * src/lib/staff-auth.ts exactly (scrypt, per-staff hex salt, 64-byte key,
 * 5 failures → 15-minute lockout, 12-hour sessions). We never return
 * pin_hash or pin_salt.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_HOURS = 12;
const STAFF_COOKIE = "tablo-staff-session";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// PIN hashing — mirrors src/lib/staff-auth.ts (hashPin / verifyPin)
// ---------------------------------------------------------------------------

function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPin(pin: string, hash: string, salt: string): boolean {
  try {
    const testHash = scryptSync(pin, salt, 64);
    const storedHash = Buffer.from(hash, "hex");
    return testHash.length === storedHash.length && timingSafeEqual(testHash, storedHash);
  } catch {
    return false;
  }
}

function staffTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("x-staff-session");
  if (header?.trim()) return header.trim();
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/tablo-staff-session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function jsonWithCookie(req: Request, data: unknown, setCookie: string, status = 200): Response {
  const res = json(req, data, status);
  res.headers.append("Set-Cookie", setCookie);
  return res;
}

/**
 * The staff session cookie.
 *
 * `Partitioned` is load-bearing, not decoration. This cookie is issued by
 * supabase.co while the app runs on its own origin, which makes it a third-party
 * cookie — and browsers that block third-party cookies then refuse to store it
 * at all. The login would succeed, the session row would be written, and the
 * next request would arrive with no cookie and get a 401, sending staff back to
 * the name list. Partitioned cookies (CHIPS) are stored even then, scoped to the
 * site the user is actually on.
 *
 * HttpOnly stays: the token is never readable from JavaScript.
 */
function sessionCookie(token: string): string {
  return `${STAFF_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${
    SESSION_HOURS * 60 * 60
  }; SameSite=None; Secure; Partitioned`;
}

function clearCookie(): string {
  return `${STAFF_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=None; Secure; Partitioned`;
}

// ---------------------------------------------------------------------------
// authenticateStaff — mirrors src/lib/staff-auth.ts authenticateStaff
// ---------------------------------------------------------------------------

type AuthResult =
  | { ok: true; staff: any; token: string }
  | { ok: false; error: string; lockedUntil?: string };

async function authenticateStaff(tenantId: string, employeeId: string, pin: string): Promise<AuthResult> {
  const db = admin();

  const { data: staff } = await db
    .from("staff")
    .select("*, role:roles(*)")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId.trim())
    .maybeSingle();

  if (!staff) {
    return { ok: false, error: "Employee not found. Please select your name from the list." };
  }
  if (!staff.active) {
    return { ok: false, error: "Your account has been deactivated. Please contact your manager." };
  }

  // Lockout check
  if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
    const remainingMs = new Date(staff.locked_until).getTime() - Date.now();
    const mins = Math.ceil(remainingMs / 60000);
    return {
      ok: false,
      error: `Account locked. Try again in ${mins} minute(s).`,
      lockedUntil: staff.locked_until ?? undefined,
    };
  }

  const valid = verifyPin(pin, staff.pin_hash, staff.pin_salt);
  if (!valid) {
    const attempts = (staff.failed_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString()
      : null;

    await db
      .from("staff")
      .update({ failed_attempts: attempts, locked_until: lockedUntil })
      .eq("id", staff.id);

    await db.from("staff_activities").insert({
      staff_id: staff.id,
      tenant_id: tenantId,
      action: "LOGIN_FAILED",
      meta: `Attempt ${attempts}/${MAX_FAILED_ATTEMPTS}`,
    });

    if (shouldLock) {
      return {
        ok: false,
        error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
        lockedUntil: lockedUntil ?? undefined,
      };
    }
    return {
      ok: false,
      error: `Incorrect PIN. ${MAX_FAILED_ATTEMPTS - attempts} attempt(s) remaining.`,
    };
  }

  await db
    .from("staff")
    .update({ failed_attempts: 0, locked_until: null, last_login: new Date().toISOString() })
    .eq("id", staff.id);

  const { data: session } = await db
    .from("staff_sessions")
    .insert({ staff_id: staff.id })
    .select("token")
    .single();

  await db.from("staff_activities").insert({
    staff_id: staff.id,
    tenant_id: tenantId,
    action: "LOGIN",
    meta: "Staff login via PIN",
  });

  return { ok: true, staff, token: session!.token };
}

// ---------------------------------------------------------------------------
// endStaffSession — mirrors src/lib/staff-auth.ts endStaffSession
// ---------------------------------------------------------------------------

async function endStaffSession(token: string): Promise<void> {
  if (!token) return;
  const db = admin();

  const { data: session } = await db
    .from("staff_sessions")
    .select("id, staff_id, staff:staff_id (tenant_id)")
    .eq("token", token)
    .maybeSingle();
  if (!session) return;

  const rel = (session as any).staff;
  const tenantId = Array.isArray(rel) ? rel[0]?.tenant_id : rel?.tenant_id;

  if (tenantId) {
    await db.from("staff_activities").insert({
      staff_id: session.staff_id,
      tenant_id: tenantId,
      action: "LOGOUT",
      meta: "Staff logout",
    });
  }

  await db.from("staff_sessions").delete().eq("id", session.id);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "staff");
  const [head, second, third] = segments;
  const url = new URL(req.url);

  try {
    if (head === "login") {
      if (req.method === "GET") return await loginGet(req);
      if (req.method === "POST") return await loginPost(req);
      return json(req, { error: "Method not allowed" }, 405);
    }

    if (head === "logout") {
      if (req.method === "POST") return await logoutPost(req);
      return json(req, { error: "Method not allowed" }, 405);
    }

    if (head === "me") {
      if (req.method === "GET") return await meGet(req);
      return json(req, { error: "Method not allowed" }, 405);
    }

    if (head === "manage") {
      if (second && third === "reset-pin") {
        if (req.method === "POST") return await resetPin(req, second);
        return json(req, { error: "Method not allowed" }, 405);
      }
      if (!second && req.method === "GET") return await manageList(req);
      if (!second && req.method === "POST") return await manageCreate(req);
      const id = second ?? url.searchParams.get("id");
      if (req.method === "PATCH" || req.method === "PUT") return await manageUpdate(req, id);
      if (req.method === "DELETE") return await manageDelete(req, id);
      return json(req, { error: "Method not allowed" }, 405);
    }

    if (head === "activity") {
      if (req.method === "GET") return await activityGet(req);
      return json(req, { error: "Method not allowed" }, 405);
    }

    return json(req, { error: "Not found" }, 404);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

// ---------------------------------------------------------------------------
// login (PUBLIC)
// ---------------------------------------------------------------------------

/** Find a tenant by exact id, then by exact slug. */
async function findTenant(idOrSlug: string) {
  const db = admin();
  if (UUID_RE.test(idOrSlug)) {
    const { data: byId } = await db.from("tenants").select("*").eq("id", idOrSlug).maybeSingle();
    if (byId) return byId;
  }
  const { data: bySlug } = await db.from("tenants").select("*").eq("slug", idOrSlug).maybeSingle();
  return bySlug ?? null;
}

async function loginGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const db = admin();

  let tenant: any = null;

  // 1. Explicit ?tenant= slug/id
  const tenantSlug = url.searchParams.get("tenant");
  if (tenantSlug) tenant = await findTenant(tenantSlug);

  // 2. x-tenant-id header
  if (!tenant) {
    const headerId = req.headers.get("x-tenant-id");
    if (headerId) tenant = await findTenant(headerId);
  }

  // 3. Signed-in session (owner or staff)
  if (!tenant) {
    const g = await guard(req).catch(() => null);
    if (g?.ok) {
      const { data } = await db.from("tenants").select("*").eq("id", g.session.tenantId).maybeSingle();
      if (data) tenant = data;
    }
  }

  // There is deliberately NO "pick a restaurant for me" fallback here. Doing
  // so published one restaurant's name and full staff roster to any anonymous
  // caller. The tenant must be explicit (?tenant=<slug|id>) or come from a
  // signed-in session; the staff-login page is reached via a ?tenant= link.
  if (!tenant) return json(req, { error: "Restaurant not found" }, 404);

  // Deliberately not the whole tenants table. This endpoint is public, so a
  // list of every restaurant on the platform is a directory anyone can harvest
  // — and staff belong to exactly one restaurant, which the page already knows
  // from the ?tenant= link. The staff roster for THIS tenant is all it returns.
  const [staffRes] = await Promise.all([
    db
      .from("staff")
      .select("id, name, employee_id, avatar")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name", { ascending: true }),
  ]);

  if (staffRes.error) return json(req, { error: staffRes.error.message }, 500);

  const staff = (staffRes.data ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    employeeId: s.employee_id,
    avatar: s.avatar,
  }));

  return json(req, {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      logo: tenant.logo,
    },
    staff,

  });
}

async function loginPost(req: Request): Promise<Response> {
  const b = await body(req);
  const tenantId = b.tenantId as string | undefined;
  const employeeId = b.employeeId as string | undefined;
  const pin = b.pin as string | undefined;

  if (!tenantId || !employeeId || !pin) {
    return json(req, { error: "Missing required fields" }, 400);
  }

  if (!/^\d{4}$/.test(pin)) {
    return json(req, { error: "PIN must be exactly 4 digits" }, 400);
  }

  const result = await authenticateStaff(tenantId, employeeId, pin);
  if (!result.ok) {
    return json(req, { error: result.error, lockedUntil: result.lockedUntil }, 401);
  }

  return jsonWithCookie(req, {
    staff: {
      id: result.staff.id,
      name: result.staff.name,
      employeeId: result.staff.employee_id,
      role: result.staff.role?.name || "Staff",
      roleId: result.staff.role_id,
    },
    token: result.token,
  }, sessionCookie(result.token));
}

// ---------------------------------------------------------------------------
// logout (PUBLIC)
// ---------------------------------------------------------------------------

async function logoutPost(req: Request): Promise<Response> {
  const token = staffTokenFromRequest(req);
  if (token) await endStaffSession(token);
  return jsonWithCookie(req, { success: true }, clearCookie());
}

/**
 * The Owner role is not assignable to staff.
 *
 * A staff member holding it would satisfy guard()'s owner test — the same
 * `is_system && name === 'Owner'` check that grants the full permission set —
 * so a four-digit PIN would buy full access to the restaurant. The owner is the
 * person who registered the tenant; nobody is promoted to that by role
 * assignment.
 */
async function ownerRoleError(tenantId: string, roleId: unknown): Promise<string | null> {
  if (!roleId) return null;
  const { data } = await admin()
    .from("roles")
    .select("name, is_system")
    .eq("id", String(roleId))
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (data?.is_system === true && data?.name === "Owner") {
    return "The Owner role cannot be assigned to staff. Create a separate role instead.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// me
// ---------------------------------------------------------------------------

async function meGet(req: Request): Promise<Response> {
  const g = await guard(req);
  if (!g.ok || g.session.kind !== "staff") {
    return json(req, { authenticated: false, error: "Unauthorized" }, 401);
  }

  const tenantId = g.session.tenantId;
  const db = admin();

  const { data: staff } = await db
    .from("staff")
    .select("*, role:roles(*)")
    .eq("id", g.session.subjectId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!staff) return json(req, { authenticated: false, error: "Unauthorized" }, 401);

  const permissions = g.session.permissions;

  const [tenantRes, categoriesRes, menuRes, tablesRes, ordersRes, rolesRes] = await Promise.all([
    db.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    db.from("categories").select("*").eq("tenant_id", tenantId).order("sort_order", { ascending: true }),
    db
      .from("menu_items")
      .select("*, category:categories(*)")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db.from("tables").select("*").eq("tenant_id", tenantId).order("name", { ascending: true }),
    db
      .from("orders")
      .select("*, items:order_items(*), table:tables(*), servedBy:profiles(*)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("roles").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
  ]);

  if (tenantRes.error) return json(req, { error: tenantRes.error.message }, 500);
  if (categoriesRes.error) return json(req, { error: categoriesRes.error.message }, 500);
  if (menuRes.error) return json(req, { error: menuRes.error.message }, 500);
  if (tablesRes.error) return json(req, { error: tablesRes.error.message }, 500);
  if (ordersRes.error) return json(req, { error: ordersRes.error.message }, 500);
  if (rolesRes.error) return json(req, { error: rolesRes.error.message }, 500);

  const tenant = toCamel(tenantRes.data);
  const categories = toCamel(categoriesRes.data ?? []);
  const menuItems = toCamel(menuRes.data ?? []);
  const tables = toCamel(tablesRes.data ?? []);
  const orders = toCamel(ordersRes.data ?? []);
  const roles = toCamel(rolesRes.data ?? []);

  // Only the built-in Owner role gets everything — see _shared/auth.ts.
  const isOwner = staff.role?.is_system === true && staff.role?.name === "Owner";
  const hasPerm = (p: string) => isOwner || permissions.includes(p);

  const modules = {
    dashboard: hasPerm("dashboard.view"),
    orders: hasPerm("orders.view") || hasPerm("orders.manage"),
    analytics: hasPerm("analytics.view"),
    menu: hasPerm("menu.view") || hasPerm("menu.manage"),
    qr: hasPerm("tables.view") || hasPerm("tables.manage") || hasPerm("qr.manage"),
    promos: hasPerm("promos.view") || hasPerm("promos.manage"),
    roles: hasPerm("roles.view") || hasPerm("roles.manage") || hasPerm("staff.view") || hasPerm("staff.manage"),
    security: hasPerm("security.view") || hasPerm("security.manage"),
    settings: hasPerm("settings.view") || hasPerm("settings.manage"),
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysOrders = (orders as any[]).filter((o: any) => new Date(o.createdAt) >= today);
  const revenue = todaysOrders
    .filter((o: any) => o.status === "COMPLETED")
    .reduce((s: number, o: any) => s + Number(o.total), 0);
  const activeOrders = (orders as any[]).filter(
    (o: any) => !["COMPLETED", "CANCELLED"].includes(o.status),
  ).length;

  return json(req, {
    authenticated: true,
    staff: {
      id: staff.id,
      name: staff.name,
      employeeId: staff.employee_id,
      role: staff.role?.name || "Staff",
      roleId: staff.role_id,
      avatar: staff.avatar,
    },
    permissions,
    modules,
    tenant,
    categories,
    menuItems,
    tables,
    orders,
    roles,
    summary: {
      revenue: +revenue.toFixed(2),
      ordersToday: todaysOrders.length,
      activeOrders,
      totalTables: (tables as any[]).length,
      totalMenuItems: (menuItems as any[]).length,
    },
  });
}

// ---------------------------------------------------------------------------
// manage
// ---------------------------------------------------------------------------

async function manageList(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "staff.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const { data, error } = await admin()
    .from("staff")
    .select("*, role:roles(*), activities:staff_activities(count)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) return json(req, { error: error.message }, 500);

  return json(
    req,
    (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      employeeId: s.employee_id,
      active: s.active,
      roleId: s.role_id,
      roleName: s.role?.name || "—",
      roleColor: s.role?.color || "#9aa3b2",
      avatar: s.avatar,
      failedAttempts: s.failed_attempts,
      lockedUntil: s.locked_until,
      lastLogin: s.last_login,
      activityCount: embedCount(s.activities),
      createdAt: s.created_at,
    })),
  );
}

async function manageCreate(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "staff.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req);
  const name = b.name as string | undefined;
  const employeeId = b.employeeId as string | undefined;
  const roleId = b.roleId as string | undefined;
  const pin = b.pin as string | undefined;
  const active = b.active as boolean | undefined;
  const db = admin();

  if (!name?.trim() || !employeeId?.trim() || !pin) {
    return json(req, { error: "Name, employee ID, and PIN are required" }, 400);
  }

  if (!/^\d{4}$/.test(pin)) {
    return json(req, { error: "PIN must be exactly 4 digits" }, 400);
  }

  const { data: existing } = await db
    .from("staff")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId.trim())
    .maybeSingle();
  if (existing) {
    return json(req, { error: "Employee ID already exists" }, 400);
  }

  const roleError = await ownerRoleError(tenantId, roleId);
  if (roleError) return json(req, { error: roleError }, 400);

  const { hash, salt } = hashPin(pin);

  const { data: staff, error } = await db
    .from("staff")
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      employee_id: employeeId.trim(),
      role_id: roleId || null,
      pin_hash: hash,
      pin_salt: salt,
      active: active !== false,
    })
    .select("*, role:roles(*)")
    .single();

  if (error) return json(req, { error: error.message }, 500);

  return json(
    req,
    {
      id: staff.id,
      name: staff.name,
      employeeId: staff.employee_id,
      roleId: staff.role_id,
      roleName: staff.role?.name || "—",
      active: staff.active,
    },
    201,
  );
}

async function manageUpdate(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "staff.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);
  const tenantId = g.session.tenantId;
  const b = await body(req);
  const db = admin();

  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!staff) return json(req, { error: "Staff not found" }, 404);

  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = String(b.name).trim();
  if (b.roleId !== undefined) {
    const roleError = await ownerRoleError(tenantId, b.roleId);
    if (roleError) return json(req, { error: roleError }, 400);
    data.role_id = b.roleId || null;
  }
  if (b.active !== undefined) {
    data.active = b.active;
    if (b.active) {
      data.failed_attempts = 0;
      data.locked_until = null;
    }
  }

  const { data: updated, error } = await db
    .from("staff")
    .update(data)
    .eq("id", id)
    .eq("tenant_id", tenantId) // tenant scoping — see header comment
    .select("*, role:roles(*)")
    .single();

  if (error) return json(req, { error: error.message }, 500);

  return json(req, {
    id: updated.id,
    name: updated.name,
    employeeId: updated.employee_id,
    roleId: updated.role_id,
    roleName: updated.role?.name || "—",
    active: updated.active,
  });
}

async function manageDelete(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "staff.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);
  const tenantId = g.session.tenantId;
  const db = admin();

  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!staff) return json(req, { error: "Staff not found" }, 404);

  const { error } = await db.from("staff").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return json(req, { error: error.message }, 500);

  return json(req, { success: true });
}

async function resetPin(req: Request, id: string): Promise<Response> {
  const g = await guard(req, { permission: "staff.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req);
  const pin = b.pin as string | undefined;
  const db = admin();

  if (!pin || !/^\d{4}$/.test(pin)) {
    return json(req, { error: "PIN must be exactly 4 digits" }, 400);
  }

  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!staff) return json(req, { error: "Staff not found" }, 404);

  const { hash, salt } = hashPin(pin);

  const { error } = await db
    .from("staff")
    .update({
      pin_hash: hash,
      pin_salt: salt,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return json(req, { error: error.message }, 500);

  const { error: logError } = await db.from("staff_activities").insert({
    staff_id: id,
    tenant_id: tenantId,
    action: "PIN_RESET",
    meta: "PIN reset by owner",
  });

  if (logError) return json(req, { error: logError.message }, 500);

  return json(req, { success: true });
}

async function activityGet(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "staff.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");

  let query = admin()
    .from("staff_activities")
    .select("*, staff:staff(name, employee_id)")
    .eq("tenant_id", tenantId);

  if (staffId) query = query.eq("staff_id", staffId);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);

  if (error) return json(req, { error: error.message }, 500);

  return json(req, toCamel(data ?? []));
}
