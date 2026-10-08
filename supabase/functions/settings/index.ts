// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { body, json, preflight } from "../_shared/http.ts";

/**
 * /functions/v1/settings
 *   GET  { tenant, settings }   (settings.view)
 *   PUT  update tenant + settings (settings.manage)
 */

function mapTenant(t: any) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    logo: t.logo,
    tagline: t.tagline,
    currency: t.currency,
    currencySymbol: t.currency_symbol,
    address: t.address,
    phone: t.phone,
    email: t.email,
    taxRate: t.tax_rate,
    serviceCharge: t.service_charge,
    plan: t.plan,
    active: t.active,
    onboardingDone: t.onboarding_done,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

async function loadSettings(tenantId: string): Promise<Record<string, string>> {
  const { data } = await admin()
    .from("settings")
    .select("key, value")
    .eq("tenant_id", tenantId);
  const settingsMap: Record<string, string> = {};
  for (const s of data ?? []) settingsMap[s.key] = s.value;
  return settingsMap;
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    switch (req.method) {
      case "GET":
        return await get(req);
      case "PUT":
      case "PATCH":
        return await put(req);
      default:
        return json(req, { error: "Method not allowed" }, 405);
    }
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function get(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const db = admin();

  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) return json(req, { error: tenantError.message }, 500);

  const { data: settings, error: settingsError } = await db
    .from("settings")
    .select("key, value")
    .eq("tenant_id", tenantId);
  if (settingsError) return json(req, { error: settingsError.message }, 500);

  const settingsMap: Record<string, string> = {};
  for (const s of settings ?? []) settingsMap[s.key] = s.value;
  return json(req, { tenant: mapTenant(tenant), settings: settingsMap });
}

async function put(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const b = await body(req);
  const db = admin();

  const tenantPayload = b.tenant as Record<string, any> | undefined;
  if (tenantPayload) {
    const { error } = await db
      .from("tenants")
      .update({
        name: tenantPayload.name,
        tagline: tenantPayload.tagline,
        address: tenantPayload.address,
        phone: tenantPayload.phone,
        email: tenantPayload.email,
        currency: tenantPayload.currency,
        currency_symbol: tenantPayload.currencySymbol,
        tax_rate: tenantPayload.taxRate,
        service_charge: tenantPayload.serviceCharge,
        logo: tenantPayload.logo,
      })
      .eq("id", tenantId); // tenant scoping
    if (error) return json(req, { error: error.message }, 500);
  }

  const settingsPayload = b.settings as Record<string, unknown> | undefined;
  if (settingsPayload) {
    for (const [key, value] of Object.entries(settingsPayload)) {
      const { error } = await db
        .from("settings")
        .upsert(
          { tenant_id: tenantId, key, value: String(value) },
          { onConflict: "tenant_id,key" },
        );
      if (error) return json(req, { error: error.message }, 500);
    }
  }

  // log it
  const { error: logError } = await db.from("security_logs").insert({
    tenant_id: tenantId,
    action: "SETTINGS_CHANGE",
    meta: "Updated restaurant settings",
    ip: "192.168.1.10",
    user_agent: "Chrome on macOS",
  });
  if (logError) return json(req, { error: logError.message }, 500);

  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) return json(req, { error: tenantError.message }, 500);

  const settingsMap = await loadSettings(tenantId);
  return json(req, { tenant: mapTenant(tenant), settings: settingsMap });
}
