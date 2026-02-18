# @link-credit/contracts

Solidity contracts for Link Credit — AI-powered privacy credit scoring for DeFi lending.

## Contracts

- `CreditOracle.sol` — stores per-user credit scores (0–10000 bps), computes LTV boost (max +1500 bps). Only the CRE workflow address or owner can write scores.
- `ICreditOracle.sol` — interface for CreditOracle.
- `ICreditPool.sol` — interface for the credit-aware pool (setCreditOracle / getCreditOracle).
- `instances/CreditPoolInstance.sol` — Aave v3 Pool instance with credit boost wired in.
- `protocol/libraries/logic/GenericLogic.sol` — forked from Aave v3, modified to apply LTV boost from CreditOracle during `calculateUserAccountData`.

## Build & Test

```bash
# from packages/contracts/
forge build
forge test
```

## Deploy (Sepolia)

```bash
forge script script/DeployCreditMarket.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Writes deployed addresses to `out/deployed-addresses.json`.
