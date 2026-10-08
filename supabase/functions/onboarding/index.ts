// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { PERMISSION_KEYS } from "../_shared/permissions.ts";
import { body, json, preflight } from "../_shared/http.ts";

/**
 * /functions/v1/onboarding  (POST, any signed-in session)
 *   Body: { restaurant, categories, menuItems, tables }
 *
 * Persists the restaurant details, categories, menu items, tables and default
 * roles/settings for the signed-in owner's tenant, then marks onboarding done.
 *
 * The tenant is always derived from the session — never from the request body.
 */

/** Default system roles seeded for every new tenant. */
const DEFAULT_ROLES = [
  {
    name: "Owner",
    description: "Full access to everything",
    permissions: [...PERMISSION_KEYS].join(","),
    is_system: true,
    color: "#ff7e6b",
  },
  {
    name: "Manager",
    description: "Runs the floor",
    permissions:
      "dashboard.view,orders.view,orders.manage,menu.view,menu.manage,tables.view,tables.manage,promos.view,promos.manage,analytics.view,qr.manage,staff.view",
    is_system: true,
    color: "#60a5fa",
  },
  {
    name: "Waiter",
    description: "Takes and serves orders",
    permissions: "orders.view,orders.manage,menu.view,tables.view",
    is_system: true,
    color: "#4ade80",
  },
  {
    name: "Cashier",
    description: "Handles billing and payments",
    permissions: "orders.view,orders.manage,orders.refund,menu.view,tables.view",
    is_system: true,
    color: "#fbbf24",
  },
  {
    name: "Kitchen",
    description: "Sees and advances the order queue",
    permissions: "orders.view,orders.manage,menu.view",
    is_system: true,
    color: "#c084fc",
  },
];

