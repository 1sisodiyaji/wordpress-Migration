# Prepare and start Radius-OIS WordPress on http://localhost:8084
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

& "$PSScriptRoot\prepare-radius-ois.ps1"

Write-Host ""
Write-Host "Starting Radius-OIS WordPress stack..."
docker compose up -d --build radius_db radius_phpmyadmin

Write-Host "Waiting for MariaDB..."
for ($i = 1; $i -le 60; $i++) {
  $status = docker inspect migration-radius_db-1 --format '{{.State.Health.Status}}' 2>$null
  if ($status -eq "healthy") { break }
  Start-Sleep -Seconds 2
}

$sqlPath = Join-Path "try-data" "radius-ois\Radius-ois.sql"
$tableCount = docker exec migration-radius_db-1 mysql -uroot -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='radius_ois';" 2>$null
if ([string]::IsNullOrWhiteSpace($tableCount) -or [int]$tableCount -lt 10) {
  Write-Host "Importing Radius-ois.sql (74MB, may take a few minutes)..."
  Get-Content -Raw $sqlPath | docker exec -i migration-radius_db-1 mysql -uroot radius_ois
  Write-Host "SQL import complete."
} else {
  Write-Host "Database already imported ($tableCount tables)."
}

docker compose up -d radius_wordpress

$url = "http://localhost:8084/"
Write-Host ""
Write-Host "Waiting for MariaDB import + WordPress (74MB SQL can take a few minutes)..."
$ready = $false
for ($i = 1; $i -le 120; $i++) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -SkipHttpErrorCheck
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
      Write-Host "Radius-OIS -> $url"
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 3
}

if (-not $ready) {
  Write-Host "Containers started; site may still be importing SQL."
}

$container = docker compose ps -q radius_wordpress 2>$null
if ($container) {
  Write-Host ""
  Write-Host "Activating export plugins..."
  foreach ($pair in @(
    @("wp-grape-export/wp-grape-export.php", "grape-export")
  )) {
    $plugin = $pair[0]
    $label = $pair[1]
    docker exec $container php -r "require '/var/www/html/wp-load.php'; `$r = activate_plugin('$plugin'); echo is_wp_error(`$r) ? `$r->get_error_message() : (is_plugin_active('$plugin') ? 'active' : 'inactive'); echo ' ($label)';" 2>$null
    Write-Host ""
  }
}

Write-Host ""
Write-Host "Done."
Write-Host "  Site:     http://localhost:8084"
Write-Host "  Admin:    http://localhost:8084/wp-admin"
Write-Host "  phpMyAdmin: http://localhost:8085"
Write-Host "  Logs:     docker compose logs -f radius_db radius_wordpress"
