// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { toCamel } from "../_shared/case.ts";
import { PERMISSION_KEYS } from "../_shared/permissions.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/roles
 *   GET                 list roles + users + permission catalogue (roles.view)
 *   POST                create a role (roles.manage)
 *   PATCH  [?id=]       update a role (roles.manage)
 *   DELETE [?id=]       delete a role (roles.manage)
 *
 * Ported from src/app/api/roles/route.ts and src/app/api/roles/[id]/route.ts.
 * The Next.js version updated and deleted by `id` alone, letting one restaurant
 * mutate another's roles; every write here is scoped to the caller's tenant.
 */

/** Kept in sync with src/lib/constants.ts (PERMISSION_GROUPS). */
const PERMISSION_GROUPS = [
  { label: "Dashboard", perms: ["dashboard.view"] },
  { label: "Orders", perms: ["orders.view", "orders.manage"] },
  { label: "Menu", perms: ["menu.view", "menu.manage"] },
  { label: "Tables & QR", perms: ["tables.view", "tables.manage", "qr.manage"] },
  { label: "Promo Codes", perms: ["promos.view", "promos.manage"] },
  { label: "Analytics", perms: ["analytics.view"] },
  { label: "Settings", perms: ["settings.view", "settings.manage"] },
  { label: "Security", perms: ["security.view", "security.manage"] },
  {
    label: "Roles & Staff",
    perms: ["roles.view", "roles.manage", "staff.view", "staff.manage"],
  },
];

/** Serialize permissions exactly as before: comma-separated string. */
function serializePermissions(permissions: unknown): string {
  return Array.isArray(permissions) ? permissions.join(",") : String(permissions ?? "");
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "roles");
  const idFromPath = segments[0];
  const url = new URL(req.url);
  const id = idFromPath ?? url.searchParams.get("id");

  try {
    switch (req.method) {
      case "GET":
        return await list(req);
      case "POST":
        return await create(req);
      case "PATCH":
      case "PUT":
        return await update(req, id);
      case "DELETE":
        return await remove(req, id);
      default:
        return json(req, { error: "Method not allowed" }, 405);
    }
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function list(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "roles.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const [rolesRes, usersRes] = await Promise.all([
    admin().from("roles").select("*").eq("tenant_id", tenantId).order("created_at", {
      ascending: true,
    }),
    admin()
      .from("profiles")
      .select("*, roleRef:roles(*)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
  ]);

  if (rolesRes.error) return json(req, { error: rolesRes.error.message }, 500);
  if (usersRes.error) return json(req, { error: usersRes.error.message }, 500);

  return json(req, {
    roles: toCamel(rolesRes.data ?? []),
    users: toCamel(usersRes.data ?? []),
    permissionKeys: PERMISSION_KEYS,
    permissionGroups: PERMISSION_GROUPS,
  });
}

async function create(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "roles.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req);

  const { data: role, error } = await admin()
    .from("roles")
    .insert({
      tenant_id: tenantId,
      name: b.name,
      description: b.description,
      permissions: serializePermissions(b.permissions),
      color: b.color || "#ff7e6b",
    })
    .select()
    .single();

  if (error) return json(req, { error: error.message }, 500);

  return json(req, toCamel(role), 201);
}

async function update(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "roles.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);
  const tenantId = g.session.tenantId;
  const b = await body(req);

  const data: Record<string, unknown> = {};
  if (b.name) data.name = b.name;
  if (b.description !== undefined) data.description = b.description;
  if (b.permissions !== undefined) data.permissions = serializePermissions(b.permissions);
  if (b.color) data.color = b.color;

  const { data: role, error } = await admin()
    .from("roles")
    .update(data)
    .eq("id", id)
    .eq("tenant_id", tenantId) // tenant scoping — see header comment
    .select()
    .single();
  if (error) return json(req, { error: error.message }, 500);

  return json(req, toCamel(role));
}

async function remove(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "roles.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);
  const tenantId = g.session.tenantId;

  const { data: role, error: findError } = await admin()
    .from("roles")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (findError) return json(req, { error: findError.message }, 500);

  if (role?.is_system) return json(req, { error: "System roles cannot be deleted" }, 400);

  const { error } = await admin()
    .from("roles")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return json(req, { error: error.message }, 500);

  return json(req, { success: true });
}
