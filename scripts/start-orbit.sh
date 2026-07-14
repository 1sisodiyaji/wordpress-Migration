#!/usr/bin/env bash
# Start Orbit Commercial Bank WordPress on http://localhost:8083
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f try-data/orbit_central_bank.sql ]]; then
  cp "try-data/orbit_central_bank .sql" try-data/orbit_central_bank.sql
fi

docker compose up -d --build orbit_db orbit_wordpress

echo ""
echo "Waiting for MariaDB import + WordPress..."
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://localhost:8083/" 2>/dev/null; then
    echo "Orbit WordPress is up: http://localhost:8083"
    exit 0
  fi
  sleep 3
done

echo "Containers started; site may still be importing SQL. Check:"
echo "  docker compose logs -f orbit_db orbit_wordpress"
echo "  http://localhost:8083"
