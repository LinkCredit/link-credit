# Fork Aave v3: Credit Score-Driven Dynamic LTV

> Detailed technical design. For overview, see "Implementation Breakdown" section in [context.md](./context.md).

---

## Why Fork Aave Instead of Writing Our Own Lending Contract?

1. **Reviewer Impact**: Forking the real Aave protocol vs. writing a 150-line toy contract carries vastly different credibility
2. **Full Stack Integration**: After modifying Aave's LTV calculation, borrowing validation, liquidation logic, and frontend display all adapt automatically
3. **Minimal Changes**: Core logic is only ~10 lines; the rest is mechanical parameter passing

## Why aave-v3-origin?

| | aave-v3-core | aave-v3-origin |
|---|---|---|
| Maintenance | Archived | Active (v3.6) |
| Build Tool | Hardhat | **Foundry** ✓ |
| Test Infrastructure | Hardhat tests | Forge tests + `TestnetProcedures.sol` |
| Deployment | aave-v3-deploy (Hardhat) | Forge scripts (batched) |

We choose **`aave-dao/aave-v3-origin`** to align with our Foundry toolchain.

---

## Aave v3 LTV Mechanism

### What is LTV?

LTV (Loan-to-Value) determines how much a user can borrow. Aave uses basis points (bps):

- LTV 82.50% = `8250` bps
- `PERCENTAGE_FACTOR = 1e4 = 10000` (i.e., 100.00%)
- Collateral ratio = 1 / LTV. LTV 50% → requires 200% collateral ratio

### In Standard Aave, LTV is per-reserve, not per-user

Each asset (ETH, WBTC, USDC) has its own LTV, stored via `ReserveConfiguration` bitmap. All users borrowing the same asset share the same LTV. **What we're doing is breaking this limit—making LTV vary by user credit score.**

### Call Chain: From borrow() to LTV Check

```
Pool.borrow(asset, amount, ...)
  → BorrowLogic.executeBorrow()
    → ValidationLogic.validateBorrow()
      → GenericLogic.calculateUserAccountData()   ← Core!
        │
        │  Iterate through all user reserves:
        │  for each reserve:
        │    vars.ltv = ValidationLogic.getUserReserveLtv(reserve, eMode)
        │    ★ [We inject credit boost here] ★
        │    avgLtv += userBalance * vars.ltv   (weighted average)
        │
        │  Finally:
        │  avgLtv = totalWeightedLtv / totalCollateral
        │  collateralNeeded = totalDebt / avgLtv
        │  require(collateral >= collateralNeeded)  ← This is the collateral check
        │
        └→ Return (totalCollateral, totalDebt, avgLtv, avgLiqThreshold, healthFactor)
```

**Key Insight**: `GenericLogic.calculateUserAccountData()` is the only LTV convergence point. Modifying this single function automatically adapts borrowing validation, withdrawal checks, liquidation logic, and frontend `getUserAccountData()`.

---

## Our Modification Approach

### Core: Inject Credit Boost in GenericLogic

In the `calculateUserAccountData()` loop, after each reserve gets its LTV:

```solidity
// Original code: fetch per-reserve LTV
vars.ltv = ValidationLogic.getUserReserveLtv(
    currentReserve, eModeCategories[params.userEModeCategory], params.userEModeCategory
);

// ★ New: credit score boost ★
if (params.creditOracle != address(0) && vars.ltv != 0) {
    uint256 boost = ICreditOracle(params.creditOracle).getLtvBoost(params.user);
    uint256 liqThreshold = currentReserve.configuration.getLiquidationThreshold();
    uint256 boostedLtv = vars.ltv + boost;
    if (boostedLtv > liqThreshold - 100) {
        boostedLtv = liqThreshold - 100; // Maintain 1% safety margin, cannot exceed liquidation threshold
    }
    vars.ltv = boostedLtv;
}
```

Just ~10 lines. The rest is mechanical parameter passing of the `creditOracle` address to this function.

### Parameter Passing: Files to Modify

`creditOracle` address must be passed from Pool storage through to the params in `calculateUserAccountData()`:

