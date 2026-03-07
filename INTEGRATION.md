# Link Credit Integration Runbook

End-to-end guide for running the full stack on Sepolia testnet.

- Smart contracts (`packages/contracts`)
- CRE workflow (`packages/workflow`)
- API + frontend (`packages/api`, `packages/frontend`)

---

## 1) Prerequisites Checklist

- Bun installed (`bun --version`)
- CRE CLI installed (`cre --version`)
- Plaid sandbox keys
- OpenAI API key

Install CRE CLI:

```bash
curl -sSL https://cre.chain.link/install.sh | bash
```

## 2) Prepare Environment Variables

Each package manages its own environment variables via per-package `.env` files (auto-loaded by the respective runtime).

### For API dev server (`packages/api/.env`) — **REQUIRED**

Copy `packages/api/.env.example` to `packages/api/.env` and fill in:

| Variable | Source | Notes |
|---|---|---|
| `PLAID_CLIENT_ID` | [Plaid Dashboard](https://dashboard.plaid.com) | Sandbox key |
| `PLAID_SECRET` | Plaid Dashboard | Sandbox key |
| `WORKER_API_KEY` | Any string | For internal API auth (e.g., `dev-api-key-change-me`) |
| `TOKEN_ENCRYPTION_KEY` | Generate | 64-char hex string: `openssl rand -hex 32` |
| `WORLDCOIN_APP_ID` | [World ID Developer Portal](https://developer.worldcoin.org) | World ID app ID (e.g., `app_staging_xxx`) |
| `WORLDCOIN_RP_ID` | World ID Developer Portal | World ID v4 RP ID (e.g., `rp_xxx`) |
| `WORLDCOIN_RP_SIGNING_KEY` | World ID Developer Portal | World ID v4 signing key (keep secret!) |

### For CRE workflow (`packages/workflow/.env`) — REQUIRED for manual trigger

Copy `packages/workflow/.env.example` to `packages/workflow/.env` and fill in:

| Variable | Source | Notes |
|---|---|---|
| `PLAID_CLIENT_ID` | Plaid Dashboard | Same as API |
| `PLAID_SECRET` | Plaid Dashboard | Same as API |
| `OPENAI_API_KEY` | OpenAI API keys | Required for scoring |
| `WORKER_API_KEY` | Same as API | Must match |
| `TOKEN_ENCRYPTION_KEY` | Generate | Same as API: `openssl rand -hex 32` |
| `WORKER_BASE_URL` | — | Defaults to `http://localhost:3001` |

### For WorldID CRE workflow (`packages/worldid-workflow/.env`) — REQUIRED for manual trigger

Copy `packages/worldid-workflow/.env.example` to `packages/worldid-workflow/.env` and fill in:

| Variable | Source | Notes |
|---|---|---|
| `CRE_ETH_PRIVATE_KEY` | Your wallet | Private key for signing transactions |

Other configuration (chain selector, registry address, World ID app/RP IDs) is managed via config files (`config.staging.json`, `config.production.json`).

### For Frontend (`packages/frontend/.env`) — OPTIONAL

Copy `packages/frontend/.env.example` to `packages/frontend/.env` if you need custom values. Otherwise sensible defaults are used:
- `VITE_API_BASE_URL` — defaults to `http://localhost:3001`
- `VITE_WALLETCONNECT_PROJECT_ID` — defaults to `demo`

### Note on Config vs Env Vars

Workflow config files (referenced in `packages/workflow/project.yaml`, `workflow.yaml`) use separate JSON config files (`config.staging.json`, `config.production.json`) for non-secret parameters like:
- `chainSelectorName`, `oracleContractAddress` — read from `deployed-addresses.json` via `sync:addresses`
- `plaidBaseUrl`, `openAiBaseUrl`, `openAiModel` — baked into the WASM artifact

These are NOT environment variables and should not be manually edited unless you're deploying to a real CRE environment.

## 3) End-to-End Validation Flow

Here's the high-level workflow from start to finish:

1. `bun run dev:local` — start API + frontend (see Section 4).
2. Open the frontend and connect your Sepolia wallet.
3. Click `Evaluate My Credit`.
4. Complete the Plaid Link sandbox auth.
5. Confirm the wallet signature.
6. Copy the payload JSON from browser console → save to `packages/workflow/payload.json`.
7. Run Plaid Score CRE workflow with `cre workflow simulate --broadcast` to compute the score and write it on-chain (see Section 5).
8. Workflow completes and writes the credit score to `CreditOracle` on Sepolia.
9. Frontend refreshes and displays the updated score/LTV.

Each detailed step is covered in the sections below.

## 4) Start Dev Servers

One command (recommended):

```bash
bun run dev:local
```

Or start individually:

```bash
# API (port 3001)
cd packages/api && bun run dev

# Frontend (port 5173)
cd packages/frontend && bun run dev
```

## 5) Run Plaid Score CRE Workflow (Manual Trigger)

CRE workflow deployment to the DON is not yet available. Instead, use `cre workflow simulate` with `--broadcast` to execute the workflow locally and write the score on-chain.

### 5a) Capture the payload from the browser console

1. Open the frontend (dev servers must be running — see Section 4).
2. Connect wallet and complete the Plaid Link flow.
3. After the wallet signature, check the **browser console** (DevTools - press F12 or Cmd+Option+I) — the payload will be logged with clear markers:
   ```
   === TRIGGER PAYLOAD FOR WORKFLOW DEBUG ===
   {
     "publicToken": "public-sandbox-afa4124f-...",
     "walletAddress": "0xYourWalletAddress"
   }
   ==========================================
   ```
4. Copy the JSON (between the markers) and save it to `packages/workflow/payload.json`.

### 5b) Simulate with broadcast

```bash
cd packages/workflow
cre workflow simulate . \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @payload.json \
  --broadcast
```

This will:
- Run the full workflow locally (token exchange → Plaid data fetch → AI scoring)
- Broadcast the on-chain transaction to Sepolia, writing the credit score to `CreditOracle`

## 6) Run WorldID Verification CRE Workflow (Manual Trigger)

Similar to the main workflow, WorldID verification can be tested locally using `cre workflow simulate`.

### 6a) Capture the WorldID payload from the browser console

1. Open the frontend (dev servers must be running).
2. Connect wallet and complete the World ID verification flow.
3. After the wallet signature, check the **browser console** (DevTools - press F12 or Cmd+Option+I) — the payload will be logged:
   ```
   === WORLDID TRIGGER PAYLOAD FOR WORKFLOW DEBUG ===
   {
     "worldIdProof": {
       "action": "credit-scoring",
       "environment": "staging",
       "nonce": "0x003b3bc6aa0fe1f812d9c7420c6fe24162f9a951587e5e6b2ace3e768e3c8216",
       "protocol_version": "3.0",
       "responses": [
         {
           "identifier": "device",
           "merkle_root": "0x2362be3c4a31efd961e64471044a93ba6013dc44be1effc49a34b062c9200c52",
           "nullifier": "0x2674ecfd325f286f573a2d5633ad12d7bbe28e62ce20713a28695437343c0278",
           "proof": "0x00b91e9724e39a74c72a79fcb9246e7f03828a4afeabaa14db90793a7da7fbe9..."
         }
       ]
     },
     "walletAddress": "0xYourWalletAddress"
   }
   ===================================================
   ```
4. Copy the JSON (between the markers) and save it to `packages/worldid-workflow/payload.json`.

### 6b) Simulate with broadcast

```bash
cd packages/worldid-workflow
cre workflow simulate . \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @payload.json \
  --broadcast
```

This will:
- Verify the World ID proof with the World ID Developer Portal API
- Broadcast the verification result to `WorldIDRegistry` contract on Sepolia

## 7) Troubleshooting

- **`bun run dev:local` fails with "Missing required environment variables"**
  Fill in the listed variables in the root `.env` file.

- **API health check times out**
  Check `/tmp/link-credit-api.log` for startup errors. Ensure `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `WORKER_API_KEY` are set.

- **`cre: command not found`**
  Install CRE CLI (`brew install chainlink/tap/cre`) and restart shell.

- **`cre workflow simulate` fails with schema/config errors**
  Run `cre init` in a temp folder and compare generated template with this repo.

- **CRE deployment rejected due to access**
  Early Access may be required for DON deployment. Use `simulate` for local validation.

- **API returns `CRE workflow configuration is missing`**
  Ensure `.env` has `CRE_WORKFLOW_ID` and `CRE_WORKER_PRIVATE_KEY`.

- **Plaid errors (`INVALID_ACCESS_TOKEN`, auth failures)**
  Confirm sandbox keys and use sandbox Link flow only.

- **Frontend cannot read score**
  Verify `packages/contracts/deployed-addresses.json` has correct Sepolia addresses. Re-deploy if needed.
