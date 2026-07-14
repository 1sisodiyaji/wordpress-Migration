# WP Grape Export

A WordPress plugin that exports a **complete, structured snapshot** of a site — routes, shared layout (header/footer/menus), fully rendered page content, builder templates, asset enqueue order, and a media map — for conversion into a React + GrapeJS project.

It runs **inside WordPress**, so shortcodes, Elementor, and Theme Builder / ElementsKit templates are fully resolved (unlike an external scraper).

## Why

An external scraper cannot reliably resolve `[shortcodes]`, Elementor widget trees, or Theme Builder header/footer assignment because those require the WordPress runtime. This plugin renders everything from within WP and emits a versioned bundle matching `export-schema/v2/manifest.schema.json` in the main repo.

## Install (for local Docker testing)

`docker-compose.yml` bind-mounts this folder into the WordPress container:

```yaml
- ./wp-plugin/wp-grape-export:/var/www/html/wp-content/plugins/wp-grape-export
```

Then activate **WP Grape Export** in `wp-admin → Plugins`.

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
  rendered.html          # resolved content slot (no header/footer)
  raw.json | raw.html    # elementor data tree OR raw post_content
templates/
  index.json             # template library index
  <id>-<type>.html/.json # rendered + raw template data
assets/manifest.json     # dependency-ordered CSS/JS + inline blocks
media/map.json           # attachment id -> path/alt/sizes
audit/report.json        # unresolved shortcodes + warnings
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
