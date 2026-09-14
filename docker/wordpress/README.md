# Local WordPress stack

| Service     | URL / port              | Credentials        |
|-------------|-------------------------|--------------------|
| WordPress   | http://localhost:4000   | (set on first run) |
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
