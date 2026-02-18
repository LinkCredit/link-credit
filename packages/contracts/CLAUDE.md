# CLAUDE.md — @link-credit/contracts

Solidity contracts for on-chain credit scoring and DeFi lending integration.

## Commands

```bash
forge build          # Compile contracts
forge test           # Run tests
```

## Stack

- Solidity + Foundry (forge)
- Target: Sepolia testnet

## Current Status

Not started — no Solidity files exist yet.

## Planned Contracts

### CreditOracle.sol
- Stores per-user credit scores (0–10000 BPS)
- `updateScore(address user, uint256 scoreBps)` — only callable by CRE workflow address
- `getScore(address user)` → score + timestamp
- Computes LTV boost based on credit score

### Aave v3 Fork
- Fork `aave-dao/aave-v3-origin` (v3.6, Foundry-native)
- Modify `GenericLogic.calculateUserAccountData()` to read credit boost from CreditOracle
- ~10 lines core change to apply LTV boost
- See `aave-fork.md` in project root for detailed architecture

## Dependencies

- CRE workflow address (for oracle write permissions)
