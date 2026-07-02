# Icon Library

A Streamline-style icon browser (Next.js App Router) with a Free public catalog and Pro tiers. Live at `rockicon.vercel.app`.

## Develop

```bash
npm install
npm run dev        # http://localhost:3001
```

- `npm run build:icons` — normalize `icons-source/` SVGs into `public/icons-data/`
- `npm run build` — runs `build:icons` then `next build`

## Icon source layout

Icons live in the repo and are normalized at build time. The folder structure **is** the taxonomy:

```
icons-source/
  <family>/              # e.g. rockicon
    family.json          # family metadata (name, bundles, categories, tiers)
    <bundle>/            # outline = stroke, solid = fill
      <category>/        # e.g. interface
        home.svg
        settings.svg
      <category>/
        <subcategory>/   # optional
          compass.svg
```

- **Same filename across bundles = the same icon** (e.g. `outline/interface/home.svg` and `solid/interface/home.svg` are two styles of `home`).
- Pro icons are marked in `family.json` `overrides` (`{ "cart": { "tier": "pro" } }`); their vectors are stripped from the public index and delivered only to entitled users.

### Adding icons via GitHub (no local setup)

Upload `.svg` files into `icon-library/icons-source/<family>/<bundle>/<category>/` (GitHub → Add file → Upload files). Push to `main` → Vercel auto-deploys.

## Studio (`/studio`, dev-only)

A local authoring UI (disabled in production). Run `npm run dev`, open `http://localhost:3001/studio`:

- **+ New family** — create a family (starts as *draft*; set Status = published in Meta to deploy).
- **Meta / Bundles / Categories** — edit metadata and taxonomy. Meta has a *Danger zone* to delete the family (type-the-slug confirm).
- **Icons** — per-icon name/tags/tier (Free/Pro) and delete; **Upload icons** panel:
  - *Choose .svg files* — bulk into one bundle/category.
  - *Choose folder (bulk)* — pick a folder structured `<bundle>/<category>/[<sub>/]<name>.svg`; missing bundles/categories/subcategories are **created automatically**.

After editing, click **Rebuild**, then commit `icons-source/` + `public/icons-data/` and push → auto-deploy.

## Deploy

See [DEPLOY.md](./DEPLOY.md) for Vercel setup, env vars (`AUTH_*`, `UPSTASH_*`, `STRIPE_*`), and the GitHub OAuth app.