/** Default settings seeded for a freshly onboarded restaurant. */
const DEFAULT_SETTINGS: Record<string, string> = {
  bill_footer: "Thank you for dining with us.",
  terms: "Prices inclusive of applicable taxes unless stated.",
};

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "restaurant"
  );
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    // Authenticate first so an anonymous request of *any* method fails closed
    // with 401 rather than leaking that only POST is routed.
    const g = await guard(req);
    if (!g.ok) return g.response;

    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, 405);
    }

    const db = admin();

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", g.session.subjectId)
      .maybeSingle();
    if (profileError) return json(req, { error: profileError.message }, 500);

    const b = await body(req);
    const { restaurant, categories, menuItems, tables } = b as any;

    // Resolve (or create) the tenant this owner belongs to. The session already
    // carries the tenant, so no client-supplied id is ever trusted.
    let tenantId: string | null = g.session.tenantId ?? profile?.tenant_id ?? null;

    if (!tenantId) {
      const cleanName = String(
        restaurant?.name || g.session.email || "My Restaurant",
      ).trim();
      const baseSlug = slugify(cleanName);
      let slug = baseSlug;
      for (let i = 0; i < 5; i++) {
        const { data: existing, error } = await db
          .from("tenants")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (error) return json(req, { error: error.message }, 500);
        if (!existing) break;
        slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
      }

      const { data: tenant, error: tenantError } = await db
        .from("tenants")
        .insert({
          name: cleanName,
          slug,
          plan: "pro",
          currency: "USD",
          currency_symbol: "₹",
          active: true,
        })
        .select()
        .single();
      if (tenantError) return json(req, { error: tenantError.message }, 500);
      tenantId = tenant.id;
    }

    // 1. Update the tenant's profile fields.
    if (restaurant) {
      const updateData: Record<string, any> = {};
      if (restaurant.name) updateData.name = restaurant.name;
      if (restaurant.tagline) updateData.tagline = restaurant.tagline;
      if (restaurant.phone) updateData.phone = restaurant.phone;
      if (restaurant.email) updateData.email = restaurant.email;
      if (restaurant.address) updateData.address = restaurant.address;
      if (restaurant.currency) updateData.currency = restaurant.currency;
      if (restaurant.currencySymbol) updateData.currency_symbol = restaurant.currencySymbol;
      if (typeof restaurant.taxRate === "number") updateData.tax_rate = restaurant.taxRate;
      if (typeof restaurant.serviceCharge === "number") {
        updateData.service_charge = restaurant.serviceCharge;
      }
      if (restaurant.logo) updateData.logo = restaurant.logo;

      if (Object.keys(updateData).length > 0) {
        const { error } = await db.from("tenants").update(updateData).eq("id", tenantId);
        if (error) return json(req, { error: error.message }, 500);
      }
    }

    // 2. Seed the default system roles (idempotent).
    const { error: rolesError } = await db.from("roles").upsert(
      DEFAULT_ROLES.map((r) => ({ ...r, tenant_id: tenantId })),
      { onConflict: "tenant_id,name" },
    );
    if (rolesError) return json(req, { error: rolesError.message }, 500);

    // 3. Seed default settings (idempotent).
    const { error: settingsError } = await db.from("settings").upsert(
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
        tenant_id: tenantId,
        key,
        value,
      })),
      { onConflict: "tenant_id,key" },
    );
    if (settingsError) return json(req, { error: settingsError.message }, 500);

    // 4. Insert categories & menu items.
    if (Array.isArray(categories) && categories.length > 0) {
      const categoryMap = new Map<string, string>();

      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const { data: existingCat, error: catLookupError } = await db
          .from("categories")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("name", cat.name)
          .maybeSingle();
        if (catLookupError) return json(req, { error: catLookupError.message }, 500);

        let catRecord = existingCat;
        if (!catRecord) {
          const { data: created, error } = await db
            .from("categories")
            .insert({ tenant_id: tenantId, name: cat.name, sort_order: i })
            .select()
            .single();
          if (error) return json(req, { error: error.message }, 500);
          catRecord = created;
        }
        categoryMap.set(cat.id, catRecord!.id);
        categoryMap.set(String(cat.name).toLowerCase(), catRecord!.id);
      }

      if (Array.isArray(menuItems) && menuItems.length > 0) {
        for (let i = 0; i < menuItems.length; i++) {
          const item = menuItems[i];
          const catDbId = (item.categoryId ? categoryMap.get(item.categoryId) : null) ||
            (item.category ? categoryMap.get(String(item.category).toLowerCase()) : null) ||
            Array.from(categoryMap.values())[0];

          if (!catDbId) continue;

          const { data: existingItem, error: itemLookupError } = await db
            .from("menu_items")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("name", item.name)
            .maybeSingle();
          if (itemLookupError) return json(req, { error: itemLookupError.message }, 500);
          if (existingItem) continue;

          const tagList: string[] = Array.isArray(item.tags) ? [...item.tags] : [];
          if (item.veg && !tagList.includes("veg")) tagList.push("veg");

          const { error } = await db.from("menu_items").insert({
            tenant_id: tenantId,
            category_id: catDbId,
            name: item.name,
            description: item.description || null,
            price: Number(item.price) || 0,
            available: true,
            sort_order: i,
            image: item.image || null,
            tags: tagList.join(","),
          });
          if (error) return json(req, { error: error.message }, 500);
        }
      }
    }

    // 5. Create tables.
    const tableCount = typeof tables === "number" ? tables : 8;
    const { count: existingTableCount, error: tableCountError } = await db
      .from("tables")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (tableCountError) return json(req, { error: tableCountError.message }, 500);

    if ((existingTableCount ?? 0) === 0 && tableCount > 0) {
      const rows: Record<string, any>[] = [];
      for (let i = 1; i <= tableCount; i++) {
        rows.push({
          tenant_id: tenantId,
          name: `Table ${i}`,
          seats: i <= 2 ? 2 : i <= 6 ? 4 : 6,
          area: i <= 4 ? "Main Hall" : "Terrace",
          active: true,
        });
      }
      const { error } = await db.from("tables").insert(rows);
      if (error) return json(req, { error: error.message }, 500);
    }

    // 6. Mark onboarding complete.
    const { error: onboardingError } = await db
      .from("tenants")
      .update({ onboarding_done: true })
      .eq("id", tenantId);
    if (onboardingError) return json(req, { error: onboardingError.message }, 500);

    // 7. Link the current auth user's profile to the tenant (upsert on id).
    const { error: linkError } = await db.from("profiles").upsert(
      {
        id: g.session.subjectId,
        tenant_id: tenantId,
        email: profile?.email || g.session.email,
        name: profile?.name || g.session.name ||
          String(restaurant?.name || "Owner"),
      },
      { onConflict: "id" },
    );
    if (linkError) return json(req, { error: linkError.message }, 500);

    return json(req, { success: true, tenantId });
  } catch (error: any) {
    console.error("Onboarding complete error:", error);
    return json(req, { error: error.message || "Failed to complete onboarding" }, 500);
  }
});
