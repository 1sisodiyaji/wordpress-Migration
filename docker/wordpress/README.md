# Local WordPress stack

| Service     | URL / port              | Credentials        |
|-------------|-------------------------|--------------------|
| WordPress   | http://localhost:4000   | (set on first run) |

The `wordpress` service bind-mounts `data/Plugin` at `wp-content/plugins/wp-grape-export`. Recreate the container after that volume change (`docker compose up -d`) so plugin edits are visible without copying files in.
| phpMyAdmin  | http://localhost:4001   | root / root        |
| MySQL       | localhost:3306          | wordpress / wordpress (db: `wordpress`) |

```bash
cd wordpress
docker compose up -d
```

Stop:

```bash
docker compose down
```

Data is kept in Docker volumes (`wp_data`, `wp_mysql_data`).
