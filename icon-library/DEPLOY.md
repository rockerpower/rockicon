# Deploying to Vercel

The icon-library is a Next.js app with server routes (Pro delivery, auth,
Stripe). It needs a Node/serverless host — **GitHub Pages can't run it**. Vercel
runs it with zero build config.

## 1. Import the repo

1. Go to https://vercel.com/new and import `rockerpower/rockicon`.
2. **Set "Root Directory" to `icon-library`** (the Next.js app lives in a
   subfolder, not the repo root). This is the one setting that is easy to miss.
3. Framework preset auto-detects as **Next.js**. Build command `npm run build`
   and output are detected automatically.

## 2. Environment variables

Set these in the Vercel project (Settings → Environment Variables):

| Variable | Required | Purpose |
|----------|----------|---------|
| `SESSION_SECRET` | yes | Signs the session cookie. Use a long random string. |
| `UPSTASH_REDIS_REST_URL` | for durable Pro | Upstash Redis REST endpoint (entitlement store). |
| `UPSTASH_REDIS_REST_TOKEN` | for durable Pro | Upstash Redis REST token. |
| `STRIPE_SECRET_KEY` | for real payments | Enables Stripe Checkout. Without it, checkout mock-grants Pro. |
| `STRIPE_PRICE_ID` | for real payments | The recurring price the checkout subscribes to. |
| `STRIPE_WEBHOOK_SECRET` | for real payments | Verifies `/api/stripe/webhook`. |

If the Stripe vars are omitted, the app still works with a **mock checkout**
(instant Pro grant) — good for a demo deploy.

### Entitlements store (Upstash Redis)

Pro entitlements are keyed by email. To make them durable on Vercel:

1. In the Vercel project → **Storage** → add **Upstash for Redis** (Marketplace,
   has a free tier). Vercel auto-injects `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
2. Redeploy. `lib/entitlements-store.ts` uses Redis automatically when both vars
   are present; otherwise it falls back to a local JSON file / in-memory (dev).

## 3. Stripe webhook (only if using real payments)

Add an endpoint in the Stripe dashboard pointing to
`https://<your-deploy>/api/stripe/webhook`, subscribed to
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.deleted`. Copy its signing secret into
`STRIPE_WEBHOOK_SECRET`.

## Notes / limitations

- **Studio (`/studio`) is disabled in production** (`NODE_ENV === 'production'`).
  It's a local authoring tool: run `npm run dev` locally to edit families, then
  commit `icons-source/` + `family.json` and redeploy.
- **Entitlements store** (`lib/entitlements-store.ts`) uses Upstash Redis when
  its env vars are set (durable). Without them it falls back to a local JSON
  file, then to in-memory on a read-only FS (ephemeral, per-instance) — fine for
  dev but connect Upstash for production so Pro grants survive.
- The **security invariant holds on Vercel**: Pro vectors ship with empty paths
  in the public index and are delivered only from `icons-source/` server-side
  via `/api/pro/*` (force-included in the function bundle via
  `outputFileTracingIncludes` in `next.config.ts`).
