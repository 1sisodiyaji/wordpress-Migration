# WP → GrapeJS Studio

Web app to **import a wp-grape-export bundle** (ZIP upload or REST pull), **convert to GrapeJS**, and **open the editor**.

## Start the studio

```bash
pnpm install
pnpm dev
```

Open **http://localhost:5173**

## Flow (in the UI)

1. **New project** — upload a `wp-grape-export` ZIP **or** pull from WordPress (REST) **or** upload SQL + wp-content + wp-config
2. **Import** — lands structured site data under `sites/{slug}/`
3. **Convert** — builds a React + GrapeJS project in `projects/{slug}/`
4. **Start & open in new tab** — editor on port **3001+**

## Local WordPress (Radius-OIS)

```bash
pnpm wp:up         # Docker WordPress on http://localhost:8084
pnpm plugin:sync   # export from WP → import → regenerate GrapeJS (no ZIP uploads)
pnpm wp:down
```

`wp-plugin/wp-grape-export` is bind-mounted into the container. Edit the plugin, then run `pnpm plugin:sync` (or click **Sync from localhost:8084** in Studio). You do **not** re-upload a plugin ZIP for each change.

Compare:

| | WordPress | Studio |
|--|-----------|--------|
| Live site | http://localhost:8084 | http://localhost:5173 |
| After sync | — | generated editor on port 3001+ |

## Repo layout

```
wp-plugin/          WordPress plugins (wp-grape-export, wp-instatic-export)
studio/             Web UI + API (port 5173)
generator/          GrapeJS project scaffold
lib/wp-import/      Plugin ZIP import + REST pull + file import
lib/wp/             Site registry, types, migration log
export-schema/v2/   Plugin bundle JSON schema
sites/              Imported site data (runtime)
projects/           Generated GrapeJS apps (runtime)
```

## CLI

```bash
pnpm generate -- --site <slug> --run
```

## Ports

| Service | Port |
|---------|------|
| Studio UI + API | 5173 |
| Local WordPress (radius) | 8084 |
| phpMyAdmin | 8085 |
| GrapeJS editor | 3001, 3002, … |
