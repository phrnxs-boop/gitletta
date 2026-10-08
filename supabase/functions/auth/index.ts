// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, asUser } from "../_shared/db.ts";
import { PERMISSION_KEYS } from "../_shared/permissions.ts";
import { body, json, preflight, subPath } from "../_shared/http.ts";

/**
 * /functions/v1/auth
 *   POST /login      sign in with email + password
 *   POST /logout     clear the session
 *   POST /register   create an auth user + tenant + default roles + owner profile
 *   GET  /me         resolve the signed-in owner (401 when there is none)
 *
 * Deliberately public — these routes are what *establish* a session, so they
 * cannot themselves be behind `guard()`. They never take a tenant id from the
 * client: the tenant is looked up through the authenticated profile row.
 *
 * A `session` object (the Supabase Auth session) is added to the login and
 * register responses so a client can persist the bearer token that every other
 * edge function expects in `Authorization`. The pre-existing fields (`user`,
 * `tenant`, `role`) are unchanged.
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

/** Anon-key client, used only for the credential handshake with Supabase Auth. */
function anon() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "restaurant"
  );
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const url = new URL(req.url);
  const seg = subPath(req, "auth")[0] ?? url.searchParams.get("action") ??
    url.searchParams.get("id");

  try {
    if (req.method === "POST") {
      switch (seg) {
        case "login":
          return await login(req);
        case "logout":
          return await logout(req);
        case "register":
          return await register(req);
        default:
          return json(req, { error: "Method not allowed" }, 405);
      }
    }
    if (req.method === "GET") {
      // `/auth` with no segment resolves the current owner, like `/auth/me`.
      return await me(req);
    }
    return json(req, { error: "Method not allowed" }, 405);
  } catch (err) {
    return json(req, { error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});

async function login(req: Request): Promise<Response> {
  const b = await body(req);
  const { email, password } = b;

  if (!email || !password) {
    return json(req, { error: "Email and password are required" }, 400);
  }

  const supabase = anon();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: String(email).toLowerCase().trim(),
    password: String(password),
  });

  if (authError || !authData?.user) {
    return json(req, { error: "Invalid email or password" }, 401);
  }

  const db = admin();

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) return json(req, { error: profileError.message }, 500);
  if (!profile) return json(req, { error: "Invalid email or password" }, 401);

  if (!profile.active) {
    return json(
      req,
      { error: "Your account has been deactivated. Contact your manager." },
      403,
    );
  }

  const [tenantRes, roleRes] = await Promise.all([
    db.from("tenants").select("*").eq("id", profile.tenant_id).maybeSingle(),
    profile.role_id
      ? db.from("roles").select("*").eq("id", profile.role_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (tenantRes.error) return json(req, { error: tenantRes.error.message }, 500);
  if (roleRes.error) return json(req, { error: roleRes.error.message }, 500);

  const tenant = tenantRes.data;
  const role = roleRes.data;

  // Update last login timestamp.
  const { error: updateError } = await db
    .from("profiles")
    .update({ last_login: new Date().toISOString() })
    .eq("id", profile.id);
  if (updateError) return json(req, { error: updateError.message }, 500);

  // Log the security event.
  const { error: logError } = await db.from("security_logs").insert({
    tenant_id: profile.tenant_id,
    user_id: profile.id,
    action: "LOGIN",
    ip: req.headers.get("x-forwarded-for") || "unknown",
    user_agent: req.headers.get("user-agent") || "unknown",
    meta: `Login via email/password`,
  });
  if (logError) return json(req, { error: logError.message }, 500);

  return json(req, {
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      roleId: profile.role_id,
      tenantId: profile.tenant_id,
      avatar: profile.avatar,
    },
    tenant: tenant
      ? {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        tagline: tenant.tagline,
        currencySymbol: tenant.currency_symbol,
      }
      : null,
    role: role
      ? {
        id: role.id,
        name: role.name,
        permissions: role.permissions,
      }
      : null,
    // Edge functions are stateless — hand the client the Supabase Auth session
    // so it can send the bearer token on subsequent calls.
    session: authData.session ?? null,
  });
}

async function logout(req: Request): Promise<Response> {
  // The session lives entirely in the client (bearer token); there is nothing
  // to revoke server-side. Kept for parity with the Next.js route.
  return json(req, { success: true });
}

async function me(req: Request): Promise<Response> {
  try {
    const jwt = bearer(req);
    if (!jwt) return json(req, { authenticated: false }, 401);

    const { data: authData, error: authError } = await asUser(jwt).auth.getUser(jwt);
    if (authError || !authData?.user) {
      return json(req, { authenticated: false }, 401);
    }
    const user = authData.user;

    const db = admin();

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return json(req, { error: profileError.message }, 500);
    if (!profile || !profile.active) {
      return json(req, { authenticated: false }, 401);
    }

    const [tenantRes, roleRes] = await Promise.all([
      db.from("tenants").select("*").eq("id", profile.tenant_id).maybeSingle(),
      profile.role_id
        ? db.from("roles").select("*").eq("id", profile.role_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (tenantRes.error) return json(req, { error: tenantRes.error.message }, 500);
    if (roleRes.error) return json(req, { error: roleRes.error.message }, 500);

    const tenant = tenantRes.data;
    const role = roleRes.data;

    return json(req, {
      authenticated: true,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        roleId: profile.role_id,
        tenantId: profile.tenant_id,
        avatar: profile.avatar,
      },
      tenant: tenant
        ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        }
        : null,
      role: role
        ? {
          id: role.id,
          name: role.name,
          permissions: role.permissions,
        }
        : null,
    });
  } catch {
    return json(req, { authenticated: false }, 401);
  }
}

async function register(req: Request): Promise<Response> {
  try {
    const b = await body(req);
    const { name, email, password, restaurantName } = b;

    if (!email || !password || !name) {
      return json(req, { error: "Name, email, and password are required" }, 400);
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanName = String(name).trim();

    const supabase = anon();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: String(password),
      options: { data: { name: cleanName } },
    });

    if (authError) {
      if (/already|registered|exists/i.test(authError.message || "")) {
        return json(req, { error: "An account with this email already exists" }, 400);
      }
      return json(req, { error: authError.message || "Registration failed" }, 500);
    }

    const authUser = authData?.user;
    // Supabase returns a user with an empty identities array for an address
    // that already exists (enumeration protection). Treat that as a duplicate.
    if (
      !authUser ||
      (Array.isArray(authUser.identities) && authUser.identities.length === 0)
    ) {
      return json(req, { error: "An account with this email already exists" }, 400);
    }

    const db = admin();

    // Derive a unique slug from the restaurant name.
    const cleanRestName = (restaurantName || `${cleanName}'s Restaurant`).trim();
    const baseSlug = slugify(String(cleanRestName));
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const { data: existing, error: slugError } = await db
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (slugError) return json(req, { error: slugError.message }, 500);
      if (!existing) break;
      slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
    }

    // Create the tenant.
    const { data: tenant, error: tenantError } = await db
      .from("tenants")
      .insert({
        name: cleanRestName,
        slug,
        plan: "pro",
        // India-first defaults. The onboarding flow can change these, but a new
        // restaurant must not start out priced in dollars.
        currency: "INR",
        currency_symbol: "₹",
        active: true,
      })
      .select()
      .single();
    if (tenantError) return json(req, { error: tenantError.message }, 500);

    // Create the default system roles.
    const { data: roles, error: rolesError } = await db
      .from("roles")
      .insert(DEFAULT_ROLES.map((r) => ({ ...r, tenant_id: tenant.id })))
      .select();
    if (rolesError) return json(req, { error: rolesError.message }, 500);

    const ownerRole = (roles ?? []).find((r) => r.name === "Owner");

    // Create the owner's profile, keyed by the auth user id.
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .insert({
        id: authUser.id,
        tenant_id: tenant.id,
        name: cleanName,
        email: cleanEmail,
        role: "OWNER",
        role_id: ownerRole?.id ?? null,
        active: true,
      })
      .select()
      .single();
    if (profileError) return json(req, { error: profileError.message }, 500);

    // Log the security event.
    const { error: logError } = await db.from("security_logs").insert({
      tenant_id: tenant.id,
      user_id: profile.id,
      action: "REGISTER",
      ip: req.headers.get("x-forwarded-for") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
      meta: "Registered new account and created tenant",
    });
    if (logError) return json(req, { error: logError.message }, 500);

    return json(req, {
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        roleId: profile.role_id,
        tenantId: profile.tenant_id,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        currencySymbol: tenant.currency_symbol,
      },
      // Only present when email confirmation is disabled; see login().
      session: authData.session ?? null,
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return json(req, { error: error.message || "Registration failed" }, 500);
  }
}
