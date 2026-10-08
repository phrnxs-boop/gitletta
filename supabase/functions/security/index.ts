// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { toCamel } from "../_shared/case.ts";
import { body, json, preflight } from "../_shared/http.ts";

/**
 * /functions/v1/security
 *   GET     { sessions, logs, users }  (security.view)
 *   DELETE  ?sessionId=  revoke one session (security.manage)
 *   PATCH   { action:'revoke_all' } | { userId, twoFactorEnabled } (security.manage)
 *
 * Every write is scoped to the caller's tenant. The Next.js version this
 * replaces deleted a session by `id` alone and toggled 2FA by `id` alone, which
 * let a signed-in user of one restaurant terminate sessions or flip two-factor
 * on another restaurant's profiles.
 */

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const url = new URL(req.url);

  try {
    switch (req.method) {
      case "GET":
        return await list(req);
      case "DELETE":
        return await remove(req, url.searchParams.get("sessionId") ?? url.searchParams.get("id"));
      case "PATCH":
      case "PUT":
        return await patch(req);
      default:
        return json(req, { error: "Method not allowed" }, 405);
    }
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function list(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "security.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const db = admin();

  // Users (profiles) for this tenant — sessions are scoped to these users.
  const { data: users, error: usersError } = await db
    .from("profiles")
    .select("id, name, email, two_factor_enabled, last_login, active")
    .eq("tenant_id", tenantId);

  if (usersError) return json(req, { error: usersError.message }, 500);

  const userIds = (users ?? []).map((u: any) => u.id);

  let sessions: any[] = [];
  if (userIds.length > 0) {
    const { data, error: sessionsError } = await db
      .from("user_sessions")
      .select("*, user:profiles(id, name, email)")
      .in("user_id", userIds)
      .order("last_active", { ascending: false });
    if (sessionsError) return json(req, { error: sessionsError.message }, 500);
    sessions = data ?? [];
  }

  const { data: logs, error: logsError } = await db
    .from("security_logs")
    .select("*, user:profiles(id, name, email)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (logsError) return json(req, { error: logsError.message }, 500);

  return json(req, {
    sessions: toCamel(sessions),
    logs: toCamel(logs ?? []),
    users: toCamel(users ?? []),
  });
}

async function remove(req: Request, sessionId: string | null): Promise<Response> {
  const g = await guard(req, { permission: "security.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const db = admin();

  const id = sessionId ?? ((await body(req)).sessionId as string | undefined);
  if (!id) return json(req, { error: "sessionId required" }, 400);

  // Only sessions belonging to this tenant's profiles may be deleted.
  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId);
  if (profilesError) return json(req, { error: profilesError.message }, 500);

  const ids = (profiles ?? []).map((p: any) => p.id);
  if (ids.length > 0) {
    const { error } = await db
      .from("user_sessions")
      .delete()
      .eq("id", id)
      .in("user_id", ids);
    if (error) return json(req, { error: error.message }, 500);
  }
  return json(req, { success: true });
}

async function patch(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "security.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req);
  const db = admin();

  if (b.action === "revoke_all") {
    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId);
    if (profilesError) return json(req, { error: profilesError.message }, 500);

    const ids = (profiles ?? []).map((p: any) => p.id);
    if (ids.length > 0) {
      const { error } = await db.from("user_sessions").delete().in("user_id", ids);
      if (error) return json(req, { error: error.message }, 500);
    }
    return json(req, { success: true });
  }

  if (b.userId && b.twoFactorEnabled !== undefined) {
    const { error } = await db
      .from("profiles")
      .update({ two_factor_enabled: b.twoFactorEnabled })
      .eq("id", b.userId)
      .eq("tenant_id", tenantId); // tenant scoping — see header comment
    if (error) return json(req, { error: error.message }, 500);
    return json(req, { success: true });
  }

  return json(req, { error: "invalid action" }, 400);
}
