# CLAUDE.md — @link-credit/contracts

Solidity contracts for on-chain credit scoring and DeFi lending integration.

## Commands

```bash
forge build          # Compile contracts
forge test           # Run tests

# Deploy with Chainlink price feeds
forge script script/DeployCreditMarket.s.sol:DeployCreditMarket \
  --rpc-url sepolia \
  --broadcast

# Update price feeds on existing deployment
forge script script/SetChainlinkPriceFeeds.s.sol:SetChainlinkPriceFeeds \
  --rpc-url sepolia \
  --broadcast

# Verify Chainlink feeds before deployment
forge test --fork-url $SEPOLIA_RPC_URL --match-contract VerifyChainlinkFeeds -vv
```

## Stack

- Solidity + Foundry (forge)
- Target: Sepolia testnet
- Price Feeds: Chainlink (ETH/USD, BTC/USD) + Mock (USDX)

## Price Feeds

### Chainlink Sepolia Feeds (Production)
- **WETH**: Chainlink ETH/USD (`0x694AA1769357215DE4FAC081bf1f309aDC325306`)
- **WBTC**: Chainlink BTC/USD (`0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`)
- **USDX**: Mock at $1.00 (test stablecoin)

### Deployment Options
1. **方案 1**: `DeployCreditMarket.s.sol` - 部署时自动配置 Chainlink feeds
2. **方案 2**: `SetChainlinkPriceFeeds.s.sol` - 独立脚本，可随时切换 price feeds

### Decimals Compatibility
- Chainlink feeds: 8 decimals
- MockAggregator: 8 decimals
- AaveOracle 动态调用 `decimals()` 方法，自动处理不同 decimals

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
