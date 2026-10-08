// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { toCamel } from "../_shared/case.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/menu
 *   GET                 list menu items (menu.view)
 *   POST                create an item (menu.manage)
 *   PATCH  [?id=]       update an item (menu.manage)
 *   DELETE [?id=]       delete an item (menu.manage)
 *
 * Every write is scoped to the caller's tenant. The Next.js version this
 * replaces filtered PATCH and DELETE by `id` alone, which let a signed-in user
 * of one restaurant modify or delete another restaurant's menu items.
 */

const SELECT = "*, category:categories(*)";

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "menu");
  const url = new URL(req.url);
  const idFromPath = segments[0];

  try {
    switch (req.method) {
      case "GET":
        return await list(req);
      case "POST":
        return await create(req);
      case "PATCH":
      case "PUT":
        return await update(req, idFromPath ?? url.searchParams.get("id"));
      case "DELETE":
        return await remove(req, idFromPath ?? url.searchParams.get("id"));
      default:
        return json(req, { error: "Method not allowed" }, 405);
    }
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function list(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "menu.view" });
  if (!g.ok) return g.response;

  const { data, error } = await admin()
    .from("menu_items")
    .select(SELECT)
    .eq("tenant_id", g.session.tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return json(req, { error: error.message }, 500);
  return json(req, toCamel(data ?? []));
}

async function create(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;

  const b = await body(req);
  if (!String(b.name ?? "").trim() || !b.categoryId) {
    return json(req, { error: "Name and category are required" }, 400);
  }

  const { data, error } = await admin()
    .from("menu_items")
    .insert({
      tenant_id: g.session.tenantId,
      category_id: b.categoryId,
      name: String(b.name).trim(),
      description: b.description ?? null,
      price: Number(b.price) || 0,
      image: b.image ?? null,
      available: b.available !== false,
      prep_time: Number(b.prepTime) || 15,
      calories: b.calories != null ? Number(b.calories) : null,
      tags: b.tags ?? null,
    })
    .select(SELECT)
    .single();

  if (error) return json(req, { error: error.message }, 500);
  return json(req, toCamel(data), 201);
}

async function update(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;

  const b = await body(req);
  const itemId = id ?? (b.id as string | undefined);
  if (!itemId) return json(req, { error: "id is required" }, 400);

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.description !== undefined) patch.description = b.description;
  if (b.price !== undefined) patch.price = Number(b.price);
  if (b.image !== undefined) patch.image = b.image;
  if (b.available !== undefined) patch.available = Boolean(b.available);
  if (b.tags !== undefined) patch.tags = b.tags;
  if (b.categoryId !== undefined) patch.category_id = b.categoryId;
  if (b.prepTime !== undefined) patch.prep_time = Number(b.prepTime);
  if (b.calories !== undefined) patch.calories = b.calories;

  const { data, error } = await admin()
    .from("menu_items")
    .update(patch)
    .eq("id", itemId)
    .eq("tenant_id", g.session.tenantId) // tenant scoping — see header comment
    .select(SELECT)
    .single();

  if (error) return json(req, { error: error.message }, 500);
  return json(req, toCamel(data));
}

async function remove(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);

  const { error } = await admin()
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", g.session.tenantId); // tenant scoping

  if (error) return json(req, { error: error.message }, 500);
  return json(req, { success: true });
}
