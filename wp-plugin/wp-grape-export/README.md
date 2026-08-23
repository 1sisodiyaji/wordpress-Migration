# WP Grape Export

A WordPress plugin that exports a **complete, structured snapshot** of a site — routes, shared layout (header/footer/menus), fully rendered page content, builder templates, asset enqueue order, and a media map — for conversion into a React + GrapeJS project.

It runs **inside WordPress**, so shortcodes, Elementor, and Theme Builder / ElementsKit templates are fully resolved (unlike an external scraper).

### Shortcodes & nested templates (v0.1.11+)

Elementor HTML widgets and CTA embeds often leave literal `[shortcodes id="123"]`
whose real markup lives in `wp_postmeta._elementor_data` for that post ID.

**0.1.11** improves header/footer + shortcode export:

- Inlines header/footer **HTML** into `layout.json` (not only `htmlFile` paths)
- Detects Theme Builder / HFE location via `_elementor_location` (+ ElementsKit/HFE CPTs)
- Expands ID-based shortcodes (`[elementor-template id="…"]`, `[hfe_template …]`,
  any `[tag id="123"]` pointing at an Elementor document) by rendering `_elementor_data`
- Writes orphan CTA/section documents into `templates/` when referenced only by shortcode
- Stamps `slots.headerTemplateId` / `footerTemplateId` on each page `meta.json`

### Shortcodes & nested templates (v0.1.9+)

Elementor HTML widgets and failed template embeds often leave literal `[shortcodes]`
in export HTML. **0.1.9** adds `Shortcode_Resolver`:

- Expands `[elementor-template id="…"]` (and ElementsKit equivalents) by rendering
  the referenced document when the WP shortcode is missing or returns empty
- Runs `do_shortcode()` in multiple passes after Elementor render
- Scans `_elementor_data` for Shortcode / Template widgets (not only empty `post_content`)
- Writes `pages/{key}/shortcodes.json` with detected + expanded inventory
- Audits only real WP shortcode leftovers (no more false positives from JS `[idx]`)

## Why

An external scraper cannot reliably resolve `[shortcodes]`, Elementor widget trees, or Theme Builder header/footer assignment because those require the WordPress runtime. This plugin renders everything from within WP and emits a versioned bundle matching `export-schema/v2/manifest.schema.json` in the main repo.

## Local inner loop (no ZIP upload)

The plugin folder is **bind-mounted** into Docker. PHP edits on disk are live in WordPress immediately — do **not** re-zip and re-upload the plugin.

After you change export code:

```bash
pnpm plugin:sync
```

That one command:

1. Runs export inside the WordPress container (`http://localhost:8084`)
2. Writes `uploads/wp-grape-export/latest/` (and `latest.zip`)
3. Imports into `sites/radius-ois/`
4. Regenerates `projects/radius-ois/` (keeps `node_modules`)

In Studio you can also click **Sync from localhost:8084** on the project.

```bash
pnpm plugin:sync -- --skip-generate   # export + import only
pnpm plugin:sync -- --no-media        # skip copying uploads
```

## Install (for local Docker testing)

`docker-compose.yml` bind-mounts this folder into the WordPress container:

```yaml
- ./wp-plugin/wp-grape-export:/var/www/html/wp-content/plugins/wp-grape-export
```

Then activate **WP Grape Export** in `wp-admin → Plugins`.

## Design goal: one-time frozen snapshot

After export, **you should never need WordPress again**. The ZIP must be a self-contained
archive of everything the live site needs for design fidelity:

| Layer | What we capture |
|-------|-----------------|
| **HTML** | Fully rendered pages, header/footer templates, menus |
| **Data** | Elementor `_elementor_data` trees (for editor/block conversion later) |
| **CSS** | Theme, Elementor kit, per-post `post-{id}.css`, widget-conditional CSS |
| **JS** | Elementor runtime, Swiper/carousels, ElementsKit, AOS/GSAP when detected |
| **Animations** | Elementor entrance/hover animation styles from widget settings + HTML |
| **Media** | Images/fonts referenced by pages (optional `copy_media`) |
| **Audit** | `audit/coverage.json` — widgets, plugins, animations per page + missing files |

