// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard, publicTenantId } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { body, json, preflight } from "../_shared/http.ts";

/**
 * /functions/v1/reviews
 *   POST   submit a customer review — PUBLIC (diner path)
 *   GET    list reviews for the caller's tenant (orders.view)
 *
 * Ported from src/app/api/reviews/route.ts.
 *
 * POST is the diner-facing submission path. migration
 * 0005_customer_reviews.sql is explicit that "customers submit through the
 * server route (service role), so there is deliberately no anon policy here —
 * that keeps review spam off a public write path". The route therefore stays
 * public and resolves its tenant explicitly (body.tenantId → ?tenant=/x-tenant-id),
 * never falling back to "pick a restaurant for me". GET remains owner/staff
 * only, guarded by orders.view.
 */

function mapReview(r: any) {
  const table = Array.isArray(r.table) ? r.table[0] : r.table;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tableId: r.table_id,
    rating: r.rating,
    authorName: r.author_name,
    comment: r.comment,
    tags: r.tags,
    createdAt: r.created_at,
    table: table
      ? {
          id: table.id,
          tenantId: table.tenant_id,
          name: table.name,
          seats: table.seats,
          area: table.area,
          qrToken: table.qr_token,
          active: table.active,
          createdAt: table.created_at,
        }
      : null,
  };
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  switch (req.method) {
    case "POST":
      return await create(req);
    case "GET":
      return await list(req);
    default:
      return json(req, { error: "Method not allowed" }, 405);
  }
});

async function create(req: Request): Promise<Response> {
  try {
    const b = await body(req);
    let tenantId = (b.tenantId as string | undefined) ?? (await publicTenantId(req)) ?? null;

    // A diner may instead present a table-session token; resolve its tenant.
    if (!tenantId && typeof b.tableSessionToken === "string" && b.tableSessionToken) {
      const { data } = await admin()
        .from("table_sessions")
        .select("tenant_id")
        .eq("token", b.tableSessionToken)
        .maybeSingle();
      tenantId = data?.tenant_id ?? null;
    }

    if (!tenantId) {
      return json(req, { error: "Restaurant not found" }, 404);
    }

    const rating = Math.min(5, Math.max(1, Number(b.rating) || 5));
    const authorName = String(b.authorName || "Guest").trim();
    const comment = String(b.comment || "").trim();
    const tags = Array.isArray(b.tags) ? b.tags.join(", ") : (b.tags || "");
    const tableId = b.tableId || null;

    const { data: review, error } = await admin()
      .from("customer_reviews")
      .insert({
        tenant_id: tenantId,
        table_id: tableId,
        rating,
        author_name: authorName,
        comment: comment || null,
        tags: tags || null,
      })
      .select()
      .single();
    if (error) return json(req, { error: error.message }, 500);

    return json(req, { success: true, review: mapReview(review) }, 201);
  } catch (error: any) {
    console.error("Error submitting review:", error);
    return json(req, { error: "Failed to submit review" }, 500);
  }
}

async function list(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "orders.view" });
  if (!g.ok) return g.response;

  try {
    const tenantId = g.session.tenantId;

    const { data, error } = await admin()
      .from("customer_reviews")
      .select("*, table:tables(*)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json(req, { reviews: [] });

    return json(req, { reviews: (data ?? []).map(mapReview) });
  } catch {
    return json(req, { reviews: [] });
  }
}
