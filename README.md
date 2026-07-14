# WP → GrapeJS Studio

Web app to **scrape a site** (or import files), **convert to GrapeJS**, and **open the editor in a new tab**.

## Start the studio

```bash
pnpm install
pnpm dev
```

Open **http://localhost:5173**

## Flow (in the UI)

1. **New project** — enter a website URL *or* upload WordPress files **separately** (`.sql`, `wp-content` `.zip`, `wp-config.php`)  
2. **Start import** — merges uploads and imports pages + assets  
3. **Convert** — builds a React + GrapeJS project in `projects/{slug}/`  
4. **Start & open in new tab** — runs the editor on port **3001+** (separate from the studio)

## Folder layout

```
studio/           # Web UI + API (port 5173)
scraper/          # Scrape CLI (also used by studio API)
generator/        # GrapeJS project scaffold
lib/wp/           # Shared scraping libraries
sites/            # Scraped HTML output
projects/         # Generated GrapeJS React apps (port 3001+)
```

## Test with Smartco (try-data/)

Local WordPress export is in `try-data/`:

| File | Path |
|------|------|
| SQL | `try-data/smartco.sql` |
| wp-config | `try-data/smartco-20260705T182508Z-3-001/smartco/wp-config.php` |
| wp-content | `try-data/smartco-20260705T182508Z-3-001/smartco/wp-content.zip` |

One-command test (import + generate):

```bash
pnpm import:try-data -- --generate --run
```

Or upload the three files separately in the Studio UI under **WordPress files**.

```bash
pnpm scrape -- --url https://example.com --site example-com --all
pnpm generate -- --site example-com --run
```

## Ports

| Service | Port |
|---------|------|
| Studio UI + API | 5173 (`STUDIO_PORT`) |
| GrapeJS editor (per project) | 3001, 3002, … |
