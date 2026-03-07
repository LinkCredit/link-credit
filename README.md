# Link Credit

Link Credit is a hackathon project built for **Chainlink CRE**:  
https://chain.link/hackathon

It introduces privacy-aware, identity-aware credit signals into DeFi lending, so users are not forced into purely one-size-fits-all collateral rules.

## Demo

YouTube walkthrough:  
`<PASTE_YOUTUBE_DEMO_LINK_HERE>`

## Problem

Most DeFi lending is over-collateralized by design. That protects protocols, but ignores two important facts:

- users have different real-world repayment behavior
- without Sybil resistance, one person can create many wallets and game credit logic

This project addresses both.

## Key Building Blocks

- **Plaid**: a financial data network used here (sandbox mode) to fetch user-permissioned account balances and transaction history.
- **World ID**: proof-of-personhood using zero-knowledge proofs; used here to enforce "one real person, one scoring identity" and reduce Sybil abuse.
- **Chainlink CRE**: workflow execution layer that orchestrates token exchange, data fetch, scoring, and on-chain writes.

## End-to-End Flow

1. User connects wallet and verifies with World ID.
2. User completes Plaid Link authorization.
3. API creates Plaid link token and forwards workflow trigger payload.
4. CRE workflow exchanges `public_token`, fetches balances + transactions, computes score, and writes `scoreBps` on-chain.
5. Lending layer reads the on-chain score and applies a credit boost to effective borrowing power.

## Architecture

```text
Frontend (React)
  - Wallet connect
  - World ID verification
  - Plaid Link auth
  - Score + lending UI
        |
        v
API (Hono / Worker-compatible)
  - Plaid link token creation
  - Workflow trigger endpoints
  - Encrypted token storage
        |
        v
Chainlink CRE Workflow
  - Plaid token exchange
  - Plaid balances/transactions fetch
  - Rule score + AI calibration
  - On-chain score write
        |
        v
Contracts (Credit Oracle + Aave-based lending integration)
  - World ID-aware credit identity checks
  - Score storage (`scoreBps`)
  - Credit boost applied to lending parameters
```

## Credit Scoring Logic

Scoring is deterministic-first with bounded AI calibration:

`S_rule = 0.30*S_buf + 0.25*S_net + 0.20*S_inc + 0.15*S_spend + 0.10*S_risk`  
`S = clamp(S_rule + delta_ai, 0, 100), where delta_ai in [-10, 10]`

- `S_buf`: balance safety buffer
- `S_net`: net cashflow quality
- `S_inc`: income stability
- `S_spend`: spending discipline
- `S_risk`: risk event penalty (for example overdraft / NSF-like patterns)

Final on-chain value:

`scoreBps = S * 100`

Why AI adjustment is bounded:

- deterministic score remains the anchor for reproducibility
- AI handles edge cases without taking over the model
- `delta_ai` range is constrained to reduce drift and manipulation risk

## Why CRE Matters Here

CRE is the practical bridge between off-chain financial signals and on-chain risk logic:

- orchestrates multi-step external API workflow
- keeps scoring flow in one auditable execution pipeline
- writes final output back to contracts used by the lending path

This avoids building a heavy centralized backend for core scoring orchestration.

## Core Features

- World ID-based Sybil resistance gating
- Plaid sandbox integration for financial signals
- Hybrid rule + AI credit scoring
- On-chain score publication to oracle contract
- Credit-aware lending boost in an Aave-based flow

## Repository Map

- `packages/frontend` — dApp UI
- `packages/api` — link-token + trigger API
- `packages/workflow` — CRE credit scoring workflow
- `packages/worldid-workflow` — CRE workflow for World ID-related flow
- `packages/contracts` — contracts and deployment artifacts

## Run Guide

Setup and end-to-end execution steps are in:  
[INTEGRATION.md](./INTEGRATION.md)

