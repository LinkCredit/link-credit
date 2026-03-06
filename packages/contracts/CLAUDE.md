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

✅ **Fully implemented, tested, and deployed to Sepolia**

## Implemented Contracts

### CreditOracle.sol
- Stores per-user credit scores (0–10,000 BPS)
- `updateScore(address user, uint256 scoreBps)` — callable by CRE forwarder
- `onReport(bytes calldata data)` — Chainlink CRE callback (IReceiver interface)
- `creditScores(address user)` → score + timestamp
- `getLtvBoost(address user)` → linear LTV boost (max 1,500 BPS)
- World ID integration for additional verification boost (+1,000 BPS)
- Events: `ScoreUpdated`, `ForwarderUpdated`

### WorldIDRegistry.sol
- Stores World ID verification status per user
- `onReport(bytes calldata data)` — Chainlink CRE callback for verification
- `isVerified(address user)` → verification status
- `getVerificationBoost(address user)` → +1,000 BPS if verified
- Nullifier hash tracking to prevent reuse
- Events: `VerificationUpdated`, `ForwarderUpdated`

### Aave v3 Fork
- Forked `aave-dao/aave-v3-origin` (v3.6, Foundry-native)
- Modified `GenericLogic.calculateUserAccountData()` to read credit boost from CreditOracle (lines 130-139)
- 8 files modified for parameter passing (DataTypes, Pool, PoolStorage, ValidationLogic, etc.)
- ~10 lines core logic to apply LTV boost
- Safety margin: boosted LTV capped at liquidation threshold - 100 BPS
- See `aave-fork.md` in project root for detailed architecture

## Deployment

**Network**: Sepolia testnet

**Deployed Addresses** (from `deployed-addresses.json`):
- CreditOracle: `0x0B955e39E469E4B70940e5642bd82665EC3296Ca`
- WorldIDRegistry: `0xB3A16439983b766b3Ef11CD1De615B4cA53d6f5C`
- Pool (Proxy): `0xB55B1E49fDf5F98c93E0312085ff44A528D71BdF`
- PoolConfigurator (Proxy): `0x144f287c0C8E24b370794cb662646a4516B801CD`
- ProtocolDataProvider: `0x5F0117970A5Ac62F28c41e3B421DB0E018418BFD`
- AaveOracle: `0xfA85F8dFe18098618fB0094B26b3687d45b5be4f`
- WETH: `0x4E88674FA8c3a66dcf79d2453159B09c5749B098`
- WBTC: `0x9957A5C0a30CB4F71f6260CA61c03AB20fD5FC7F`
- USDX: `0x3e7F0347b2F43C745032B6b5141718698a3D0128`

## Test Coverage

✅ **17 tests, all passing**

- `test/CreditOracle.t.sol` — 8 tests (owner/forwarder access, score boundaries, World ID boost)
- `test/CreditLending.t.sol` — 3 tests (LTV boost tracking, liquidation threshold cap, borrow validation)
- `test/WorldIDRegistry.t.sol` — 3 tests (forwarder authorization, verification storage, nullifier reuse prevention)
- `test/VerifyChainlinkFeeds.t.sol` — 3 tests (ETH/USD and BTC/USD feed validation)

Run tests:
```bash
forge test -vv
```

## Configuration

**Market Parameters** (CreditMarketListing.sol):
- Base LTV: 50% (5,000 BPS) — intentionally low for demo impact
- Liquidation Threshold: 76% (7,600 BPS)
- Max credit boost: 15% (1,500 BPS)
- World ID boost: 10% (1,000 BPS)

**CRE Integration**:
- Forwarder: `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` (Chainlink DON forwarder)
- Workflow validation temporarily disabled (CreditOracle.sol:42-47) — will be re-enabled after workflow registration