| File | Change | Complexity |
|------|--------|-----------|
| `DataTypes.sol` | Add `address creditOracle` field to `CalculateUserAccountDataParams` | 1 line |
| `GenericLogic.sol` | Add ~10 lines of boost logic above | Core |
| `PoolStorage.sol` | Add `address internal _creditOracle` storage variable | 1 line |
| `Pool.sol` | Add `setCreditOracle(address)` setter; pass `_creditOracle` when constructing params | Few lines |
| `PoolLogic.sol` | Add `creditOracle` field when constructing params | 1 line |
| `ValidationLogic.sol` | Add `creditOracle` field when constructing params | 1 line |
| `LiquidationLogic.sol` | Add `creditOracle` field when constructing params | 1 line |
| `SupplyLogic.sol` | Indirect via ValidationLogic | 1 line |
| `BorrowLogic.sol` | Indirect via ValidationLogic | 1 line |
| `PoolInstance.sol` | Inherit modified Pool | Few lines |

**Total**: ~10 lines of core logic + ~10 lines of parameter passing = ~20 lines of substantive changes across 10 files.

### Project Structure

```
packages/contracts/
  foundry.toml
  remappings.txt
  lib/
    aave-v3-origin/          ← forge install (git submodule)
  src/
    ICreditOracle.sol        ← Our interface
    CreditOracle.sol         ← Our contract
    protocol/                ← Copied + modified files from aave-v3-origin
      libraries/
        types/DataTypes.sol
        logic/
          GenericLogic.sol   ← Core modification
          PoolLogic.sol
          ValidationLogic.sol
          LiquidationLogic.sol
          SupplyLogic.sol
          BorrowLogic.sol
      pool/
        Pool.sol
        PoolStorage.sol
    instances/
      PoolInstance.sol
  script/
    DeployCreditMarket.s.sol
  test/
    CreditOracle.t.sol
    CreditLending.t.sol
```

---

## CreditOracle Design

```solidity
contract CreditOracle is ICreditOracle, Ownable {
    mapping(address => uint256) public creditScores;  // 0-10000 (bps, i.e., 0.00%-100.00%)
    address public creWorkflow;
    uint256 public constant MAX_LTV_BOOST_BPS = 1500; // Maximum boost 15%

    // CRE workflow or owner can update scores
    function updateScore(address user, uint256 score) external {
        require(msg.sender == creWorkflow || msg.sender == owner());
        require(score <= 10000);
        creditScores[user] = score;
    }

    // Linear boost: score 0 → 0, score 10000 → 1500 bps
    // Example: score 8000 (80/100) → 1500 * 8000 / 10000 = 1200 bps (12%)
    function getLtvBoost(address user) external view returns (uint256) {
        uint256 score = creditScores[user];
        if (score == 0) return 0;
        return (MAX_LTV_BOOST_BPS * score) / 10000;
    }
}
```

CRE workflow sends 0-100 integer scores, which are multiplied by 100 to convert to bps before writing on-chain.

---

## Demo Parameters

Intentionally lower base LTV to make the comparison more dramatic:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Base LTV | 50.00% (5000 bps) | "Standard DeFi over-collateralization" |
| Liquidation Threshold | 75.00% (7500 bps) | |
| Max credit boost | 15.00% (1500 bps) | |

| User Credit Score | Effective LTV | Collateral Ratio | Needed to Borrow $1000 |
|-------------------|---------------|-----------------|------------------------|
| No score | 50% | 200% | $2000 |
| 60/100 | 59% | ~169% | $1694 |
| 80/100 | 62% | ~161% | $1613 |
| 100/100 | 65% | ~154% | $1538 |

Demo narrative: "Without a credit score, borrowing $1000 requires locking $2000. With AI credit scoring, you only need $1538. Saved $462."

---

## Deployment Strategy (Sepolia)

1. `forge install aave-dao/aave-v3-origin` as a dependency
2. Copy files that need modification to `src/protocol/`, update import paths
3. Deploy CreditOracle
4. Use aave-v3-origin's `AaveV3BatchOrchestration` to deploy the complete market (mock tokens + price feeds)
5. Upgrade Pool implementation to our CreditPoolInstance
6. `pool.setCreditOracle(creditOracleAddress)` to connect the credit oracle
7. `creditOracle.setCreWorkflow(creWorkflowAddress)` to authorize CRE workflow writes

Mock tokens use aave-v3-origin's built-in `TestnetERC20` + `MockAggregator`, self-contained with no external infrastructure dependencies.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Library linking issues (GenericLogic is a library, linked at compile time) | Medium | Use `FOUNDRY_LIBRARIES` environment variable, or refactor imports to make modified files self-contained |
| Import path conflicts | Medium | Carefully configure `remappings.txt`, validate `forge build` early |
| Credit boost causes unexpected liquidation | Medium | Ensure boosted LTV is strictly capped at `liqThreshold - 100 bps` |
| Deployment gas limit exceeded | Low | Use batched deployment pattern |
