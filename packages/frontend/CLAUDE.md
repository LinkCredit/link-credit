# CLAUDE.md — @link-credit/frontend

React DApp for wallet connection, Plaid Link bank authorization, credit score display, and Aave borrowing.

## Commands

```bash
bun run dev          # Vite dev server
bun run build        # Production build
bun test             # Run tests
```

## Stack

- React 19 + TypeScript + Vite 6
- No wallet library installed yet (planned: wagmi + viem)
- No CSS framework installed yet (planned: TailwindCSS)

## Source Files

- `src/App.tsx` — Minimal scaffold (title + description only)
- `src/App.test.jsx` — Basic render test

## Current Status

Scaffold only. Planned features:

- Wallet connect (wagmi/viem)
- Plaid Link React SDK integration
- World ID verification
- Credit score display (read from CreditOracle)
- Aave borrow interface
- API integration with `@link-credit/api` endpoints

## API Endpoints Consumed

- `POST /link-token` — Get Plaid Link token
- `POST /trigger-scoring` — Trigger credit scoring (requires wallet signature)
