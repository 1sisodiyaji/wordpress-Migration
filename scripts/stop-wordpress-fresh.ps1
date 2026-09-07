# Stop fresh WordPress (port 5001). Does not touch Radius-OIS.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Stopping fresh WordPress stack..."
docker compose -f docker-compose.fresh.yml down

Write-Host "Stopped. Volumes kept (data survives next up)."
Write-Host "To wipe data too: docker compose -f docker-compose.fresh.yml down -v"
