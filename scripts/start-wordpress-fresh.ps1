# Fresh WordPress on http://localhost:5001 (separate from Radius-OIS on 8084)
# No plugin bind-mount — upload plugins via wp-admin if needed.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

$composeFile = "docker-compose.fresh.yml"
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
  # Docker writes progress to stderr; with Stop that becomes a terminating error in PowerShell.
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
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -ge 200) {
      $ready = $true
      break
    }
  }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Host "WordPress container started but HTTP not ready yet."
  Write-Host "Check: docker compose -f $composeFile logs -f"
  exit 1
}

Write-Host "Ensuring WordPress is installed..."
$code = Invoke-DockerCompose -Args @("run", "--rm", "--entrypoint", "wp", "fresh_wpcli", "core", "is-installed")
if ($code -ne 0) {
  Write-Host "Running wp core install..."
  $code = Invoke-DockerCompose -Args @(
    "run", "--rm", "--entrypoint", "wp", "fresh_wpcli", "core", "install",
    "--url=$url",
    "--title=$siteTitle",
    "--admin_user=$adminUser",
    "--admin_password=$adminPass",
    "--admin_email=$adminEmail",
    "--skip-email"
  )
  if ($code -ne 0) {
    Write-Host "wp core install failed. Open $url and finish the installer in the browser."
    exit 1
  }
} else {
  Write-Host "WordPress already installed."
}

Write-Host ""
Write-Host "Done - fresh WordPress is ready."
Write-Host "  Site:   $url"
Write-Host "  Admin:  $url/wp-admin"
Write-Host "  User:   $adminUser"
Write-Host "  Pass:   $adminPass"
Write-Host "  Stop:   pnpm wp:fresh:down"
Write-Host "  Logs:   docker compose -f $composeFile logs -f"
Write-Host ""
Write-Host "Upload plugins via wp-admin (no plugin bind-mount on this stack)."
Write-Host "Radius-OIS on :8084 is untouched."
