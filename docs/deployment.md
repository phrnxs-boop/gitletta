# Deploying Swixo

Two things get deployed:

| Piece | Where | How |
|---|---|---|
| The Next.js app | Vercel | import the GitHub repo |
| The API | Supabase Edge Functions | `node scripts/deploy-all-fns.mjs` |
| The database | Supabase Postgres | migrations in `supabase/migrations/` |

The browser app talks to Supabase for data **and** calls the edge functions for
the API. Because those calls are cross-origin, each edge function answers CORS
with an explicit origin — set `ALLOWED_ORIGINS` to the Vercel domain or the
browser will block the responses.

---

## 1. Database

Migrations are applied in filename order. If you are reusing the existing
`supaletta` project, **nothing to do** — `0001`–`0007` are already applied.

For a fresh project, apply them in order. Then decide whether you want the demo
restaurant: `0004_seed_demo_tenant.sql` creates "Jaegar Resto" for development
only. A real restaurant should start empty:

```bash
psql "$DATABASE_URL" -f supabase/reset-to-empty.sql
```

## 2. Edge Functions

The functions authenticate themselves (`verify_jwt` is false at the platform
level) because staff sessions and the diner QR flow carry no Supabase JWT.

Set these secrets on the project first:

| Secret | Value |
|---|---|
| `ALLOWED_ORIGINS` | your Vercel origin, e.g. `https://swixo.vercel.app` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into every edge function by the platform — do not set them yourself.

Then:

```bash
node scripts/deploy-all-fns.mjs
# or one at a time
node scripts/deploy-fn.mjs menu
```

## 3. Vercel

Import `phrnxs-boop/swixo` and set these environment variables (Production and
Preview):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key — safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only**, never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | the deployed origin, used for metadata and OG tags |

`next.config.ts` uses `output: 'standalone'`, which Vercel detects on its own.
No `vercel.json` is needed.

## 4. Supabase Auth URLs

In **Authentication → URL Configuration**:

- **Site URL**: your Vercel origin.
- **Redirect URLs**: add `https://<your-domain>/**` and
  `http://localhost:3000/**` for local development.

Also in **Authentication → Providers / Settings**, enable **leaked password
protection** — Supabase's own advisor flags it as off, and it is not reachable
through the API.

## 5. After the first deploy

1. Visit `/` and sign up. The first account creates its own tenant and the five
   default roles.
2. Confirm `https://<ref>.supabase.co/functions/v1/health` returns
   `{"status":"ok","database":"ok"}`.
3. Open one table's QR code and place a test order from a phone, so the diner
   path is exercised in production.

## Post-deploy checklist

- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean locally
- [ ] `ALLOWED_ORIGINS` set to the real Vercel origin
- [ ] Leaked password protection enabled
- [ ] Auth redirect URLs include the production origin
- [ ] Supabase advisors re-checked (Database → Advisors) with no new warnings
- [ ] the `health` edge function returns 200
- [ ] One end-to-end diner order placed from a real phone
