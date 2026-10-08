# Swixo

A multitenant restaurant platform: point-of-sale, live order flow, QR table
ordering, staff management, and analytics — built for Indian restaurants
(GST, ₹, service charge) but not tied to them.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind v4, shadcn/ui, Radix, Recharts |
| Data | Supabase Postgres via `@supabase/supabase-js` |
| Auth | Supabase Auth (owners) + PIN sessions (staff) |
| Realtime | Supabase Realtime (Postgres Changes) |
| Hosting | Vercel |

There is **no Prisma at runtime**. The original Prisma schema is kept at
`docs/legacy-prisma-schema.txt` for reference only.

## How it fits together

```
Browser ──┬─ anon key ──► Postgres (RLS-enforced, public menu reads)
          └─ Realtime ──► orders / order_items / table_sessions

Next route handlers ──► service role ──► Postgres (bypasses RLS)
```

Two distinct audiences, two distinct auth paths:

- **Owners / managers** sign in with Supabase Auth. `profiles.id` is the
  `auth.users.id`, and RLS scopes every query to `profiles.tenant_id`.
- **Floor staff** sign in with a 4-digit PIN. PINs are scrypt-hashed with a
  per-staff salt, rate-limited to 5 attempts then a 15-minute lockout, and
  carried in a separate `tablo-staff-session` cookie (12-hour lifetime).
- **Diners** need no account. Scanning a table's QR code calls the
  `start_table_session()` RPC; ordering goes through `place_order()`, which
  **recomputes every price server-side** — the client's prices are never
  trusted.

### Why the database owns the money maths

`place_order()` re-reads each `menu_items.price`, validates the promo code,
and computes tax and service charge from the tenant's own settings. A tampered
request can change what the diner *asks* for, never what they *pay*.

### Realtime

The original implementation used an in-process `EventEmitter`, which works on
one dev server but silently breaks on serverless (each invocation is its own
process). Live updates now come from Supabase Realtime, with a 4-second delta
sync as a safety net and a `BroadcastChannel` for instant cross-tab sync. See
`src/components/app/data-context.tsx`.

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev
```

### Environment

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, the `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the `service_role` secret — **server only** |

`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed with `NEXT_PUBLIC_`. Without
it the server routes cannot reach the database and will return a clear error.

### Database

Migrations live in `supabase/migrations/` and are applied in filename order:

1. `0001_swixo_init.sql` — schema, RLS policies, public RPCs, realtime
2. `0002_table_session_semantics.sql` — one session per QR scan
3. `0003_money_as_double.sql` — money as `double precision` so PostgREST
   serialises it as a JSON number rather than a string
4. `0004_seed_demo_tenant.sql` — the demo restaurant (**development only**)
5. `0005_customer_reviews.sql` — customer review table
6. `0006_security_logs_fk.sql` — the FK PostgREST needs for embedded selects
7. `0007_harden_and_drop_legacy.sql` — drops the leftover prototype
   functions, indexes every foreign key, tightens grants and `search_path`

Apply them with the Supabase CLI (`supabase db push`) or your usual migration
tooling.

### Starting from an empty database

`0004_seed_demo_tenant.sql` exists so development has something to click
through. A real restaurant should start empty:

```bash
psql "$DATABASE_URL" -f supabase/reset-to-empty.sql
```

That deletes the demo tenant and every owner login, cascading through all
tenant-scoped tables, and restarts order numbering. The schema is untouched —
it is a data reset, not a schema reset. The first user then signs up and is
taken through onboarding. The header of `reset-to-empty.sql` lists the two
steps to put the demo data back for local work.

### Demo account

The seed creates **Jaegar Resto** with 22 menu items, 14 tables, 5 roles and
3 promo codes.

- Owner: `owner@jaegarresto.in` / `jaegar1234`
- Staff PIN: `1234` (any seeded staff member, e.g. `raj`)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (type errors fail the build) |
| `npm start` | Run the built standalone server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Security model

Two independent layers. A request must pass both.

### 1. Route layer — `guard()`

Every dashboard route starts with the same call:

```ts
const g = await guard(req, { permission: 'menu.manage' })
if (!g.ok) return g.response
const { tenantId } = g.session
```

`guard()` (in `src/lib/session.ts`) resolves either an owner session (Supabase
Auth cookie) or a staff session (`tablo-staff-session` cookie) and **fails
closed**: no session, a deactivated account, a missing permission, or an
`x-tenant-id` pointing at a different restaurant all return 401/403 rather
than data. The tenant used by the handler always comes from the session, never
from the request.

Only these routes are deliberately public, and each is scoped by an explicit
token or slug rather than by a fallback:

| Route | Why |
|---|---|
| `/api/auth/*` | session lifecycle |
| `/api/staff/login`, `/api/staff/logout` | staff session lifecycle |
| `/api/public-menu` | diner menu, scoped by `?tenant=` |
| `POST /api/table-session` | diner QR handshake |
| `/api/table-session/validate` | diner session check |
| `POST /api/reviews` | diner submits a review for a table session |
| `/api/google-reviews/callback` | OAuth redirect from Google |

There is **no** "pick a tenant for me" fallback anywhere in the codebase. If a
request carries no session and no explicit tenant, it gets a 401.

### 2. Database layer — RLS

RLS is enabled on every table. Owners are scoped to their tenant by policy;
`table_sessions` and `orders` have **no** anon policy, so a diner can only
reach them through the `SECURITY DEFINER` RPCs.

`place_order()` recomputes every price, re-validates the promo code and
derives tax and service charge from the tenant's own settings. A tampered
request can change what the diner *asks* for, never what they *pay*.

### Other

- QR tokens and session tokens are generated by the database from
  `gen_random_bytes`, never by the client.
- Staff PINs are scrypt-hashed with a per-staff salt; 5 failed attempts
  triggers a 15-minute lockout.
- `.env` is gitignored. Do not commit credentials.

## Deploying

Import the repo into Vercel and set the three environment variables above.
`next.config.ts` uses `output: 'standalone'`, which Vercel detects
automatically.
