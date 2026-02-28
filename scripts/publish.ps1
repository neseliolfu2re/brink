# Publish Last Click Wins.
# Usage:
#   .\scripts\publish.ps1 -Profile default                    # uses profile's account
#   .\scripts\publish.ps1 -Address 0x... -Profile default   # explicit address
param(
    [string]$Address = "",
    [string]$Profile = "default"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if ([string]::IsNullOrWhiteSpace($Address)) {
    $out = aptos config show-profiles --profile $Profile 2>&1 | Out-String
    if ($out -match "account:\s*(0x[a-fA-F0-9]+)") { $Address = $Matches[1] }
    if (-not $Address) {
        Write-Host "Error: Pass -Address 0x... or run 'aptos init --network Testnet' first."
        exit 1
    }
}

$addrArg = "last_click_wins=$Address"
Write-Host "Publishing with --named-addresses $addrArg (profile: $Profile)"
aptos move publish --dev --named-addresses $addrArg --profile $Profile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done. Init_module runs at publish; GameState is at $Address."