### Per-page asset profiles (v0.1.5+)

Each route gets `pages/<key>/assets.json` listing widgets, animations, plugin deps,
and the exact CSS/JS paths that page needs. For a 60–80 page site with 5–6 plugins,
we **union** all page requirements into the global manifest while keeping per-page
profiles for the GrapeJS editor.

### Scaling to many pages + plugins

1. Export scans **every** route + header/footer/template post
2. Widget + animation + plugin detection runs per page, merged site-wide
3. Missing asset files are reported in `audit/coverage.json` before you leave WP
4. Generator uses per-page profiles so each GrapeJS canvas loads only what it needs

### Editor roadmap (our side)

The export bundle is designed to feed a custom GrapeJS editor:

- Per-page `canvasStyles` / `canvasScripts` from `assets.json`
- Header/footer as locked canvas components
- Elementor kit CSS variables mirrored into the iframe
- Next: animation playback controls, plugin widget toggles, export completeness UI in Studio

## Routes vs templates (important)

Only real **pages/posts** become routes. Public Elementor / ElementsKit library types
(`elementor_library`, `elementskit_template`, kits, headers, footers, sections) are
exported under `templates/` + `layout.json` only.

Previously those templates used query permalinks (`?elementskit_template=header-all`)
which collapsed to path `/` and overwrote the real Home page — fixed in **0.1.3**.

Widget-specific CSS/JS (image carousels / Swiper, nav menus, ElementsKit, theme styles,
Elementor kit `custom-*.css`) is detected from `_elementor_data` + rendered HTML and
staged into the bundle — improved in **0.1.4**.

Per-page `assets.json`, animation styles, third-party plugin packages (ElementsKit, AOS, GSAP),
and `audit/coverage.json` completeness report — **0.1.5**.

## Usage

### Admin UI
`wp-admin → Tools → Grape Export` → choose post types → **Run export** → download the ZIP.

### REST API
```
GET  /wp-json/wp-grape-export/v1/ping
GET  /wp-json/wp-grape-export/v1/whoami   # auth diagnostic (send Basic Authorization)
POST /wp-json/wp-grape-export/v1/export  # requires Administrator (manage_options)
```

**Authentication**

| Site | Credentials |
|------|-------------|
| `localhost` / `127.0.0.1` | Normal wp-admin username + password (plugin allows this) |
| Live / remote (HTTPS) | **Application Password only** — create under *Users → Profile → Application Passwords*. Your normal login password will always return `rest_not_logged_in`. |

If Application Passwords are missing in Profile, the host may block them, or the site is HTTP-only without our plugin’s local override.

`POST` body:
```json
{ "post_types": ["page", "post"], "copy_media": false }
```

Response:
```json
{ "ok": true, "url": "https://site/wp-content/uploads/wp-grape-export/wp-grape-export-...zip", "stats": { } }
```

## Bundle structure

```
manifest.json            # top-level, schema v2
site.json                # site meta + builder detection
layout.json              # header, footer, menus
routes.json              # all exported routes
pages/<key>/
  meta.json              # per-page metadata + shortcode list + slots
  assets.json            # per-page widgets, animations, plugins, CSS/JS paths
  rendered.html          # resolved content slot (no header/footer)
  raw.json | raw.html    # elementor data tree OR raw post_content
templates/
  index.json             # template library index
  <id>-<type>.html/.json # rendered + raw template data
assets/manifest.json     # dependency-ordered CSS/JS + inline blocks
media/map.json           # attachment id -> path/alt/sizes
audit/report.json        # unresolved shortcodes + warnings + coverage summary
audit/coverage.json      # site-wide widget/plugin/animation inventory + missing assets
```

## Builder support

| Builder | Status |
|---------|--------|
| Elementor / Elementor Pro | Rendered via `get_builder_content_for_display`, `_elementor_data` exported |
| ElementsKit header/footer | Resolved from `elementskit_template` CPT |
| Gutenberg | `the_content` block rendering |
| Classic | `the_content` (shortcodes resolved) |

## Output location

Exports are written to `wp-content/uploads/wp-grape-export/`.
