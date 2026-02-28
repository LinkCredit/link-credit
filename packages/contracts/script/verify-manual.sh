#!/usr/bin/env bash
# Manual contract verification for Sepolia Etherscan.
# Use this as a fallback when `bun run verify:sepolia` (--resume) fails for some contracts.
#
# Prerequisites:
#   - ETHERSCAN_API_KEY set in .env or environment
#   - deployed-addresses.json exists (from deployment)
#
# Usage:
#   cd packages/contracts
#   bash script/verify-manual.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "${ETHERSCAN_API_KEY:-}" ]; then
  echo "Error: ETHERSCAN_API_KEY not set. Add it to .env or export it."
  exit 1
fi

# Read addresses from deployed-addresses.json
DEPLOYER=$(cat deployed-addresses.json | python3 -c "import json,sys; print(json.load(sys.stdin)['deployer'])")
CREDIT_ORACLE=$(cat deployed-addresses.json | python3 -c "import json,sys; print(json.load(sys.stdin)['creditOracle'])")
CREDIT_POOL_IMPL=$(cat deployed-addresses.json | python3 -c "import json,sys; print(json.load(sys.stdin)['creditPoolImplementation'])")
POOL_ADDRESSES_PROVIDER=$(cat deployed-addresses.json | python3 -c "import json,sys; print(json.load(sys.stdin)['poolAddressesProvider'])")
WETH=$(cat deployed-addresses.json | python3 -c "import json,sys; print(json.load(sys.stdin)['weth'])")
DEFAULT_IRS=$(cat deployed-addresses.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('defaultInterestRateStrategy', ''))")

COMMON_ARGS="--chain sepolia --etherscan-api-key $ETHERSCAN_API_KEY --watch --retries 5 --delay 5"

echo "=== Verifying CreditOracle ==="
forge verify-contract "$CREDIT_ORACLE" \
  src/CreditOracle.sol:CreditOracle \
  $COMMON_ARGS \
  --constructor-args $(cast abi-encode "constructor(address)" "$DEPLOYER") \
  || echo "  [!] CreditOracle verification failed or already verified"

sleep 2

echo ""
echo "=== Verifying CreditPoolInstance ==="
forge verify-contract "$CREDIT_POOL_IMPL" \
  src/instances/CreditPoolInstance.sol:CreditPoolInstance \
  $COMMON_ARGS \
  --constructor-args $(cast abi-encode "constructor(address,address)" "$POOL_ADDRESSES_PROVIDER" "$DEFAULT_IRS") \
  || echo "  [!] CreditPoolInstance verification failed or already verified"

sleep 2

echo ""
echo "=== Verifying WETH9 ==="
forge verify-contract "$WETH" \
  lib/aave-v3-origin/src/contracts/dependencies/weth/WETH9.sol:WETH9 \
  $COMMON_ARGS \
  || echo "  [!] WETH9 verification failed or already verified"

echo ""
echo "=== Done ==="
echo "Check results at:"
echo "  CreditOracle:       https://sepolia.etherscan.io/address/${CREDIT_ORACLE}#code"
echo "  CreditPoolInstance:  https://sepolia.etherscan.io/address/${CREDIT_POOL_IMPL}#code"
echo "  WETH9:               https://sepolia.etherscan.io/address/${WETH}#code"
