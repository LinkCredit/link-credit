# Link Credit

Link Credit is a hackathon project for **Chainlink CRE**:  
https://chain.link/hackathon

It brings real-world cashflow signals into DeFi lending, so borrowers are not treated as anonymous wallets with identical risk.

## Demo

YouTube walkthrough (to be added):  
`<PASTE_YOUTUBE_DEMO_LINK_HERE>`

## Why This Exists

Most on-chain lending uses one-size-fits-all collateral rules.  
That is safe for protocols, but unfair and inefficient for users with strong off-chain repayment behavior.

Link Credit solves this by combining:

- **World ID** for Sybil resistance (one human, one scoring identity)
- **Plaid** for permissioned bank cashflow data
- **AI + rule-based scoring** for a bounded, explainable credit signal
- **Chainlink CRE** to run the scoring workflow and push results on-chain

## What It Does

1. User verifies with **World ID**.
2. User links bank data via **Plaid Link**.
3. Workflow fetches balances + transactions, computes a base score, then applies bounded AI calibration.
4. Final score is written on-chain as `scoreBps`.
5. Lending logic reads that score and applies a **credit boost** to borrowing terms.

## Architecture (Judge-Friendly View)

```text
Frontend (React)
  - Wallet connect
  - World ID verification
  - Plaid Link auth
  - Lending UI / score UI
        |
        v
API (Hono / Worker-compatible)
  - Create Plaid link token
  - Trigger workflows
  - Store encrypted access tokens (KV/in-memory fallback)
        |
        v
Chainlink CRE Workflows
  - Exchange public_token -> access_token
  - Fetch Plaid balances + transactions
  - Run deterministic score + AI adjustment
  - Write score to CreditOracle on Sepolia
        |
        v
Contracts (Aave-based lending + oracle adapters)
  - Read score / boost
  - Adjust effective borrowing capacity
```

## Role of Chainlink CRE

CRE is the execution layer that makes this flow practical for a hackathon-grade production design:

- Orchestrates multi-step off-chain credit computation
- Handles deterministic workflow logic + external API calls
- Bridges computed outputs back on-chain in a verifiable flow

In short: CRE lets us connect Web2 financial signals to Web3 risk logic without building a heavy custom backend.

## Core Features

- **World ID gating** before scoring
- **Plaid integration** for sandbox bank data
- **Hybrid scoring**:
  - deterministic rule score (stable baseline)
  - bounded AI delta (controlled adjustment, not unconstrained model output)
- **On-chain score publishing** to `CreditOracle`
- **Dynamic lending boost** integrated with protocol-side risk params

## Project Structure

- `packages/frontend`: dApp UI (wallet, World ID, Plaid, lending panels)
- `packages/api`: link-token + workflow trigger API
- `packages/workflow`: CRE credit scoring workflow
- `packages/worldid-workflow`: CRE workflow for World ID-related on-chain flow
- `packages/contracts`: lending + oracle contracts and deployment artifacts

## Run Guide

For setup and end-to-end execution, see:  
[INTEGRATION.md](./INTEGRATION.md)

