import { admin, asUser } from "./db.ts";
import { json } from "./http.ts";
import { PERMISSION_KEYS } from "./permissions.ts";

/**
 * Session resolution for edge functions. Mirrors src/lib/session.ts so both
 * halves of the migration behave identically.
 *
 *   * owners — `Authorization: Bearer <supabase access token>`
 *   * staff  — `x-staff-session` header, or the `tablo-staff-session` cookie
 *
 * `guard()` fails closed: no session, a deactivated account, a cross-tenant
 * `x-tenant-id`, or a missing permission all produce 401/403 rather than data.
 */

export type SessionKind = "owner" | "staff";

export interface Session {
  kind: SessionKind;
  tenantId: string;
  /** `profiles.id` for owners, `staff.id` for staff. */
  subjectId: string;
  name: string;
  email: string | null;
  roleName: string;
  permissions: string[];
}

export type GuardResult =
  | { ok: true; session: Session }
  | { ok: false; response: Response };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function splitPermissions(raw: unknown): string[] {
  const value = String(raw ?? "").trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* not JSON — fall through to the comma path */
    }
  }
  return value.split(",").map((p) => p.trim()).filter(Boolean);
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function staffToken(req: Request): string | null {
  const header = req.headers.get("x-staff-session");
  if (header?.trim()) return header.trim();
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/tablo-staff-session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function claimedTenant(req: Request): string | null {
  const url = new URL(req.url);
  return req.headers.get("x-tenant-id") || url.searchParams.get("tenant");
}

async function ownerSession(req: Request): Promise<Session | null> {
  const jwt = bearer(req);
  if (!jwt) return null;

  try {
    // Verifies the signature and expiry against Supabase Auth.
    const { data, error } = await asUser(jwt).auth.getUser(jwt);
    if (error || !data?.user) return null;

    const { data: profile } = await admin()
      .from("profiles")
      .select(
        "id, tenant_id, name, email, role, role_id, active, role_row:roles!profiles_role_id_fkey (name, permissions, is_system)",
      )
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile?.tenant_id || profile.active === false) return null;

    const rel: unknown = (profile as Record<string, unknown>).role_row;
    const role = (Array.isArray(rel) ? rel[0] : rel) as
      | { name?: string; permissions?: string; is_system?: boolean }
      | null
      | undefined;

    // A profile with no role row predates roles (or is the tenant creator);
    // give it the full set so the account cannot lock itself out.
    const permissions = profile.role_id
      ? splitPermissions(role?.permissions)
      : [...PERMISSION_KEYS];

    return {
      kind: "owner",
      tenantId: profile.tenant_id,
      subjectId: profile.id,
      name: profile.name,
      email: profile.email,
      roleName: role?.name ?? profile.role ?? "Owner",
      permissions,
    };
  } catch {
    return null;
  }
}

async function staffSession(req: Request): Promise<Session | null> {
  const token = staffToken(req);
  if (!token) return null;

  const db = admin();
  const { data: session } = await db
    .from("staff_sessions")
    .select("*, staff:staff_id(*, role:roles(*))")
    .eq("token", token)
    .maybeSingle();

  if (!session) return null;

  const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  if (new Date(session.created_at).getTime() < twelveHoursAgo) {
    await db.from("staff_sessions").delete().eq("id", session.id);
    return null;
  }

  const staff = (session as Record<string, any>).staff;
  if (!staff?.active) return null;

  await db
    .from("staff_sessions")
    .update({ last_active: new Date().toISOString() })
    .eq("id", session.id);

  // `is_system` marks a built-in role, NOT the owner: the seeded Owner,
  // Manager, Waiter, Cashier and Kitchen roles are all `is_system: true`.
  // Treating it as "owner" escalated every PIN login to full tenant access.
  const isOwner = staff.role?.is_system === true && staff.role?.name === "Owner";
  let permissions = splitPermissions(staff.role?.permissions);
  if (isOwner) permissions = Array.from(new Set([...permissions, ...PERMISSION_KEYS]));

  return {
    kind: "staff",
    tenantId: staff.tenant_id,
    subjectId: staff.id,
    name: staff.name,
    email: null,
    roleName: staff.role?.name ?? "Staff",
    permissions,
  };
}

/**
 *   const g = await guard(req, { permission: "menu.manage" })
 *   if (!g.ok) return g.response
 *   const { tenantId } = g.session
 */
export async function guard(
  req: Request,
  opts: { permission?: string; anyOf?: string[] } = {},
): Promise<GuardResult> {
  const session = (await ownerSession(req)) ?? (await staffSession(req));
  if (!session) {
    return { ok: false, response: json(req, { error: "Unauthorized" }, 401) };
  }

  // A signed-in session may not address another restaurant.
  const claimed = claimedTenant(req);
  if (claimed && claimed !== session.tenantId) {
    return { ok: false, response: json(req, { error: "Forbidden" }, 403) };
  }

  if (opts.permission && !session.permissions.includes(opts.permission)) {
    return {
      ok: false,
      response: json(req, { error: "Forbidden", required: opts.permission }, 403),
    };
  }

  if (opts.anyOf && !opts.anyOf.some((p) => session.permissions.includes(p))) {
    return {
      ok: false,
      response: json(req, { error: "Forbidden", required: opts.anyOf }, 403),
    };
  }

  return { ok: true, session };
}

/**
 * Resolve a tenant for a genuinely public route from an explicit
 * `?tenant=` / `x-tenant-id` value only — never a "pick one for me" fallback.
 */
export async function publicTenantId(req: Request): Promise<string | null> {
  const key = claimedTenant(req);
  if (!key) return null;
  const db = admin();
  if (UUID_RE.test(key)) {
    const { data } = await db.from("tenants").select("id").eq("id", key).maybeSingle();
    if (data?.id) return data.id;
  }
  const { data } = await db.from("tenants").select("id").eq("slug", key).maybeSingle();
  return data?.id ?? null;
}

/** Validate a diner's table-session token. Public route helper. */
export async function tableSession(token: string): Promise<{
  id: string;
  tenantId: string;
  tableId: string;
  status: string;
} | null> {
  if (!token) return null;
  const { data } = await admin()
    .from("table_sessions")
    .select("id, tenant_id, table_id, status")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    tenantId: data.tenant_id,
    tableId: data.table_id,
    status: data.status,
  };
}
