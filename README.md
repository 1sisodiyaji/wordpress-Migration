# Migration (segregated)

Independent outer packages:

```
Migration/
├── Plugin/       # WordPress exporter (PHP) — independent
├── Converter/    # Dump → React+GrapeJS — http://localhost:5174
├── Admin/        # Main UI / control plane — http://localhost:5173
├── Projects/     # {slug}/ = data + generated codebase (merged)
├── Scripts/      # Ops helpers
└── Docker/       # Compose files + try-data fixtures
```

## Run

```bash
# Terminal 1 — Converter
pnpm converter

# Terminal 2 — Admin
pnpm admin   # or: pnpm dev

# Optional local WordPress
pnpm wp:fresh:up    # :5001
pnpm wp:up          # Radius-OIS :8084
```

| Service | Port |
|---------|------|
| Admin | 5173 |
| Converter | 5174 |
| Project editors | 8000–8080 |
| Fresh WP | 5001 |
| Radius WP | 8084 |

## Projects/{slug}

Each project folder holds **both** imported snapshot data and the generated React/GrapeJS app:

- `data/` — export pages, layout, assets manifest
- `import/` — upload staging
- `studio.json` — Admin meta / assigned port
- `src/`, `public/`, `package.json` — Vite editor app

## Notes

- Plugin is bind-mounted from `Plugin/` into Docker Radius WordPress.
- Admin calls Converter over HTTP for generate (`CONVERTER_URL`, default `http://localhost:5174`).
