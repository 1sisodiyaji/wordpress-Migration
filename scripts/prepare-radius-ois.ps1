# Prepare Docker/try-data/radius-ois/www for the Docker WordPress container.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$data = Join-Path "Docker\try-data" "radius-ois"
$www = Join-Path $data "www"

if (-not (Test-Path $www)) {
  Write-Host "Missing $www — place Radius-OIS www tree under Docker/try-data/radius-ois/"
  exit 1
}

Write-Host "Radius-OIS data ready at $www"
