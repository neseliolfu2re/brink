#!/usr/bin/env bash
# Publish Last Click Wins.
# Usage: ./scripts/publish.sh [profile|0xADDRESS] [profile]
#   ./scripts/publish.sh              # default profile, infer address
#   ./scripts/publish.sh testnet      # testnet profile, infer address
#   ./scripts/publish.sh 0xADDRESS     # explicit address, default profile
#   ./scripts/publish.sh 0xADDRESS testnet
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [[ "$1" == 0x* ]]; then
  ADDRESS="$1"
  PROFILE="${2:-default}"
else
  PROFILE="${1:-default}"
  ADDRESS=$(aptos config show-profiles --profile "$PROFILE" 2>/dev/null | grep -oE "account:\s*0x[a-fA-F0-9]+" | head -1 | sed 's/account:\s*//')
  if [ -z "$ADDRESS" ]; then
    echo "Error: Pass 0xADDRESS or run 'aptos init --network testnet' first."
    exit 1
  fi
fi

echo "Publishing with --named-addresses last_click_wins=$ADDRESS (profile: $PROFILE)"
aptos move publish --dev --named-addresses "last_click_wins=$ADDRESS" --profile "$PROFILE"
echo "Done. Init_module runs at publish; GameState is at $ADDRESS."
