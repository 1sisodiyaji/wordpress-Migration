# Fresh WordPress on http://localhost:5001 (separate from Radius-OIS on 8084)
# No plugin bind-mount — upload Plugin ZIP via wp-admin if needed.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

$composeFile = "Docker/docker-compose.fresh.yml"
$url = "http://localhost:5001"
$adminUser = if ($env:WP_FRESH_ADMIN_USER) { $env:WP_FRESH_ADMIN_USER } else { "admin" }
$adminPass = if ($env:WP_FRESH_ADMIN_PASSWORD) { $env:WP_FRESH_ADMIN_PASSWORD } else { "admin" }
$adminEmail = if ($env:WP_FRESH_ADMIN_EMAIL) { $env:WP_FRESH_ADMIN_EMAIL } else { "admin@example.com" }
$siteTitle = if ($env:WP_FRESH_SITE_TITLE) { $env:WP_FRESH_SITE_TITLE } else { "WP Fresh" }

function Invoke-DockerCompose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & docker compose -f $composeFile @Args
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return $code
}

Write-Host "Starting fresh WordPress stack (port 5001)..."
$code = Invoke-DockerCompose -Args @("up", "-d", "fresh_db", "fresh_wordpress")
if ($code -ne 0) {
  Write-Host "Failed to start containers (exit $code)."
  exit $code
}

Write-Host "Waiting for WordPress HTTP..."
$ready = $false
for ($i = 1; $i -le 90; $i++) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Host "WordPress did not become ready in time."
  exit 1
}

Write-Host "Ensuring WP is installed..."
docker compose -f $composeFile run --rm --entrypoint wp fresh_wpcli core is-installed 2>$null
if ($LASTEXITCODE -ne 0) {
  docker compose -f $composeFile run --rm --entrypoint wp fresh_wpcli core install `
    --url=$url `
    --title=$siteTitle `
    --admin_user=$adminUser `
    --admin_password=$adminPass `
    --admin_email=$adminEmail `
    --skip-email 2>&1 | Out-Host
}

Write-Host ""
Write-Host "Fresh WordPress ready -> $url"
Write-Host "Admin: $adminUser / $adminPass"
Write-Host "Upload Plugin/ as a ZIP in wp-admin if needed."
