/**
 * CORS and response helpers shared by every Swixo edge function.
 *
 * The browser app runs on Vercel (or localhost:3000) and calls these functions
 * cross-origin, sending cookies, so the origin must be echoed explicitly —
 * `Access-Control-Allow-Origin: *` is illegal alongside credentials.
 */

const LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

/**
 * Normalise an allowlist entry.
 *
 * A browser always sends an Origin in the form `https://example.com`, and the
 * match below is exact. Setting `ALLOWED_ORIGINS` to a bare host
 * (`example.com`) or to a value with a trailing slash (`https://example.com/`)
 * therefore never matches — every preflight fails with a confusing "Network
 * error" in the client and nothing ever reaches the function. A bare host is
 * assumed to be https, and trailing slashes are dropped.
 */
function normalizeOrigin(entry: string): string {
  const trimmed = entry.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function allowedOrigins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  const site = Deno.env.get("SITE_URL");
  return [...LOCAL_ORIGINS, ...(site ? [normalizeOrigin(site)] : []), ...extra];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-tenant-id, x-staff-session, prefer",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function noContent(req: Request, status = 204): Response {
  return new Response(null, { status, headers: corsHeaders(req) });
}

/** Returns a 204 for CORS preflight, otherwise null. Call at the top of every handler. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? noContent(req) : null;
}

/**
 * Path segments after the function name.
 *   /functions/v1/orders/abc/items  ->  ["abc", "items"]
 *   /orders                          ->  []
 */
export function subPath(req: Request, fnName: string): string[] {
  const { pathname } = new URL(req.url);
  const idx = pathname.indexOf(fnName);
  const rest = idx >= 0 ? pathname.slice(idx + fnName.length) : pathname;
  return rest.split("/").filter(Boolean);
}

/** Parse a JSON body without throwing on an empty or malformed payload. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
