// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { toCamel, embedCount } from "../_shared/case.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/categories
 *   GET            list categories + item counts (menu.view)
 *   POST           create a category (menu.manage)
 *   PATCH  [?id=]  update a category (menu.manage)
 *   DELETE [?id=][&moveTo=]  delete a category (menu.manage). `moveTo` reassigns
 *                        its dishes to another category first, so they survive.
 *
 * Ported from src/app/api/categories/route.ts (a single Next route handling all
 * verbs). The Next version updated/deleted by `id` alone — every write here is
 * scoped to the caller's tenant. The views read `_count.menuItems`, so that
 * exact shape is preserved.
 */

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "categories");
  const url = new URL(req.url);

  try {
    switch (req.method) {
      case "GET":
        return await list(req);
      case "POST":
        return await create(req);
      case "PATCH":
      case "PUT":
        return await update(req, segments[0] ?? url.searchParams.get("id"));
      case "DELETE":
        return await remove(req, segments[0] ?? url.searchParams.get("id"));
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
  const tenantId = g.session.tenantId;

  const { data, error } = await admin()
    .from("categories")
    .select("*, menu_items(count)")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) return json(req, { error: error.message }, 500);

  const categories = (data ?? []).map((row: any) => {
    const { menu_items, ...rest } = row;
    // The views read `_count.menuItems`, so keep that exact shape.
    return { ...toCamel(rest), _count: { menuItems: embedCount(menu_items) } };
  });

  return json(req, categories);
}

async function create(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;
  const b = await body(req) as any;

  if (!String(b.name ?? "").trim()) return json(req, { error: "Category name is required" }, 400);

  const { data, error } = await admin()
    .from("categories")
    .insert({
      tenant_id: tenantId,
      name: String(b.name).trim(),
      icon: b.icon ?? null,
      sort_order: Number(b.sortOrder) || 0,
    })
    .select("*")
    .single();

  if (error) return json(req, { error: error.message }, 500);
  return json(req, toCamel(data), 201);
}

async function update(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;
  const b = await body(req) as any;
  const categoryId = id ?? (b.id as string | undefined);
  if (!categoryId) return json(req, { error: "id is required" }, 400);

  const patch: Record<string, any> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.icon !== undefined) patch.icon = b.icon;
  if (b.sortOrder !== undefined) patch.sort_order = Number(b.sortOrder);

  const { data, error } = await admin()
    .from("categories")
    .update(patch)
    .eq("id", categoryId)
    .eq("tenant_id", g.session.tenantId) // tenant scoping — see header
    .select("*")
    .single();

  if (error) return json(req, { error: error.message }, 500);
  return json(req, toCamel(data));
}

/**
 * DELETE /categories/:id — remove a category.
 *
 * `menu_items.category_id` is NOT NULL and its foreign key cascades, so simply
 * deleting a category takes every dish in it — with their prices, descriptions
 * and images. Nothing about that is obvious from the word "delete", so the
 * caller can pass `?moveTo=<categoryId>` to reassign those dishes first and keep
 * them. The default stays destructive because that is what the schema says, but
 * the response reports how many dishes were affected so the caller can tell the
 * owner what happened.
 */
async function remove(req: Request, id: string | null): Promise<Response> {
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;
  if (!id) return json(req, { error: "id is required" }, 400);

  const db = admin();
  const tenantId = g.session.tenantId;
  const moveTo = new URL(req.url).searchParams.get("moveTo");

  // Never let a move land on the category being deleted, and never onto another
  // restaurant's category.
  let movingTo: string | null = null;
  if (moveTo && moveTo !== id) {
    const { data } = await db
      .from("categories")
      .select("id")
      .eq("id", moveTo)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return json(req, { error: "Destination category not found" }, 400);
    movingTo = moveTo;
  }

  const { count } = await db
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id)
    .eq("tenant_id", tenantId);

  let moved = 0;
  if (movingTo && (count ?? 0) > 0) {
    const { error: moveError } = await db
      .from("menu_items")
      .update({ category_id: movingTo })
      .eq("category_id", id)
      .eq("tenant_id", tenantId);
    if (moveError) return json(req, { error: moveError.message }, 500);
    moved = count ?? 0;
  }

  const { error } = await db
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId); // tenant scoping

  if (error) return json(req, { error: error.message }, 500);
  return json(req, { success: true, moved, deletedItems: movingTo ? 0 : (count ?? 0) });
}
