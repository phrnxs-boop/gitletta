import { json } from "./http.ts";
import { admin } from "./db.ts";

/**
 * superGuard
 * 
 * A strict authorization guard for global administrative endpoints.
 * Unlike the standard guard(), this does NOT check for tenant membership.
 * It exclusively verifies that the authenticated user is marked as a super_admin.
 */
export async function superGuard(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader) {
    return {
      ok: false,
      response: json(req, { error: "Missing authentication token" }, 401),
    };
  }

  const jwt = authHeader.replace("Bearer ", "");
  
  // Use admin client to check profile status without relying on RLS (which we'll keep strict)
  const { data: profile, error } = await admin()
    .from("profiles")
    .select("is_super_admin")
    .eq("id", (await admin().auth.getUser(jwt)).data.user?.id)
    .maybeSingle();

  if (error || !profile || !profile.is_super_admin) {
    return {
      ok: false,
      response: json(req, { error: "Forbidden: Super Admin access required" }, 403),
    };
  }

  return {
    ok: true,
    profile,
  };
}

/**
 * logAdminAction
 * 
 * Inserts a record into the super_admin_audit_logs table.
 */
export async function logAdminAction(adminId: string, action: string, details: any, targetTenantId?: string) {
  await admin()
    .from("super_admin_audit_logs")
    .insert({
      admin_id: adminId,
      action,
      details,
      target_tenant_id: targetTenantId,
    });
}
