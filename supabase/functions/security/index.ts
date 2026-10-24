// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { toCamel } from "../_shared/case.ts";
import {
  listAuthSessions,
  revokeAllAuthSessions,
  revokeAuthSession,
} from "../_shared/sessions.ts";
import { body, json, preflight } from "../_shared/http.ts";

/**
 * /functions/v1/security
 *   GET     { sessions, logs, users }  (security.view)
 *   DELETE  ?sessionId=  revoke one session (security.manage)
 *   PATCH   { action:'revoke_all' } | { userId, twoFactorEnabled } (security.manage)
 *
 * Sessions are the real Supabase Auth sessions (auth.sessions) via the
 * SECURITY DEFINER functions in migration 0036. The original implementation
 * read a `user_sessions` table that nothing ever wrote to, so "Active
 * Sessions" was always 0 and revocation deleted nothing while reporting
 * success. A revoke that matches no session now returns 404 so the UI can
 * never toast success over a no-op.
 *
 * Every write is scoped to the caller's tenant. The Next.js version this
 * replaces deleted a session by `id` alone and toggled 2FA by `id` alone,
 * which let a signed-in user of one restaurant terminate sessions or flip
 * two-factor on another restaurant's profiles.
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
  const db = admin();

  // Users (profiles) for this tenant — the 2FA list.
  const { data: users, error: usersError } = await db
    .from("profiles")
    .select("id, name, email, two_factor_enabled, last_login, active")
    .eq("tenant_id", g.session.tenantId);
  if (usersError) return json(req, { error: usersError.message }, 500);

  // Real auth sessions, scoped to this tenant's profiles.
  let sessions;
  try {
    sessions = await listAuthSessions(db, g.session.tenantId, g.session.sessionId);
  } catch (err) {
    return json(req, { error: (err as Error).message }, 500);
  }

  const { data: logs, error: logsError } = await db
    .from("security_logs")
    .select("*, user:profiles(id, name, email)")
    .eq("tenant_id", g.session.tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (logsError) return json(req, { error: logsError.message }, 500);

  return json(req, {
    sessions,
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

  let revoked: number;
  try {
    revoked = await revokeAuthSession(db, tenantId, id);
  } catch (err) {
    return json(req, { error: (err as Error).message }, 500);
  }
  if (revoked < 1) return json(req, { error: "Session not found" }, 404);

  // The revocation has already happened, so the audit log is best-effort: a
  // failed insert must not turn a successful revoke into an error response.
  await db.from("security_logs").insert({
    tenant_id: tenantId,
    user_id: g.session.subjectId,
    action: "SESSION_REVOKED",
    ip: req.headers.get("x-forwarded-for") || "unknown",
    user_agent: req.headers.get("user-agent") || "unknown",
    meta: `Session ${id} revoked`,
  });

  return json(req, { success: true, revoked });
}

async function patch(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "security.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req);
  const db = admin();

  if (b.action === "revoke_all") {
    let revoked: number;
    try {
      revoked = await revokeAllAuthSessions(db, tenantId);
    } catch (err) {
      return json(req, { error: (err as Error).message }, 500);
    }

    // Best-effort audit log — see remove() for why this cannot fail the request.
    await db.from("security_logs").insert({
      tenant_id: tenantId,
      user_id: g.session.subjectId,
      action: "SESSION_REVOKED",
      ip: req.headers.get("x-forwarded-for") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
      meta: `All sessions revoked (${revoked})`,
    });

    return json(req, { success: true, revoked });
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
