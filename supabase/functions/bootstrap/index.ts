// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { toCamel } from "../_shared/case.ts";
import { json, preflight } from "../_shared/http.ts";
import { PERMISSION_KEYS } from "../_shared/permissions.ts";

/**
 * /functions/v1/bootstrap  (GET, dashboard.view)
 *
 * Returns the entire dashboard payload for the caller's tenant in one round
 * trip: tenant, settings, users, roles, staff, categories, menu, tables,
 * orders, reservations, promos, sessions, security logs and a summary.
 *
 * Every read is scoped to `g.session.tenantId`; the Next.js version it replaces
 * already did this, and the owner/staff distinction now comes straight from the
 * resolved session instead of a second cookie lookup.
 */

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    if (req.method !== "GET") {
      return json(req, { error: "Method not allowed" }, 405);
    }

    // Authenticated, not permission-gated.
    //
    // bootstrap is the app shell's data loader, not the Dashboard module. It
    // used to require dashboard.view, which Waiter, Cashier and Kitchen do not
    // hold — so those roles loaded the staff shell from /staff/me and then got
    // a 403 for every module's data, leaving the screens empty. The module the
    // permission is named after is gated separately by the sidebar's `modules`
    // map; each endpoint still enforces its own permission for reads and writes.
    const g = await guard(req);
    if (!g.ok) return g.response;
    const tenantId = g.session.tenantId;

    const db = admin();

    const { data: tenantRow, error: tenantError } = await db
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantError) return json(req, { error: tenantError.message }, 500);
    if (!tenantRow) return json(req, { error: "Tenant not found" }, 404);

    const [
      usersRes,
      rolesRes,
      categoriesRes,
      menuRes,
      tablesRes,
      ordersRes,
      reservationsRes,
      promosRes,
      securityLogsRes,
      staffRes,
    ] = await Promise.all([
      db
        .from("profiles")
        .select("*, roleRef:roles(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      db.from("roles").select("*").eq("tenant_id", tenantId).order("created_at", {
        ascending: true,
      }),
      db.from("categories").select("*").eq("tenant_id", tenantId).order("sort_order", {
        ascending: true,
      }),
      db
        .from("menu_items")
        .select("*, category:categories(*)")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true }),
      db.from("tables").select("*").eq("tenant_id", tenantId).order("name", {
        ascending: true,
      }),
      db
        .from("orders")
        .select("*, items:order_items(*), table:tables(*), servedBy:profiles(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("reservations")
        .select("*, table:tables(*)")
        .eq("tenant_id", tenantId)
        .order("date", { ascending: true }),
      db.from("promo_codes").select("*").eq("tenant_id", tenantId).order("created_at", {
        ascending: false,
      }),
      db
        .from("security_logs")
        .select("*, user:profiles(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("staff").select("*, role:roles(*)").eq("tenant_id", tenantId).order("name", {
        ascending: true,
      }),
    ]);

    if (usersRes.error) return json(req, { error: usersRes.error.message }, 500);
    if (rolesRes.error) return json(req, { error: rolesRes.error.message }, 500);
    if (categoriesRes.error) return json(req, { error: categoriesRes.error.message }, 500);
    if (menuRes.error) return json(req, { error: menuRes.error.message }, 500);
    if (tablesRes.error) return json(req, { error: tablesRes.error.message }, 500);
    if (ordersRes.error) return json(req, { error: ordersRes.error.message }, 500);
    if (reservationsRes.error) return json(req, { error: reservationsRes.error.message }, 500);
    if (promosRes.error) return json(req, { error: promosRes.error.message }, 500);
    if (securityLogsRes.error) return json(req, { error: securityLogsRes.error.message }, 500);
    if (staffRes.error) return json(req, { error: staffRes.error.message }, 500);

    // Owner sessions belong to the profiles of this tenant.
    const profileIds = (usersRes.data ?? []).map((u: any) => u.id);
    let sessionsData: any[] = [];
    if (profileIds.length > 0) {
      const { data: sessions, error: sessionsError } = await db
        .from("user_sessions")
        .select("*, user:profiles(*)")
        .in("user_id", profileIds)
        .order("last_active", { ascending: false });
      if (sessionsError) return json(req, { error: sessionsError.message }, 500);
      sessionsData = sessions ?? [];
    }

    const { data: settingsRows, error: settingsError } = await db
      .from("settings")
      .select("key, value")
      .eq("tenant_id", tenantId);
    if (settingsError) return json(req, { error: settingsError.message }, 500);

    const settingsMap: Record<string, string> = {};
    for (const s of settingsRows ?? []) settingsMap[s.key] = s.value;

    const tenant = toCamel(tenantRow);
    const users = toCamel(usersRes.data ?? []);
    const roles = toCamel(rolesRes.data ?? []);
    const categories = toCamel(categoriesRes.data ?? []);
    const menuItems = toCamel(menuRes.data ?? []);
    const tables = toCamel(tablesRes.data ?? []);
    const orders = toCamel(ordersRes.data ?? []);
    const reservations = toCamel(reservationsRes.data ?? []);
    const promos = toCamel(promosRes.data ?? []);
    const sessions = toCamel(sessionsData);
    const securityLogs = toCamel(securityLogsRes.data ?? []);
    const staff = toCamel(staffRes.data ?? []);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysOrders = (orders as any[]).filter((o) => new Date(o.createdAt) >= today);
    const revenue = todaysOrders
      .filter((o) => o.status === "COMPLETED")
      .reduce((s: number, o: any) => s + o.total, 0);
    const activeOrders = (orders as any[]).filter(
      (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
    ).length;

    // A staff session is identified by `guard()`; fetch the extra staff fields
    // (employee id, avatar) the dashboard shows.
    let currentStaff: any = null;
    let staffPermissions: string[] = [];

    // users/roles/staff are a people directory. Only send them to a caller who
    // can actually reach the screens that show them.
    const canSeePeople =
      g.session.kind !== "staff" ||
      g.session.permissions.some((p: string) =>
        ["roles.view", "roles.manage", "staff.view", "staff.manage"].includes(p),
      );

    // The caller's effective permissions, regardless of session kind. An owner
    // holds every permission; a staff member holds their role's list. Exposing
    // this explicitly matters because previously an owner and a staff member
    // with nothing granted both arrived as an empty list, so a client could not
    // tell "can do everything" from "can do nothing" and had to guess — and
    // guessing wrong is how a restricted role got a delete button.
    const effectivePermissions: string[] =
      g.session.kind === "staff" ? [...g.session.permissions] : [...PERMISSION_KEYS];
    if (g.session.kind === "staff") {
      const { data: staffRow } = await db
        .from("staff")
        .select("*")
        .eq("id", g.session.subjectId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      staffPermissions = g.session.permissions;
      currentStaff = {
        id: g.session.subjectId,
        name: g.session.name,
        employeeId: staffRow?.employee_id,
        role: g.session.roleName,
        avatar: staffRow?.avatar,
      };
    }

    const currentUser =
      (users as any[])[0] ||
      (currentStaff
        ? {
          id: currentStaff.id,
          name: currentStaff.name,
          email: `${currentStaff.employeeId}@staff.local`,
          role: currentStaff.role,
        }
        : null);

    return json(req, {
      tenant,
      settings: settingsMap,
      currentUser,
      currentStaff,
      staffPermissions,
      permissions: effectivePermissions,
      users: canSeePeople ? users : [],
      roles: canSeePeople ? roles : [],
      staff: canSeePeople ? staff : [],
      categories,
      menuItems,
      tables,
      orders,
      reservations,
      promos,
      sessions,
      securityLogs,
      summary: {
        revenue: +revenue.toFixed(2),
        ordersToday: todaysOrders.length,
        activeOrders,
        totalTables: tables.length,
        totalMenuItems: menuItems.length,
        pendingReservations: (reservations as any[]).filter((r) => r.status === "PENDING").length,
      },
    });
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
