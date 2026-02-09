# Fork Aave v3：信用分驱动的动态 LTV

> 详细技术方案。概览见 [context.md](./context.md) 的"实现拆分"部分。

---

## 为什么 Fork Aave 而不是自己写借贷合约？

1. **评审印象**：Fork 真正的 Aave 协议 vs 写一个 150 行的玩具合约，说服力完全不同
2. **全链路打通**：修改 Aave 的 LTV 计算后，借贷验证、清算逻辑、前端显示全部自动适配
3. **改动极小**：核心只有 ~10 行，其余是机械的参数透传

## 选择 aave-v3-origin

| | aave-v3-core | aave-v3-origin |
|---|---|---|
| 维护状态 | 已归档 | 活跃（v3.6） |
| 构建工具 | Hardhat | **Foundry** ✓ |
| 测试基础设施 | Hardhat tests | Forge tests + `TestnetProcedures.sol` |
| 部署 | aave-v3-deploy (Hardhat) | Forge scripts (batched) |

选 **`aave-dao/aave-v3-origin`**，和我们的 Foundry 工具链一致。

---

## Aave v3 的 LTV 机制

### LTV 是什么？

LTV (Loan-to-Value) 决定用户能借多少。Aave 用 basis points (bps) 表示：

- LTV 82.50% = `8250` bps
- `PERCENTAGE_FACTOR = 1e4 = 10000`（即 100.00%）
- 抵押率 = 1 / LTV。LTV 50% → 需要 200% 抵押率

### 标准 Aave 中 LTV 是 per-reserve 的，不是 per-user 的

每种资产（ETH、WBTC、USDC）有自己的 LTV，通过 `ReserveConfiguration` 的 bitmap 存储。所有用户借同一种资产时 LTV 相同。**我们要做的就是打破这个限制——让 LTV 因用户信用分而异。**

### 调用链：从 borrow() 到 LTV 检查

```
Pool.borrow(asset, amount, ...)
  → BorrowLogic.executeBorrow()
    → ValidationLogic.validateBorrow()
      → GenericLogic.calculateUserAccountData()   ← 核心！
        │
        │  遍历用户所有 reserve：
        │  for each reserve:
        │    vars.ltv = ValidationLogic.getUserReserveLtv(reserve, eMode)
        │    ★ [我们在这里注入 credit boost] ★
        │    avgLtv += userBalance * vars.ltv   (加权平均)
        │
        │  最终：
        │  avgLtv = totalWeightedLtv / totalCollateral
        │  collateralNeeded = totalDebt / avgLtv
        │  require(collateral >= collateralNeeded)  ← 这就是抵押率检查
        │
        └→ 返回 (totalCollateral, totalDebt, avgLtv, avgLiqThreshold, healthFactor)
```

**关键洞察**：`GenericLogic.calculateUserAccountData()` 是唯一的 LTV 汇聚点。修改这一个函数，借贷验证、提款检查、清算逻辑、前端 `getUserAccountData()` 全部自动适配。

---

## 我们的修改方案

### 核心：在 GenericLogic 中注入 credit boost

在 `calculateUserAccountData()` 的循环中，每个 reserve 获取 LTV 之后：

```solidity
// 原有代码：获取 per-reserve LTV
vars.ltv = ValidationLogic.getUserReserveLtv(
    currentReserve, eModeCategories[params.userEModeCategory], params.userEModeCategory
);

// ★ 新增：信用分 boost ★
if (params.creditOracle != address(0) && vars.ltv != 0) {
    uint256 boost = ICreditOracle(params.creditOracle).getLtvBoost(params.user);
    uint256 liqThreshold = currentReserve.configuration.getLiquidationThreshold();
    uint256 boostedLtv = vars.ltv + boost;
    if (boostedLtv > liqThreshold - 100) {
        boostedLtv = liqThreshold - 100; // 保持 1% 安全边际，不能超过清算阈值
    }
    vars.ltv = boostedLtv;
}
```

就这 ~10 行。剩下的工作是把 `creditOracle` 地址透传到这个函数。

### 参数透传：需要改的文件

