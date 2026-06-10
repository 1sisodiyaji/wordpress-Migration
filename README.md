# WordPress → Remix (pixel-perfect migration)

Automated migration from your Docker WordPress stack (`New-Docker/docker-compose.yaml`) to this **React Router v7 (Remix)** app.

## Goals

| Layer | Approach |
|--------|----------|
| **Design (pixel-perfect)** | Crawl live WP pages, download all theme + block CSS, preserve `wp-block-*` classes and homepage HTML shell |
| **Content** | WordPress REST API (default) or [WPGraphQL](https://www.wpgraphql.com/) when installed |
| **Verification** | Playwright side-by-side screenshots (WP vs Next) |

## Prerequisites

1. WordPress running: `docker compose -f New-Docker/docker-compose.yaml up -d`
2. Site reachable at **http://localhost:8080**
3. Node 20+

## RADIUS OIS (radius-ois.ai)

Production site: **Elementor Pro** + Astra child, 75+ pages, REST + GraphQL.

```bash
npm run migrate:radius   # uses .env.radius → https://radius-ois.ai
npm run dev
```

Local WordPress dump: see `docker/docker/RADIUS-LOCAL.md`.

## Quick start

```bash
cd next-wp-migrate
cp .env.example .env.local   # already created if you cloned this repo
npm run migrate              # pull CSS + content from WordPress
npm run dev                  # http://localhost:5173 (Vite default)
npm run build && npm start   # production server
```

## Migration commands

| Command | What it does |
|---------|----------------|
| `npm run migrate` | Styles + content + optional snapshots |
| `npm run migrate:styles` | CSS, inline styles, body classes, homepage HTML shell |
| `npm run migrate:content` | Pages, posts, media, routes → `src/data/migrated/manifest.json` |
| `npm run migrate:snapshots` | PNG diffs in `migration-reports/snapshots/` (Remix dev server must be running) |

## Optional: WPGraphQL (richer content)

1. In WP Admin → Plugins → Add New → install **WPGraphQL**
2. Set in `.env.local`:

   ```
   WORDPRESS_GRAPHQL_URL=http://localhost:8080/graphql
   ```

3. Re-run `npm run migrate`

GraphQL is used automatically when the endpoint responds.

## Optional: pretty permalinks (cleaner REST URLs)

In WP Admin → Settings → Permalinks → choose **Post name** → Save.

Then REST works at `/wp-json/` instead of `index.php?rest_route=`.  
This project supports **both** automatically.

## Elementor support

**Yes — Elementor is supported** for pixel-perfect migration.

Elementor does **not** store layout in `content.rendered` (it uses post meta + frontend CSS). This project handles that by:

1. **Detecting** Elementor (`elementor-frontend`, `.elementor-page`, etc.)
2. **Crawling** each published URL’s **live rendered HTML** (header, sections, footer)
3. **Downloading** Elementor assets:
   - Plugin CSS (`frontend.min.css`, widgets, icons)
   - Per-page CSS: `/wp-content/uploads/elementor/css/post-{id}.css`
   - Google Fonts / inline `<style>` blocks
4. **Serving** crawled HTML in Remix via `WpPageShell` (same approach as homepage shell)

After installing Elementor on your Docker WordPress site:

```bash
npm run migrate
npm run dev
```

### Elementor system (templates + custom code)

Elementor on RADIUS works in layers:

1. **Theme Builder** (`elementor_library`) — headers, footers, popups embedded in each page crawl
2. **Custom Code** (`elementor_snippet`) — conditional CSS/JS (tabs, navbar animation, scroll effects)
3. **Per-page CSS** — `uploads/elementor/css/post-{id}.css`

Migration now:

- Fetches all **elementor_snippet** entries + extracts their CSS/JS
- Saves **per-page** scripts/styles to `pages/{route}.assets.json`
- Transforms HTML: internal `<a>` → React Router `Link`
- Runs custom code via `ElementorRuntime` after React hydration

Re-run after WP changes:

```bash
npm run migrate:radius
```

### Elementor limitations (honest)

| Works well | Harder / manual |
|------------|------------------|
| Static layouts, typography, colors, spacing | Elementor **popups**, **theme builder** conditions |
| Widget HTML + CSS snapshot | Dynamic tags (user-specific data) |
| Forms UI (visual) | Form **submissions** (need new API/backend) |
| Global kits / page CSS files | WooCommerce loops without extra crawl rules |

For 100% parity after design changes, re-run `npm run migrate`.  
Optional: install **WPGraphQL + WPGraphQL for Elementor** for structured data (URLs still need shell crawl for layout).

### Hybrid sites

Some pages block-based, some Elementor: routes with Elementor markup get `renderMode: "shell"` automatically; others use REST `content.rendered`.

## Pixel-perfect checklist

1. Run `npm run migrate` after every theme/design change in WordPress
2. Compare `migration-reports/snapshots/*-wordpress.png` vs `*-nextjs.png`
3. Keep `WpContent` rendering `content.rendered` (block markup intact)
4. For custom blocks/plugins, add React mappings under `src/components/wp/blocks/` (future step)

## Project layout

```
app/                 # Remix root + routes (root.tsx, routes/_index, routes/$)
scripts/migrate/     # CLI: fetch styles, content, visual snapshots
src/lib/wp/          # REST + GraphQL clients, types, loaders
src/components/wp/   # WpShell, WpContent, WpStyles
src/data/migrated/   # Generated JSON + page HTML shells
public/wp-migrated/  # Downloaded CSS from WordPress
```

## Docker reference

Your stack (`New-Docker/docker-compose.yaml`):

- WordPress: **8080**
- phpMyAdmin: **8081**
- MySQL: **3306**

## Next steps (manual polish)

- Map high-traffic blocks to React components for smaller bundles
- Enable ISR/webhooks when WP content changes
- Point production `WORDPRESS_URL` at staging/production WP
