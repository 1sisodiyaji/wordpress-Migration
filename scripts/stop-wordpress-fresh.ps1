# Stop fresh WordPress stack (port 5001)
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

docker compose -f Docker/docker-compose.fresh.yml down

Write-Host "Fresh WordPress stopped."
Write-Host "To wipe data too: docker compose -f Docker/docker-compose.fresh.yml down -v"
