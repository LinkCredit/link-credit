# Link Credit Integration Runbook

This guide connects all three parts of the stack for end-to-end testing:

- Smart contracts (`packages/contracts`)
- CRE workflow (`packages/workflow`)
- API + frontend (`packages/api`, `packages/frontend`)

## 1) Prerequisites Checklist

- Bun installed (`bun --version`)
- Foundry installed (`forge --version`, `cast --version`)
- CRE CLI installed (`cre --version`)
- Sepolia RPC endpoint
- Plaid sandbox keys
- OpenAI API key
- A funded Sepolia deployer wallet

Install CRE CLI on macOS:

```bash
brew install chainlink/tap/cre
```

## 2) Prepare Environment Variables

1. Copy `.env.example` to `.env` at the repo root.
2. Fill all required values:
   - `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `DEPLOYER_ADDRESS`
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `OPENAI_API_KEY`
   - `WORKER_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `CRE_WORKER_PRIVATE_KEY`

Workflow config files already reference env vars:

- `packages/workflow/project.yaml`
- `packages/workflow/workflow.yaml`
- `packages/workflow/secrets.yaml`

## 3) Deploy Contracts to Sepolia

```bash
cd packages/contracts
forge script script/DeployCreditMarket.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
```

Expected output:

- Successful broadcast logs from Foundry
- `packages/contracts/out/deployed-addresses.json` created

After deployment:

1. Read addresses from `packages/contracts/out/deployed-addresses.json`
2. Update `.env`:
   - `CREDIT_ORACLE_ADDRESS`
   - all `VITE_*` frontend addresses

## 4) Simulate and Deploy CRE Workflow

Run local simulation first:

```bash
cd packages/workflow
cre workflow simulate .
```

Expected output:

- Workflow compile + simulation success
- No config/secret resolution errors

If simulation is good, deploy:

```bash
cre workflow deploy . --target sepolia
```

Expected output:

- Deployment accepted by CRE
- Returned `workflowId`

Then:

1. Set `.env` `CRE_WORKFLOW_ID` to the returned workflow ID.
2. Upload secrets:

```bash
cre secrets create secrets.yaml
```

3. Set workflow address on `CreditOracle`:

```bash
cast send "$CREDIT_ORACLE_ADDRESS" "setCreWorkflow(address)" "$WORKFLOW_ADDRESS" \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

## 5) Start API

```bash
cd packages/api
bun run dev
```

Expected output:

- API running on `http://localhost:3001`
- `/health` responds with JSON status

## 6) Start Frontend

```bash
cd packages/frontend
bun run dev
```

Expected output:

- Vite serves app locally
- Frontend can reach `VITE_API_BASE_URL`

## 7) End-to-End Validation Flow

1. Connect Sepolia wallet in UI.
2. Click `Evaluate My Credit`.
3. Complete Plaid Link sandbox auth.
4. Confirm wallet signature.
5. API calls CRE gateway and triggers workflow.
6. Workflow writes score on-chain.
7. Frontend receives `ScoreUpdated` and refreshes score/LTV.

## 8) Verification Commands

```bash
# contracts
cd packages/contracts && forge test --ffi

# workflow unit tests
cd packages/workflow && bun test

# API + frontend local dev
cd packages/api && bun run dev
cd packages/frontend && bun run dev
```

## 9) Troubleshooting

- `cre: command not found`
  - Install CRE CLI and restart shell.
- `cre workflow simulate` fails with schema/config errors
  - Run `cre init` in a temp folder and compare generated template with this repo.
- CRE deployment rejected due access
  - Early Access may be required for DON deployment. Keep using `simulate` for local validation.
- API returns `CRE workflow configuration is missing`
  - Ensure `.env` has `CRE_WORKFLOW_ID` and `CRE_WORKER_PRIVATE_KEY`.
- Plaid errors (`INVALID_ACCESS_TOKEN`, auth failures)
  - Confirm sandbox keys and use sandbox Link flow only.
- Frontend cannot read score
  - Recheck deployed contract addresses and chain ID (`11155111`) in `.env`.
