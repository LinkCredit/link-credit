# Week 1 Plan: Contracts (`packages/contracts/`)

> 目标：部署 CreditOracle + Fork Aave v3 到 Sepolia，端到端可借贷

---

## 1. 初始化 Foundry 项目

- [ ] `forge init --no-commit` 初始化 Foundry 结构
- [ ] `forge install aave-dao/aave-v3-origin` 作为 git submodule
- [ ] 配置 `foundry.toml`（solc 0.8.20+, optimizer, remappings）
- [ ] 配置 `remappings.txt` 确保 aave 依赖路径正确
- [ ] 验证 `forge build` 能编译 aave-v3-origin 原始代码

## 2. CreditOracle.sol

独立合约，不依赖 Aave，优先完成。

- [ ] `ICreditOracle.sol` — 接口：`getLtvBoost(address) → uint256`, `updateScore(address, uint256)`
- [ ] `CreditOracle.sol` — 实现：
  - `mapping(address => uint256) creditScores` (0-10000 bps)
  - `MAX_LTV_BOOST_BPS = 1500` (15%)
  - `updateScore()` — 仅 owner 或 creWorkflow 可调用
  - `getLtvBoost()` — 线性计算 `MAX_LTV_BOOST_BPS * score / 10000`
  - `setCreWorkflow(address)` — owner only
- [ ] `CreditOracle.t.sol` — 单元测试：
  - 权限控制（非授权地址不能 updateScore）
  - 分数边界（0, 5000, 10000）
  - boost 计算正确性

## 3. Fork Aave v3 — 注入 Credit Boost

从 `aave-v3-origin` 复制需要修改的文件到 `src/protocol/`，保持原始代码在 `lib/` 不动。

### 修改文件清单（详见 aave-fork.md）

| 文件 | 改动 |
|------|------|
| `DataTypes.sol` | `CalculateUserAccountDataParams` 加 `address creditOracle` |
| `GenericLogic.sol` | 核心 ~10 行 boost 逻辑 |
| `PoolStorage.sol` | 加 `_creditOracle` 存储变量 |
| `Pool.sol` | 加 `setCreditOracle()` setter + 构造 params 时传入 |
| `PoolLogic.sol` | 构造 params 时加 `creditOracle` 字段 |
| `ValidationLogic.sol` | 构造 params 时加 `creditOracle` 字段 |
| `LiquidationLogic.sol` | 构造 params 时加 `creditOracle` 字段 |
| `SupplyLogic.sol` | 间接通过 ValidationLogic |
| `BorrowLogic.sol` | 间接通过 ValidationLogic |
| `PoolInstance.sol` | 继承修改后的 Pool |

### 步骤

- [ ] 复制上述文件到 `src/protocol/`，调整 import 路径
- [ ] 在 `GenericLogic.calculateUserAccountData()` 中注入 boost 逻辑
- [ ] 确保 `forge build` 通过（重点关注 library linking 和 import 冲突）
- [ ] `CreditLending.t.sol` — 集成测试：
  - 部署完整 Aave 市场（用 `TestnetProcedures`）
  - 设置 CreditOracle + 接入 Pool
  - 验证：无信用分用户 LTV = base；有信用分用户 LTV = base + boost
  - 验证：boost 不超过 `liqThreshold - 100 bps`
  - 验证：实际 borrow 操作在 boosted LTV 下成功

## 4. 部署脚本

- [ ] `DeployCreditMarket.s.sol` — Forge script：
  - 部署 mock tokens（TestnetERC20: WETH, USDC）
  - 部署 mock price feeds（MockAggregator）
  - 用 `AaveV3BatchOrchestration` 部署完整市场
  - 部署 CreditOracle
  - 升级 Pool 实现为 CreditPoolInstance
  - `pool.setCreditOracle(creditOracle)`
  - 输出所有合约地址到 JSON（供前端和 workflow 使用）
- [ ] 在 Sepolia 上成功部署并验证

## 5. Demo 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| Base LTV | 50.00% (5000 bps) | 故意压低，让对比明显 |
| 清算阈值 | 75.00% (7500 bps) | |
| 最大 credit boost | 15.00% (1500 bps) | |
| Mock tokens | WETH ($2000), USDC ($1) | |

## Week 1 交付物

1. CreditOracle 合约 + 测试通过
2. Fork Aave v3 编译通过 + 集成测试通过
3. Sepolia 部署脚本可用
4. 合约地址 JSON 输出（供其他 package 使用）

## 依赖关系

- **无外部依赖**，可独立开发
- 输出：合约地址 JSON → 被 `workflow` 和 `frontend` 消费