`creditOracle` 地址需要从 Pool 的 storage 一路传到 `calculateUserAccountData()` 的 params 里：

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `DataTypes.sol` | `CalculateUserAccountDataParams` 加一个 `address creditOracle` 字段 | 1 行 |
| `GenericLogic.sol` | 加入上面的 ~10 行 boost 逻辑 | 核心 |
| `PoolStorage.sol` | 加 `address internal _creditOracle` 存储变量 | 1 行 |
| `Pool.sol` | 加 `setCreditOracle(address)` setter；构造 params 时传入 `_creditOracle` | 几行 |
| `PoolLogic.sol` | 构造 params 时加 `creditOracle` 字段 | 1 行 |
| `ValidationLogic.sol` | 构造 params 时加 `creditOracle` 字段 | 1 行 |
| `LiquidationLogic.sol` | 构造 params 时加 `creditOracle` 字段 | 1 行 |
| `SupplyLogic.sol` | 间接通过 ValidationLogic | 1 行 |
| `BorrowLogic.sol` | 间接通过 ValidationLogic | 1 行 |
| `PoolInstance.sol` | 继承修改后的 Pool | 几行 |

**总计**：~10 行核心逻辑 + ~10 行参数透传 = ~20 行实质改动，分布在 10 个文件中。

### 项目结构

```
packages/contracts/
  foundry.toml
  remappings.txt
  lib/
    aave-v3-origin/          ← forge install（git submodule）
  src/
    ICreditOracle.sol        ← 我们的接口
    CreditOracle.sol         ← 我们的合约
    protocol/                ← 从 aave-v3-origin 复制 + 修改的文件
      libraries/
        types/DataTypes.sol
        logic/
          GenericLogic.sol   ← 核心修改
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

## CreditOracle 设计

```solidity
contract CreditOracle is ICreditOracle, Ownable {
    mapping(address => uint256) public creditScores;  // 0-10000 (bps, 即 0.00%-100.00%)
    address public creWorkflow;
    uint256 public constant MAX_LTV_BOOST_BPS = 1500; // 最大 boost 15%

    // CRE workflow 或 owner 可以更新分数
    function updateScore(address user, uint256 score) external {
        require(msg.sender == creWorkflow || msg.sender == owner());
        require(score <= 10000);
        creditScores[user] = score;
    }

    // 线性 boost: score 0 → 0, score 10000 → 1500 bps
    // 例: score 8000 (80/100) → 1500 * 8000 / 10000 = 1200 bps (12%)
    function getLtvBoost(address user) external view returns (uint256) {
        uint256 score = creditScores[user];
        if (score == 0) return 0;
        return (MAX_LTV_BOOST_BPS * score) / 10000;
    }
}
```

CRE workflow 发送的是 0-100 整数分数，上链前乘以 100 转为 bps。

---

## Demo 参数

故意压低 base LTV 让对比更戏剧化：

| 参数 | 值 | 说明 |
|------|-----|------|
| Base LTV | 50.00% (5000 bps) | "标准 DeFi 超额抵押" |
| 清算阈值 | 75.00% (7500 bps) | |
| 最大 credit boost | 15.00% (1500 bps) | |

| 用户信用分 | 有效 LTV | 抵押率 | 借 $1000 需要 |
|------------|----------|--------|--------------|
| 无分数 | 50% | 200% | $2000 |
| 60/100 | 59% | ~169% | $1694 |
| 80/100 | 62% | ~161% | $1613 |
| 100/100 | 65% | ~154% | $1538 |

Demo 故事线："没有信用分，借 $1000 要锁 $2000。有了 AI 信用评分，只需要 $1538。省了 $462。"

---

## 部署策略（Sepolia）

1. `forge install aave-dao/aave-v3-origin` 作为依赖
2. 复制需要修改的文件到 `src/protocol/`，修改 import 路径
3. 部署 CreditOracle
4. 用 aave-v3-origin 的 `AaveV3BatchOrchestration` 部署完整市场（含 mock tokens + price feeds）
5. 升级 Pool 实现为我们的 CreditPoolInstance
6. `pool.setCreditOracle(creditOracleAddress)` 接入信用预言机
7. `creditOracle.setCreWorkflow(creWorkflowAddress)` 授权 CRE workflow 写入

Mock tokens 用 aave-v3-origin 自带的 `TestnetERC20` + `MockAggregator`，自包含不依赖外部基础设施。

---

## 风险与应对

| 风险 | 可能性 | 应对 |
|------|--------|------|
| Library linking 问题（GenericLogic 是 library，编译时链接） | 中 | 用 `FOUNDRY_LIBRARIES` 环境变量，或重构 import 让修改文件自包含 |
| Import 路径冲突 | 中 | 仔细配置 `remappings.txt`，早期验证 `forge build` |
| Credit boost 导致意外清算 | 中 | boost 后的 LTV 严格 cap 在 `liqThreshold - 100 bps` |
| 部署 gas 超限 | 低 | 用 batched deployment pattern |
