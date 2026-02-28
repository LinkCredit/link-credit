#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# Validate packages/api/.env exists and has required variables
# ---------------------------------------------------------------------------
API_ENV="$REPO_ROOT/packages/api/.env"
if [[ ! -f "$API_ENV" ]]; then
  echo "ERROR: packages/api/.env not found."
  echo "Copy packages/api/.env.example to packages/api/.env and fill in all required values."
  echo "See INTEGRATION.md Section 2 for details."
  exit 1
fi

# Source API .env and validate required vars
set -o allexport
# shellcheck disable=SC1091
source "$API_ENV"
set +o allexport

MISSING=()
for var in PLAID_CLIENT_ID PLAID_SECRET WORKER_API_KEY TOKEN_ENCRYPTION_KEY; do
  if [[ -z "${!var:-}" ]]; then
    MISSING+=("$var")
  fi
done

# Validate TOKEN_ENCRYPTION_KEY format (must be 64 hex chars)
if [[ -n "${TOKEN_ENCRYPTION_KEY:-}" ]] && [[ ! "${TOKEN_ENCRYPTION_KEY}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  MISSING+=("TOKEN_ENCRYPTION_KEY (must be 64-character hex string)")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing or invalid required environment variables in packages/api/.env:"
  for var in "${MISSING[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Generate TOKEN_ENCRYPTION_KEY with: openssl rand -hex 32"
  echo "See INTEGRATION.md Section 2 for details."
  exit 1
fi

# ---------------------------------------------------------------------------
# Cleanup handler
# ---------------------------------------------------------------------------
cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo "Stopping API server (pid: $API_PID)"
    kill "$API_PID"
  fi
}

trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Sync deployed addresses to workflow configs
# ---------------------------------------------------------------------------
echo "Syncing deployed addresses to workflow configs..."
(cd "$REPO_ROOT" && bun run sync:addresses)

# ---------------------------------------------------------------------------
# Start API dev server
# ---------------------------------------------------------------------------
echo "Starting API dev server on http://localhost:3001..."
(cd "$REPO_ROOT" && bun run dev:api) > /tmp/link-credit-api.log 2>&1 &
API_PID=$!

echo "Waiting for API server..."
for i in {1..30}; do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "API server ready."
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "ERROR: API server did not start in time. Last logs:"
    tail -n 50 /tmp/link-credit-api.log || true
    exit 1
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# Start frontend dev server (foreground)
# ---------------------------------------------------------------------------
echo "Starting frontend dev server..."
(cd "$REPO_ROOT" && bun run dev:frontend)
