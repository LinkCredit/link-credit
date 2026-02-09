# CLAUDE.md — Link Credit (Houston)

## Project Overview

AI-powered privacy credit scoring for low-collateral DeFi lending. Built for the [Chainlink Hackathon](https://chain.link/hackathon) (Privacy + DeFi tracks).

**Core flow**: User authorizes bank data → CRE Workflow fetches via Confidential HTTP → AI scores credit (0-100) → Score written on-chain → Lending pool offers lower collateral ratio.

## Architecture

```
L3: React DApp (frontend) — wallet connect, authorize eval, view score, borrow
L2: CRE Workflow (TypeScript) — Confidential HTTP → AI scoring → on-chain write
L1: Solidity Contracts (Sepolia) — CreditOracle.sol + CreditLendingPool.sol
```

## Tech Stack

- **Contracts**: Solidity, Foundry (Sepolia testnet)
- **CRE Workflow**: TypeScript, `@chainlink/cre-sdk`, compiled to WASM
- **Mock API + AI Scoring**: TypeScript (Bun), deployed to Vercel/Railway
- **Frontend**: React + wagmi/viem + TailwindCSS
- **Package manager**: bun (preferred), pnpm as fallback

## Key CRE SDK Constraints

- Workflow callbacks are **stateless** — each trigger starts from zero
- Runs in **QuickJS** engine, NOT full Node.js — no `node:crypto` or built-in modules
- AI inference must be done via **external HTTP API** calls
- Multi-node execution with **BFT consensus** (use `cre.consensusMedianAggregation`)
- Confidential HTTP: API keys stored in Vault DON, data processed in TEE

## Contracts

- `CreditOracle.sol` — stores per-user credit scores (0-100) and collateral ratios (100-200%)
- `CreditLendingPool.sol` — reads oracle, enforces dynamic collateral requirements
- Only the CRE workflow address can write to the oracle

## Build & Dev Commands

```bash
# Install all workspace dependencies
bun install

# Run dev servers
bun run dev:api        # Mock API + AI scoring
bun run dev:frontend   # React DApp

# Build all
bun run build

# Contracts (Foundry — run from packages/contracts/)
cd packages/contracts && forge build && forge test
```

## Project Structure (Bun Monorepo)

```
houston/
├── package.json            # Root — workspaces: ["packages/*"]
├── tsconfig.json           # Shared TS config
├── packages/
│   ├── contracts/          # @link-credit/contracts — Foundry (Solidity)
│   ├── workflow/           # @link-credit/workflow — CRE workflow (TS → WASM)
│   ├── api/                # @link-credit/api — Mock bank API + AI scoring (Hono)
│   └── frontend/           # @link-credit/frontend — React DApp (Vite)
├── context.md              # Original architecture plan (Chinese)
└── CLAUDE.md               # This file
```

## Conventions

- Use **TypeScript** everywhere (no plain JS)
- Use **bun** as package manager
- Solidity: use Foundry (forge), not Hardhat
- Keep contracts minimal — this is a hackathon MVP
- Mock data is acceptable — focus on architecture and CRE integration
- Language: code and comments in English, context.md is in Chinese
