#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ -n "${ANVIL_PID:-}" ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo "Stopping Anvil (pid: $ANVIL_PID)"
    kill "$ANVIL_PID"
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Anvil on http://127.0.0.1:8545 (chainId 31337)..."
anvil --chain-id 31337 > /tmp/link-credit-anvil.log 2>&1 &
ANVIL_PID=$!
sleep 2

echo "Deploying contracts to local Anvil..."
(
  cd packages/contracts
  bun run deploy:local
)

echo "Generating packages/frontend/.env.local from deployed addresses..."
node -e "
  const fs = require('fs');
  const raw = require('./packages/contracts/out/deployed-addresses.json');
  const addrs = raw.deployment ?? raw;
  const env = [
    'VITE_RPC_URL=http://127.0.0.1:8545',
    'VITE_CHAIN_ID=31337',
    'VITE_CREDIT_ORACLE_ADDRESS=' + addrs.creditOracle,
    'VITE_POOL_ADDRESS=' + addrs.poolProxy,
    'VITE_WETH_ADDRESS=' + addrs.weth,
    'VITE_USDX_ADDRESS=' + addrs.usdx,
    'VITE_WBTC_ADDRESS=' + addrs.wbtc,
    'VITE_API_BASE_URL=http://localhost:3001',
    'VITE_WALLETCONNECT_PROJECT_ID=demo',
  ].join('\\n') + '\\n';
  fs.writeFileSync('packages/frontend/.env.local', env);
  console.log('Frontend .env.local generated:\\n');
  console.log(env);
"

echo "Starting frontend dev server..."
bun run dev:frontend
