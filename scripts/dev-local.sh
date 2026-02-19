#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo "Stopping API server (pid: $API_PID)"
    kill "$API_PID"
  fi

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
bun -e "
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

echo "Starting API dev server on http://localhost:3001..."
bun run dev:api > /tmp/link-credit-api.log 2>&1 &
API_PID=$!

echo "Waiting for API server..."
for i in {1..30}; do
  if curl -sS http://localhost:3001/ > /dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "API server did not start in time. Last API logs:"
    tail -n 50 /tmp/link-credit-api.log || true
    exit 1
  fi
  sleep 1
done

echo "Starting frontend dev server..."
bun run dev:frontend
