# Rockicon — Building a Streamline-style Icon Library
### A UI/UX case study, designed and shipped with a vibe-coding workflow

---

## TL;DR

I designed and shipped **Rockicon**, a production icon-library web app (browse, search, export, Free/Pro tiers, and a self-serve authoring Studio) — going from a raw design handoff to a live, authenticated, monetizable product. I worked in a **vibe-coding** flow: designing in the browser, pairing with an AI to implement in real time, and validating each decision against the running product instead of static mockups.

- **Role:** Product designer + design engineer (end to end)
- **Surface:** Public catalog, icon inspector, Studio (authoring), pricing, auth, donations
- **Stack:** Next.js (App Router), TypeScript, Vercel, GitHub OAuth (Auth.js), Upstash Redis
- **Outcome:** Live at `rockicon.vercel.app`, real login, a working Free/Pro model, and a Studio that lets a non-engineer publish icons without touching code.

---

## 1. Context

Icon libraries are a crowded space — Streamline, Lucide, Phosphor, Font Awesome, Iconscout. They mostly split into two experiences: a **beautiful public browser** for finding and exporting icons, and a **hidden authoring pipeline** the maintainer uses to publish. Most side projects nail the first and hack the second.

I wanted to build the whole loop: a catalog that feels premium to browse **and** an authoring tool good enough that I (or a client) could grow the collection from a browser, plus the commercial layer (tiers, pricing, checkout) that turns a library into a product.

**The starting point** was a design handoff — HTML/CSS prototypes of the icon browser exported from an AI design tool. Prototypes, not production: text didn't reflow, layouts were static, there was no data model, no auth, no export logic. My job was to turn that intent into a real, dynamic, shippable product.

---

## 2. The problem, framed

Three user truths shaped everything:

1. **A developer grabbing an icon wants zero friction.** Find → tweak → copy/download in seconds. Anything else is a tax.
2. **A buyer needs a reason to pay.** Free has to be genuinely useful, and Pro has to feel like an obvious upgrade — without ever leaking the paid assets.
3. **A maintainer needs to publish without an engineer.** If adding icons requires a pull request every time, the library dies.

So the product had to serve **three roles at once** — visitor, buyer, maintainer — inside one coherent system.

---

## 3. Approach: vibe coding

Instead of the classic *mockup → handoff → wait → review* loop, I designed **against a live build**. Every idea went straight into the running app; I judged it in-browser, in real interaction, and iterated in minutes.

What that changed about the design process:

