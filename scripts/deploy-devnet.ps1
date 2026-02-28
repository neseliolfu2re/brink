# Deploy Last Click Wins to Devnet
# Run from project root (click/)
$ErrorActionPreference = "Stop"

Write-Host "=== Last Click Wins - Devnet Deploy ===" -ForegroundColor Cyan

$configPath = Join-Path (Join-Path $PSScriptRoot "..") ".aptos\config.yaml"
$hasProfile = $false
if (Test-Path $configPath) {
    $content = Get-Content $configPath -Raw
    if ($content -match "account:\s*0x") { $hasProfile = $true }
}

if (-not $hasProfile) {
    Write-Host "`n1. Creating Aptos profile (Devnet)..." -ForegroundColor Yellow
    aptos init --network Devnet --assume-yes
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "`n2. Funding account..." -ForegroundColor Yellow
aptos account fund-with-faucet --profile default --url https://faucet.devnet.aptoslabs.com
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n3. Publishing module..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "publish.ps1") -Profile default
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Update VITE_MODULE_ADDRESS in Vercel with the deployer address from config." -ForegroundColor Cyan
