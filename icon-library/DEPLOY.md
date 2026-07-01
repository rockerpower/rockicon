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
| `STRIPE_SECRET_KEY` | for real payments | Enables Stripe Checkout. Without it, checkout mock-grants Pro. |
| `STRIPE_PRICE_ID` | for real payments | The recurring price the checkout subscribes to. |
| `STRIPE_WEBHOOK_SECRET` | for real payments | Verifies `/api/stripe/webhook`. |

If the Stripe vars are omitted, the app still works with a **mock checkout**
(instant Pro grant) — good for a demo deploy.

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
- **Entitlements store** (`lib/entitlements-store.ts`) writes a JSON file. On
  Vercel's read-only filesystem it falls back to in-memory (per-instance,
  ephemeral). For durable Pro entitlements, swap it for a database (Vercel KV,
  Postgres, etc.) — the `getEntitlement` / `setEntitlement` interface stays the
  same.
- The **security invariant holds on Vercel**: Pro vectors ship with empty paths
  in the public index and are delivered only from `icons-source/` server-side
  via `/api/pro/*` (force-included in the function bundle via
  `outputFileTracingIncludes` in `next.config.ts`).