- **The prototype was the product.** No fidelity gap. If it felt wrong, it *was* wrong, and I fixed it in the same breath.
- **Decisions were cheap to reverse.** I could try "7 flat export buttons" and, seeing it was noisy, collapse them into "Copy + Download menus" the same session.
- **Design and engineering constraints negotiated in real time.** When I wanted the Studio hosted on the web, the runtime reality (static hosting can't run write APIs) surfaced immediately and reshaped the plan — rather than being discovered after a sprint.

The AI pair handled implementation mechanics; I stayed the taste function — deciding hierarchy, flow, when something felt like slop, and when to stop.

---

## 4. Workflow — how it actually shipped

I ran the project in phases, each ending in something real on screen.

### Phase 1 — Foundation & browse MVP
Turned the taxonomy (Family → Bundle → Category → Subcategory) into a real data model and a build pipeline that normalizes source SVGs into a public index. Shipped the core browse experience: a collapsible nav tree with keyboard navigation, a virtualized grid, subcategory sections, an "All" cross-category view, fuzzy search, and a density toggle.

**Design calls:** monochrome, high-contrast, generous negative space so the icons — not the chrome — are the loudest thing on screen. State lives in the URL (`?q=`, `?icon=`) so any view is shareable.

### Phase 2 — The inspector (export UX)
The detail panel: live size / stroke-width / color, a preview on a pixel grid, and every export format a dev might want (SVG, JSX, Data URI, Base64, PNG, `.svg` download).

**A key iteration:** the first version exposed *seven* flat export buttons. It worked but felt like a control panel, not a product. I redesigned it into **two intent-first buttons — Copy and Download** — each opening a small menu of formats. Same power, a fraction of the visual noise. This is the vibe-coding advantage: I only saw the problem because I was staring at the real thing, not a tidy mockup.

### Phase 3 — Studio (authoring)
The maintainer surface. A dev-only tool to create/edit/delete families, edit taxonomy, set per-icon tier and tags, and **bulk-import a structured folder of SVGs** (drag a folder; missing bundles/categories are created automatically). Later I added inline SVG previews to every row so the table reads like a real icon manager, not a spreadsheet.

**Why dev-only:** the Studio writes to the filesystem. Exposing that publicly is both a security hole and impossible on static hosting. Keeping it local (and gating it behind `NODE_ENV`) was a deliberate boundary, not a shortcut.

### Phase 4 — The commercial layer
The part that makes it a product:

- **Free/Pro tiering** with a hard security invariant: **Pro vector paths never ship in the public bundle.** The build strips paths for Pro icons; the real geometry is delivered server-side, on demand, only to entitled users. Locked icons show a tasteful upsell instead.
- **Real auth** — GitHub OAuth via Auth.js. Signed-in state collapses into an avatar with a dropdown.
- **Durable entitlements** — Upstash Redis so a user's Pro status survives restarts, keyed by email, with a webhook-ready checkout that mocks in dev and swaps to Stripe in prod.
- **A pricing page** — Free vs Pro cards, monthly/yearly toggle, one clear CTA.

### Phase 5 — Polish & growth
Bulk-select-and-download-as-ZIP, a Donate flow (Buy Me a Coffee / Ko-fi in a clean modal), header hierarchy fixes (primary Donate, right-aligned account), and continuous deployment on every merge.

---

## 5. Design decisions worth calling out

**Intent over inventory.** Export went from "here are all the formats" to "what do you want to *do* — copy or download?" Grouping by user intent halved the visual load.

**Protect the paid work in the architecture, not the UI.** The Free/Pro boundary isn't a CSS `display:none` — the Pro vectors are physically absent from the client bundle. Trust the system, not the interface.

**Make the empty and locked states intentional.** A locked Pro icon isn't a dead cell; it's a lock glyph + upsell. A deleted-everything catalog shows a friendly message, not a crash.

**Destructive actions get friction on purpose.** Deleting a family requires typing its slug; deleting an icon is a two-step "Sure?". The maintainer surface is powerful, so it's deliberately hard to fire the footguns.

**One design system, everywhere.** Buttons, modals, menus, cards all speak the same tokens (surface, border, foreground, the Pro accent). New surfaces — pricing, donate, avatar dropdown — inherited the language instead of inventing new ones.

---

## 6. Hard problems & how I solved them

**"Can the Studio live on GitHub Pages?"** No — static hosting can't run the write APIs the Studio needs. Rather than fake it, I surfaced the constraint and reframed: Studio stays local for the maintainer, while *anyone* can still add icons via the GitHub web UI (upload SVGs into the folder structure → auto-deploy). Same outcome, honest architecture.

**A one-character bug that broke login.** OAuth kept 404-ing at GitHub. The cause: a GitHub client ID starting with a capital `O` had been transcribed as a zero `0`. Every endpoint looked healthy; only the real token exchange failed. Lesson relearned: verify identifiers character-by-character, and copy secrets — never retype them.

**Environment-name drift.** Vercel's Upstash integration injects `KV_REST_API_*`, not `UPSTASH_REDIS_REST_*`. The store silently fell back to ephemeral memory until I made it read both names. Integrations rename things; defensive config beats assumptions.

**Accidental data loss, caught before it shipped.** Mid-session, test actions in the Studio deleted a whole family in the working tree. Because nothing was committed, `main` and the live site were untouched — and a "restore or keep?" checkpoint stopped a bad state from ever reaching a PR. Guardrails on the *destructive* path paid for themselves.

---

## 7. Outcome

- **Live product**, deployed on Vercel with continuous delivery on every merge.
- **Full three-role loop working:** visitors browse/export free icons; buyers sign in and unlock Pro (with paid vectors never exposed); the maintainer publishes a whole icon set from a folder drag — no code.
- **A real commercial spine:** auth, durable entitlements, a pricing page, and a checkout that's one env var away from live payments.
- **A design system that scaled** to every new surface without visual drift.

---

## 8. Reflection

Vibe coding collapsed the distance between *deciding* and *seeing*. I made more design decisions per hour than a mockup workflow allows, and — more importantly — I made **better** ones, because every choice was judged in the real, interactive product. The redesigns that mattered (export menus, avatar dropdown, boxed previews, primary Donate) all came from reacting to the live thing, not admiring a static frame.

The trade-off: taste has to stay sharp, because the tool will happily build whatever you ask. The value I added wasn't typing — it was knowing what "good" felt like, spotting slop, protecting the user's trust (paid assets, destructive actions), and deciding when a thing was *done*.

**If I did it again:** I'd wire real payments and durable auth earlier so the commercial flow is testable from day one, and I'd invest in the maintainer surface sooner — because the tool that keeps the library alive matters as much as the catalog people see.

---

*Rockicon — designed & built end to end, from handoff to live product, in a browser-first vibe-coding workflow.*
