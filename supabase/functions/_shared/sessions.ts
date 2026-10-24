// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Real owner sessions, read from Supabase Auth (auth.sessions) through the
 * SECURITY DEFINER functions in migration 0036.
 *
 * The dashboard used to read a `user_sessions` table that nothing ever wrote
 * to, so "Active Sessions" was always 0 and revocation reported success while
 * deleting nothing. These helpers are the single source of truth for the wire
 * shape both `bootstrap` and `security` return, so the two endpoints can never
 * drift apart again.
 */

export interface WireSession {
  id: string;
  userId: string;
  device: string | null;
  browser: string | null;
  ip: string | null;
  location: null; // no geo data in auth.sessions; kept for UI compatibility
  current: boolean;
  lastActive: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

/** Browser family from a User-Agent string. */
export function browserFromAgent(ua: string | null): string | null {
  if (!ua) return null;
  if (ua.includes("Edg/") || ua.includes("Edge/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  return "Browser";
}

/** Device class from a User-Agent string. */
export function deviceFromAgent(ua: string | null): string | null {
  if (!ua) return null;
  if (/iPhone|iPod|Windows Phone|Mobile/.test(ua) && /Mobile/.test(ua)) return "Phone";
  if (/iPad|Tablet/.test(ua)) return "Tablet";
  if (/Macintosh|Windows|Linux|CrOS/.test(ua)) return "Desktop";
  return "Device";
}

/**
 * List the tenant's live auth sessions, newest activity first.
 * `currentSessionId` is the caller's own session (the `session_id` JWT claim)
 * so the UI can badge it; pass null when it is not known.
 */
export async function listAuthSessions(
  db: SupabaseClient,
  tenantId: string,
  currentSessionId: string | null,
): Promise<WireSession[]> {
  const { data, error } = await db.rpc("security_list_sessions", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    device: deviceFromAgent(row.user_agent),
    browser: browserFromAgent(row.user_agent),
    ip: row.ip ?? null,
    location: null,
    current: currentSessionId ? row.id === currentSessionId : false,
    lastActive: row.updated_at,
    createdAt: row.created_at,
    user: { id: row.user_id, name: row.name, email: row.email },
  }));
}

/**
 * Revoke one session. Returns the number of sessions removed — 0 means the
 * session did not belong to this tenant or was already gone, which the caller
 * must treat as a failure so the UI can never toast success over a no-op.
 */
export async function revokeAuthSession(
  db: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<number> {
  const { data, error } = await db.rpc("security_revoke_session", {
    p_tenant_id: tenantId,
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Revoke every session of every profile in the tenant. Returns sessions removed. */
export async function revokeAllAuthSessions(
  db: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { data, error } = await db.rpc("security_revoke_all_sessions", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
