# WP Instatic Export

WordPress plugin that exports a **static HTML / CSS / JS ZIP** aimed at **Instatic Super Import**.

It auto-detects the page builder (Elementor, Gutenberg, classic, Divi, WPBakery, Beaver), fetches each published page as a front-end visitor would see it, copies local assets, and rewrites URLs to **relative** paths.

## Install

1. Zip the `wp-instatic-export` folder (or use the packaged `wp-instatic-export-0.1.0.zip` beside this directory).
2. In WordPress: **Plugins → Add New → Upload Plugin**.
3. Activate **WP Instatic Export**.

## Usage

1. Open **Tools → Instatic Export**.
2. Review the detected builder and route list.
3. Click **Run Instatic export**.
4. Download the ZIP from the success notice.

## ZIP layout

```
index.html
about/index.html
contact/index.html
assets/wp-content/themes/...
assets/wp-content/uploads/...
assets/wp-content/plugins/...
instatic-manifest.json
```

- Pages use `path/index.html` (front page → `index.html`).
- Local CSS, JS, fonts, and media land under `assets/` with the same site path under that prefix.
- HTML `href` / `src` / `srcset` and CSS `url()` are rewritten to relative links from each page.
- `instatic-manifest.json` records builder detection, pages, assets, missing files, and warnings (Instatic can ignore this file).

## Requirements

- WordPress 5.8+
- PHP 7.4+
- PHP `ZipArchive`
- The site must be **HTTP-reachable from itself** (`wp_remote_get( home_url(...) )`) so full rendered HTML (Elementor CSS/JS chrome included) can be captured.

## Notes

- Keep **WP Grape Export** for Migration Studio / GrapeJS structured dumps.
- Use **this plugin** when the destination is Instatic (or any static importer that wants plain HTML + relative assets).
- External CDNs are left as absolute URLs; only same-host assets are packed.

## Version

0.1.0 — MVP: builder detect, full-page fetch, asset pack, relative rewrite, ZIP download.
