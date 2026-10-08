// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { admin } from "../_shared/db.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/google-reviews/<sub>
 *   GET     settings     connection + reviews + settings (settings.view)
 *   PUT     settings     update connection settings (settings.manage)
 *   GET     connect      OAuth URL, or seed a demo connection (settings.manage)
 *   DELETE  connect      disconnect: drop the connection + its reviews (settings.manage)
 *   POST    sync         manual review sync, throttled (settings.manage)
 *   POST    respond      reply to a review (settings.manage)
 *   GET     callback     OAuth redirect target — PUBLIC
 *
 * Ported from src/app/api/google-reviews/{settings,connect,sync,respond,callback}.
 * The Google helper library (src/lib/google-reviews.ts) is inlined here because
 * the deploy bundle only ships `_shared/*` plus the function entrypoint.
 */

// ---------------------------------------------------------------------------
// Google helper library (inlined from src/lib/google-reviews.ts)
// ---------------------------------------------------------------------------

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_BM_BASE = "https://mybusiness.googleapis.com/v4";

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
}

function googleClientId(): string | undefined {
  return Deno.env.get("GOOGLE_CLIENT_ID") ?? undefined;
}
function googleClientSecret(): string | undefined {
  return Deno.env.get("GOOGLE_CLIENT_SECRET") ?? undefined;
}
function hasGoogleCreds(): boolean {
  return !!googleClientId() && !!googleClientSecret();
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens | { error: string }> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    return { error: "Google OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)" };
  }

  const payload = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: payload,
  });

  const data = await res.json();
  if (!res.ok) {
    return { error: data.error_description || data.error || "Token exchange failed" };
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens | { error: string }> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return { error: "Google OAuth not configured" };

  const payload = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: payload,
  });

  const data = await res.json();
  if (!res.ok) {
    return { error: data.error_description || data.error || "Token refresh failed" };
  }

  return {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function getValidAccessToken(connectionId: string): Promise<{ token: string } | { error: string }> {
  const db = admin();
  const { data: conn, error } = await db
    .from("google_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!conn) return { error: "Google connection not found" };
  if (!conn.enabled) return { error: "Google connection is disabled" };

  const now = Date.now();
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;

  if (expiresAt - now > 60000) return { token: conn.access_token };

  if (!conn.refresh_token) {
    return { error: "Refresh token missing — re-connect Google Business Profile" };
  }

  const refreshed = await refreshAccessToken(conn.refresh_token);
  if ("error" in refreshed) {
    await db.from("google_connections").update({ last_sync_error: refreshed.error }).eq("id", connectionId);
    return { error: refreshed.error };
  }

  await db
    .from("google_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(refreshed.expires_at).toISOString(),
      last_sync_error: null,
    })
    .eq("id", connectionId);

  return { token: refreshed.access_token };
}

async function syncReviews(connectionId: string): Promise<{ synced: number; error?: string }> {
  const db = admin();
  const { data: conn, error } = await db
    .from("google_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) return { synced: 0, error: error.message };
  if (!conn) return { synced: 0, error: "Connection not found" };
  if (!conn.enabled) return { synced: 0, error: "Connection disabled" };

  // Throttle: don't sync more often than syncIntervalMins (unless forced)
  if (conn.last_synced_at) {
    const elapsed = Date.now() - new Date(conn.last_synced_at).getTime();
    const minElapsed = (conn.sync_interval_mins ?? 60) * 60 * 1000;
    if (elapsed < minElapsed) {
      return {
        synced: 0,
        error: `Throttled — next sync available in ${Math.ceil((minElapsed - elapsed) / 60000)} min`,
      };
    }
  }

  // Demo mode: if no real Google credentials, seed sample reviews
  if (!hasGoogleCreds() || !conn.location_id) {
    return seedDemoReviews(conn.tenant_id, connectionId);
  }

  const tokenResult = await getValidAccessToken(connectionId);
  if ("error" in tokenResult) {
    await db.from("google_connections").update({ last_sync_error: tokenResult.error }).eq("id", connectionId);
    return { synced: 0, error: tokenResult.error };
  }

  try {
    const res = await fetch(
      `${GOOGLE_BM_BASE}/accounts/${conn.account_name}/locations/${conn.location_id}/reviews?pageSize=50`,
      { headers: { authorization: `Bearer ${tokenResult.token}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `Google API error (${res.status})`;
      await db
        .from("google_connections")
        .update({ last_sync_error: msg, last_synced_at: new Date().toISOString() })
        .eq("id", connectionId);
      return { synced: 0, error: msg };
    }

    const data = await res.json();
    const reviews = data.reviews || [];
    let count = 0;

    for (const r of reviews) {
      const reviewId = r.reviewId || r.name?.split("/").pop();
      if (!reviewId) continue;

      const { error: upsertError } = await db
        .from("google_reviews")
        .upsert(
          {
            tenant_id: conn.tenant_id,
            connection_id: connectionId,
            google_review_id: reviewId,
            author_name: r.reviewer?.displayName || "Anonymous",
            author_photo_url: r.reviewer?.profilePhotoUrl || null,
            rating: r.starRating ? parseInt(r.starRating) : 5,
            comment: r.comment || null,
            create_time: r.createTime ? new Date(r.createTime).toISOString() : null,
            update_time: r.updateTime ? new Date(r.updateTime).toISOString() : null,
            reply: r.reviewReply?.comment || null,
            reply_time: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime).toISOString() : null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,google_review_id" },
        );
      if (upsertError) throw new Error(upsertError.message);
      count++;
    }

    await db
      .from("google_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", connectionId);

    return { synced: count };
  } catch (e: any) {
    const msg = e?.message || "Sync failed";
    await db
      .from("google_connections")
      .update({ last_sync_error: msg, last_synced_at: new Date().toISOString() })
      .eq("id", connectionId);
    return { synced: 0, error: msg };
  }
}

async function replyToReview(
  connectionId: string,
  reviewId: string,
  replyText: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = admin();
  const { data: conn, error } = await db
    .from("google_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!conn) return { ok: false, error: "Connection not found" };

  const { data: review, error: reviewError } = await db
    .from("google_reviews")
    .select("*")
    .eq("connection_id", connectionId)
    .eq("id", reviewId)
    .maybeSingle();
  if (reviewError) return { ok: false, error: reviewError.message };
  if (!review) return { ok: false, error: "Review not found" };

  if (!hasGoogleCreds() || !conn.location_id) {
    const { error: updateError } = await db
      .from("google_reviews")
      .update({ reply: replyText, reply_time: new Date().toISOString() })
      .eq("id", reviewId);
    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true };
  }

  const tokenResult = await getValidAccessToken(connectionId);
  if ("error" in tokenResult) return { ok: false, error: tokenResult.error };

  try {
    const res = await fetch(
      `${GOOGLE_BM_BASE}/accounts/${conn.account_name}/locations/${conn.location_id}/reviews/${review.google_review_id}/reply`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${tokenResult.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ comment: replyText }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error?.message || `Google API error (${res.status})` };
    }

    const { error: updateError } = await db
      .from("google_reviews")
      .update({ reply: replyText, reply_time: new Date().toISOString() })
      .eq("id", reviewId);
    if (updateError) return { ok: false, error: updateError.message };

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Reply failed" };
  }
}

async function seedDemoReviews(tenantId: string, connectionId: string): Promise<{ synced: number }> {
  const db = admin();
  const { count: existing } = await db
    .from("google_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("connection_id", connectionId);
  if ((existing ?? 0) > 0) {
    await db
      .from("google_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", connectionId);
    return { synced: 0 };
  }

  const sampleReviews = [
    { authorName: "Sarah Mitchell", rating: 5, comment: "Absolutely incredible dining experience! The truffle carbonara was divine and the service was impeccable. Will definitely be back.", daysAgo: 2 },
    { authorName: "James Chen", rating: 4, comment: "Great food and atmosphere. The spicy ramen was flavorful but could use a bit more heat. Overall a solid experience.", daysAgo: 5 },
    { authorName: "Priya Sharma", rating: 5, comment: "Best restaurant in the city! The margherita pizza was authentic and the staff was so welcoming. Highly recommend the desserts too.", daysAgo: 8 },
    { authorName: "Michael Rodriguez", rating: 3, comment: "Decent place but the wait time was longer than expected. Food was good once it arrived. The beef bourguignon was tender.", daysAgo: 12 },
    { authorName: "Emma Thompson", rating: 5, comment: "Celebrated my anniversary here and it was perfect. The molten lava cake was to die for. Thank you for making it special!", daysAgo: 15 },
    { authorName: "David Kim", rating: 4, comment: "Solid sushi selection. The dragon roll was fresh and well-presented. Would have given 5 stars if not for the slightly slow service.", daysAgo: 18 },
  ];

  let count = 0;
  for (const r of sampleReviews) {
    const createTime = new Date();
    createTime.setDate(createTime.getDate() - r.daysAgo);

    await db.from("google_reviews").insert({
      tenant_id: tenantId,
      connection_id: connectionId,
      google_review_id: `demo-${Date.now()}-${count}`,
      author_name: r.authorName,
      rating: r.rating,
      comment: r.comment,
      create_time: createTime.toISOString(),
      update_time: createTime.toISOString(),
      reply: r.rating >= 4
        ? `Thank you so much, ${r.authorName.split(" ")[0]}! We appreciate your kind words and hope to see you again soon.`
        : null,
      reply_time: r.rating >= 4 ? new Date(createTime.getTime() + 86400000).toISOString() : null,
    });
    count++;
  }

  await db
    .from("google_connections")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("id", connectionId);

  return { synced: count };
}

function getAuthUrl(redirectUri: string, state: string): string {
  const clientId = googleClientId();
  if (!clientId) return "";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/business.manage",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** The edge callback URL used both when building the auth URL and exchanging the code. */
function callbackRedirectUri(): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base}/functions/v1/google-reviews/callback`;
}

/** Where to send the browser back to after OAuth (the app origin). */
function appOrigin(req: Request): string {
  const site = Deno.env.get("SITE_URL");
  if (site) return site.replace(/\/$/, "");
  const origin = req.headers.get("origin");
  if (origin) return origin;
  return new URL(req.url).origin;
}

// ---------------------------------------------------------------------------
// Response mappers (from src/app/api/google-reviews/settings/route.ts)
// ---------------------------------------------------------------------------

function mapGoogleReview(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    connectionId: r.connection_id,
    googleReviewId: r.google_review_id,
    authorName: r.author_name,
    authorPhotoUrl: r.author_photo_url,
    rating: r.rating,
    comment: r.comment,
    commentTranslated: r.comment_translated,
    createTime: r.create_time,
    updateTime: r.update_time,
    reply: r.reply,
    replyTime: r.reply_time,
    flagged: r.flagged,
    syncedAt: r.synced_at,
  };
}

function mapConnection(c: any) {
  return {
    id: c.id,
    tenantId: c.tenant_id,
    accessToken: c.access_token,
    refreshToken: c.refresh_token,
    tokenExpiresAt: c.token_expires_at,
    accountName: c.account_name,
    locationName: c.location_name,
    locationId: c.location_id,
    placeId: c.place_id,
    enabled: c.enabled,
    autoSync: c.auto_sync,
    syncIntervalMins: c.sync_interval_mins,
    showPublic: c.show_public,
    minRatingFilter: c.min_rating_filter,
    lastSyncedAt: c.last_synced_at,
    lastSyncError: c.last_sync_error,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const segments = subPath(req, "google-reviews");
  const sub = segments[0];

  try {
    switch (sub) {
      case "settings":
        if (req.method === "GET") return await settingsGet(req);
        if (req.method === "PUT") return await settingsPut(req);
        return json(req, { error: "Method not allowed" }, 405);
      case "connect":
        if (req.method === "GET") return await connectGet(req);
        if (req.method === "DELETE") return await connectDelete(req);
        return json(req, { error: "Method not allowed" }, 405);
      case "sync":
        if (req.method === "POST") return await syncPost(req);
        return json(req, { error: "Method not allowed" }, 405);
      case "respond":
        if (req.method === "POST") return await respondPost(req);
        return json(req, { error: "Method not allowed" }, 405);
      case "callback":
        if (req.method === "GET") return await callbackGet(req);
        return json(req, { error: "Method not allowed" }, 405);
      default:
        return json(req, { error: "Not found" }, 404);
    }
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

/** GET settings — settings.view */
async function settingsGet(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.view" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const db = admin();
  const { data: conn, error } = await db
    .from("google_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) return json(req, { error: error.message }, 500);

  if (!conn) {
    return json(req, { connected: false, reviews: [], settings: null });
  }

  const { data: reviews, error: reviewsError } = await db
    .from("google_reviews")
    .select("*")
    .eq("connection_id", conn.id)
    .order("create_time", { ascending: false })
    .limit(50);
  if (reviewsError) return json(req, { error: reviewsError.message }, 500);

  return json(req, {
    connected: true,
    connection: {
      id: conn.id,
      locationName: conn.location_name,
      enabled: conn.enabled,
      autoSync: conn.auto_sync,
      syncIntervalMins: conn.sync_interval_mins,
      showPublic: conn.show_public,
      minRatingFilter: conn.min_rating_filter,
      lastSyncedAt: conn.last_synced_at,
      lastSyncError: conn.last_sync_error,
      createdAt: conn.created_at,
    },
    reviews: (reviews ?? []).map(mapGoogleReview),
  });
}

/** PUT settings — settings.manage */
async function settingsPut(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const db = admin();
  const b = await body(req);
  const { data: conn, error } = await db
    .from("google_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) return json(req, { error: error.message }, 500);
  if (!conn) return json(req, { error: "No Google connection" }, 404);

  const data: Record<string, unknown> = {};
  if (typeof b.enabled === "boolean") data.enabled = b.enabled;
  if (typeof b.autoSync === "boolean") data.auto_sync = b.autoSync;
  if (typeof b.syncIntervalMins === "number") data.sync_interval_mins = b.syncIntervalMins;
  if (typeof b.showPublic === "boolean") data.show_public = b.showPublic;
  if (typeof b.minRatingFilter === "number") data.min_rating_filter = b.minRatingFilter;

  const { data: updated, error: updateError } = await db
    .from("google_connections")
    .update(data)
    .eq("id", conn.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (updateError) return json(req, { error: updateError.message }, 500);

  return json(req, { success: true, connection: mapConnection(updated) });
}

/** GET connect — settings.manage */
async function connectGet(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const db = admin();

  if (!hasGoogleCreds()) {
    const { data: existing, error: findError } = await db
      .from("google_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (findError) return json(req, { error: findError.message }, 500);

    let conn = existing;
    if (!conn) {
      const { data, error } = await db
        .from("google_connections")
        .insert({
          tenant_id: tenantId,
          access_token: "demo-token",
          refresh_token: "demo-refresh",
          token_expires_at: new Date(Date.now() + 86400000).toISOString(),
          location_name: "Jaegar Resto (Demo)",
          enabled: true,
          auto_sync: true,
          sync_interval_mins: 60,
          show_public: true,
          min_rating_filter: 0,
        })
        .select()
        .single();
      if (error) return json(req, { error: error.message }, 500);
      conn = data;
    }
    return json(req, { demoMode: true, connected: true, connectionId: conn.id });
  }

  const redirectUri = callbackRedirectUri();
  const authUrl = getAuthUrl(redirectUri, tenantId);

  return json(req, { demoMode: false, authUrl });
}

/** DELETE connect — settings.manage */
async function connectDelete(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const db = admin();
  const { error: reviewsError } = await db.from("google_reviews").delete().eq("tenant_id", tenantId);
  if (reviewsError) return json(req, { error: reviewsError.message }, 500);
  const { error: connectionsError } = await db.from("google_connections").delete().eq("tenant_id", tenantId);
  if (connectionsError) return json(req, { error: connectionsError.message }, 500);

  return json(req, { success: true });
}

/** POST sync — settings.manage */
async function syncPost(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const { data: conn, error } = await admin()
    .from("google_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) return json(req, { error: error.message }, 500);
  if (!conn) return json(req, { error: "No Google connection" }, 404);

  const result = await syncReviews(conn.id);
  return json(req, result, result.error ? 400 : 200);
}

/** POST respond — settings.manage */
async function respondPost(req: Request): Promise<Response> {
  const g = await guard(req, { permission: "settings.manage" });
  if (!g.ok) return g.response;
  const tenantId = g.session.tenantId;

  const b = await body(req);
  const reviewId = b.reviewId as string | undefined;
  const reply = b.reply as string | undefined;

  if (!reviewId || !reply?.trim()) {
    return json(req, { error: "reviewId and reply are required" }, 400);
  }

  const { data: conn, error } = await admin()
    .from("google_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) return json(req, { error: error.message }, 500);
  if (!conn) return json(req, { error: "No Google connection" }, 404);

  const result = await replyToReview(conn.id, reviewId, reply.trim());
  if (!result.ok) return json(req, { error: result.error }, 400);

  return json(req, { success: true });
}

/** GET callback — PUBLIC OAuth redirect target. */
async function callbackGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // tenantId
  const error = url.searchParams.get("error");
  const back = appOrigin(req);

  if (error) {
    return Response.redirect(`${back}/?google_error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return json(req, { error: "Missing code or state" }, 400);
  }

  const tokens = await exchangeCodeForTokens(code, callbackRedirectUri());
  if ("error" in tokens) {
    return json(req, { error: tokens.error }, 400);
  }

  const db = admin();

  const { data: existing, error: findError } = await db
    .from("google_connections")
    .select("*")
    .eq("tenant_id", state)
    .limit(1)
    .maybeSingle();
  if (findError) return json(req, { error: findError.message }, 500);

  let conn;
  if (existing) {
    const { data, error: updateError } = await db
      .from("google_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || existing.refresh_token,
        token_expires_at: new Date(tokens.expires_at).toISOString(),
        enabled: true,
      })
      .eq("id", existing.id)
      .eq("tenant_id", state)
      .select()
      .single();
    if (updateError) return json(req, { error: updateError.message }, 500);
    conn = data;
  } else {
    const { data, error: insertError } = await db
      .from("google_connections")
      .insert({
        tenant_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(tokens.expires_at).toISOString(),
        enabled: true,
      })
      .select()
      .single();
    if (insertError) return json(req, { error: insertError.message }, 500);
    conn = data;
  }

  await syncReviews(conn.id);

  return Response.redirect(`${back}/?google_connected=true`, 302);
}
