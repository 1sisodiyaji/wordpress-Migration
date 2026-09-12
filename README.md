# Production deploy

Images (built and pushed from `main`):

- `1sisodiyaji/pen-wordpress-migrator-admin:latest`
- `1sisodiyaji/pen-wordpress-migrator-converter:latest`

```bash
cp .env.example .env
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
```

`output/` and `tmp/` are blank volume mounts for generated projects.
Dockerfiles under `docker/` are kept for rebuild reference; build/push from `main`.