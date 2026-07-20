#!/usr/bin/env bash
# Start Smartco (8082) + Orbit Commercial Bank (8083) with wp-grape-export mounted.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f try-data/orbit_central_bank.sql ]]; then
  cp "try-data/orbit_central_bank .sql" try-data/orbit_central_bank.sql
fi

echo "Starting Smartco + Orbit WordPress stacks..."
docker compose up -d --build db wordpress orbit_db orbit_wordpress

wait_for() {
  local url="$1"
  local label="$2"
  for i in $(seq 1 90); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      echo "✓ $label → $url"
      return 0
    fi
    sleep 2
  done
  echo "⚠ $label started but not responding yet: $url"
  return 1
}

echo ""
echo "Waiting for sites (SQL import can take a minute)..."
wait_for "http://localhost:8082/" "Smartco"
wait_for "http://localhost:8083/" "Orbit"

# Activate wp-grape-export in both containers if PHP can load WP.
activate_plugin() {
  local container="$1"
  local label="$2"
  docker exec "$container" php -r "
require '/var/www/html/wp-load.php';
\$result = activate_plugin('wp-grape-export/wp-grape-export.php');
if (is_wp_error(\$result)) {
  echo 'activate error: ' . \$result->get_error_message() . PHP_EOL;
  exit(1);
}
\$active = is_plugin_active('wp-grape-export/wp-grape-export.php');
echo (\$active ? 'active' : 'inactive') . PHP_EOL;
" 2>/dev/null || echo "skip activate ($label)"
}

echo ""
echo "Activating wp-grape-export..."
activate_plugin "wordpress-migration-wordpress-1" "smartco"
activate_plugin "wordpress-migration-orbit_wordpress-1" "orbit"

echo ""
echo "Done."
echo "  Smartco:  http://localhost:8082"
echo "  Orbit:    http://localhost:8083"
echo "  phpMyAdmin (smartco DB): http://localhost:8081"
echo "  Plugin: Tools → Grape Export (in each wp-admin)"
