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
- wagmi 3.5 + viem 2.46 + ConnectKit 1.9
- TailwindCSS 4.1
- @tanstack/react-query 5.90
- react-plaid-link 4.1
- @worldcoin/idkit 4.0

## Main Components

- `src/components/Header.tsx` — Wallet connect + network selector
- `src/components/CreditScorePanel.tsx` — Plaid Link + credit score display
- `src/components/WorldIDVerification.tsx` — World ID v4 verification flow
- `src/components/LendingPanel.tsx` — Aave lending operations (Supply/Borrow/Withdraw/Repay)

## Custom Hooks

- `src/hooks/usePlaidLink.ts` — Plaid Link OAuth flow management
- `src/hooks/useCreditScore.ts` — Credit score reading + LTV boost calculation
- `src/hooks/useWorldIdVerification.ts` — World ID verification status
- `src/hooks/useLending.ts` — Aave pool interactions (250 lines)
- `src/hooks/useAccountData.ts` — User account summary (collateral, debt, health factor)
- `src/hooks/useReserveData.ts` — Reserve APY data
- `src/hooks/useUserReserveData.ts` — User positions per asset
- `src/hooks/useWalletBalances.ts` — Wallet token balances
- `src/hooks/useAllReserves.ts` — All reserves aggregation

## Current Status

✅ **Fully implemented and production-ready**

### Implemented Features

- ✅ Wallet integration (wagmi v3 + viem v2 + ConnectKit)
- ✅ Multi-chain support (Sepolia + Tenderly fork RPC)
- ✅ Plaid Link integration (OAuth flow with redirect handling)
- ✅ Credit score display (real-time on-chain reading from CreditOracle)
- ✅ LTV boost calculation (base LTV + credit boost)
- ✅ World ID v4 verification (QR code + device credential flow)
- ✅ Aave lending interface (Supply, Borrow, Withdraw, Repay)
- ✅ Multi-asset support (WETH, USDX, WBTC)
- ✅ Real-time account data (collateral, debt, health factor, available borrows)
- ✅ Transaction status tracking with hash display
- ✅ Token approval flow before supply/repay

### Smart Contract Integration

- ✅ CreditOracle — `creditScores()`, `getLtvBoost()`, `ScoreUpdated` event
- ✅ WorldIdRegistry — `isVerified()`, `getVerificationBoost()`, `VerificationUpdated` event
- ✅ Aave Pool — `supply()`, `borrow()`, `withdraw()`, `repay()`, `getUserAccountData()`
- ✅ ProtocolDataProvider — `getUserReserveData()`, `getAllReservesTokens()`
- ✅ ERC20 — `approve()`, `allowance()`, `balanceOf()`

## API Endpoints Consumed

- `POST /plaid/link-token` — Get Plaid Link token with OAuth redirect URI
- `POST /trigger-scoring` — Trigger CRE workflow for credit scoring (with wallet signature)
- `POST /trigger-worldid` — Trigger World ID verification workflow (with wallet signature)
- `POST /worldid/rp-signature` — Get RP context for World ID verification
