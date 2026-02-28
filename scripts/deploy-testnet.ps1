# Deploy Last Click Wins to Testnet
# Run this from the project root (click/)
$ErrorActionPreference = "Stop"

Write-Host "=== Last Click Wins - Testnet Deploy ===" -ForegroundColor Cyan

# 1. Init if needed
$configPath = Join-Path (Join-Path $PSScriptRoot "..") ".aptos\config.yaml"
$hasProfile = $false
if (Test-Path $configPath) {
    $content = Get-Content $configPath -Raw
    if ($content -match "account:\s*0x") { $hasProfile = $true }
}

if (-not $hasProfile) {
    Write-Host "`n1. Creating Aptos profile (first time)..." -ForegroundColor Yellow
    aptos init --network Testnet --assume-yes
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# 2. Fund account
Write-Host "`n2. Funding account with faucet..." -ForegroundColor Yellow
aptos account fund-with-faucet --profile default
if ($LASTEXITCODE -ne 0) { exit 1 }

# 3. Publish (uses address from profile)
Write-Host "`n3. Publishing module..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "publish.ps1") -Profile default
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nIf 'address not found': Run 'aptos init --network Testnet' first." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Deployed successfully ===" -ForegroundColor Green
Write-Host "Set VITE_MODULE_ADDRESS=<your_address> in frontend/.env for the dApp" -ForegroundColor Cyan
