# AI 隐私信用评分 → 低抵押率 DeFi 借贷

> Hackathon: <https://chain.link/hackathon>
>
> 赛道: **Privacy** + **DeFi & Tokenization**（可同时竞争两个赛道 + Grand Prize）

---

## 痛点有多痛？

DeFi 借贷的最大瓶颈至今未解：**超额抵押**。Aave/Compound 要求 150%+ 抵押率，这意味着你要借 $100 得锁 $150+。这不是"借贷"，这是"质押换流动性"。真实世界的信贷是基于信用的，但 DeFi 完全无法访问链下信用数据——因为隐私。

## 为什么现在是最佳时机？

CRE 的 **Confidential HTTP**（2月14日上线）恰好解决这个鸡和蛋的问题：你可以在 CRE workflow 里调用链下信用评估 API（银行余额、信用记录、收入验证），API 凭证和响应数据都保持机密，仅向链上合约返回一个"信用等级"或"是否达标"的布尔值。用户隐私不泄露，但 DeFi 协议获得了信用信号。

## MVP 切法（小而精）

不要从零写借贷协议。做三件事：1) **信用评分预言机**——一个 CRE workflow，前端通过 Plaid Link 授权银行数据后，CRE 在 TEE 环境中完成 token 交换、通过 Confidential HTTP 获取银行数据、AI 评分，将分数上链。唯一的"后端"是一个 Cloudflare Worker，仅用于创建 Plaid Link token（CRE 没有 HTTP response 机制）。2) **Fork Aave v3**——在 Aave 的核心 LTV 计算中注入信用分 boost（~10 行改动），让高信用分用户以更低抵押率借贷。不是玩具合约，是真正的 Aave 协议在读取你的信用分。3) **World ID 防女巫**——CreditOracle 合约内置链上 ZKP 验证（调用 World ID Router），用零知识证明确保一人一分，防止多钱包刷分攻击。

## 为什么评审会喜欢？

- 用了 CRE 最新的 Confidential HTTP 功能（评审看到你用新功能会加分）
- AI 是关键环节（信用评估）而不是噱头
- World ID 链上 ZKP 验证防女巫——零知识证明 + DeFi 信用，隐私赛道叙事完美
- 解决的是 DeFi 公认的最大结构性痛点
- 与 Chainlink 的机构化叙事（Aave Horizon、Swift）完美吻合
- 往届 Grand Prize 项目 YieldCoin 也是解决 DeFi 实际痛点的实用工具

## 风险与对策

Plaid API 可能在 hackathon 环境下难搭。**对策**：用 mock API 模拟银行数据，重点展示 CRE Confidential HTTP 的端到端 flow + AI 评分逻辑。评审看的是架构和潜力。

---

## 实现拆分

### 整体架构（三层蛋糕）

```
┌─────────────────────────────────────────────────┐
│  Layer 3: 前端 DApp（React）                      │
│  连钱包 → World ID 验证 → Plaid Link 授权 →      │
│  查看信用分 → 借贷                                │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 2.5: Serverless Function（Cloudflare Worker）  │
│  仅创建 Plaid Link token（~10 行代码）             │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 2: CRE Workflow（TypeScript, 核心）        │
│  Token 交换 → Confidential HTTP 拉银行数据 →      │
│  AI 评分 → 将评分 + World ID proof 上链            │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 1: Solidity 合约（Sepolia testnet）        │
│  CreditOracle.sol ← 链上 ZKP 验证（World ID      │
│    Router）+ 存储信用分 + 计算 LTV boost          │
│  Fork Aave v3 ← 修改 GenericLogic，注入信用分     │
│  → 用户信用分越高，借贷所需抵押率越低               │
└─────────────────────────────────────────────────┘
```

### CRE Workflow 具体能做什么

CRE SDK 给你的核心能力是：**HTTPClient**（发 HTTP 请求，含 Confidential 模式）+ **EVMClient**（读写链上合约）+ **CronTrigger / 链上事件 Trigger**。Workflow 编译成 WASM 在 DON 节点上执行，每个节点独立跑一遍，通过 BFT 共识出最终结果。

**关键约束**：workflow callback 是无状态的，每次触发从零开始。QuickJS 引擎不是完整 Node.js，不能用 `node:crypto` 等内置模块。但可以调任何 HTTP API，所以 AI 推理可以完全外包给外部服务。

---

## 具体实现步骤

### 第一周（2/6-2/13）：全链路跑通

用普通 HTTPClient 把整个 flow 跑通（Confidential HTTP 还没上线）。CRE Workflow 直接调 Plaid + OpenAI，不经过后端：

```
CRE Workflow (4/5 HTTP 请求):
  [1] Plaid /item/public_token/exchange → access_token
  [2] Plaid /accounts/balance/get → 余额
  [3] Plaid /transactions/get → 交易记录
  ──  本地聚合 → FinancialProfile + 规则评分（非 HTTP，不占配额）
  [4] OpenAI API → AI 信用评分
  ──  加权合并（规则评分 + AI 评分）→ 最终分数 (consensusMedianAggregation)
  └─ EVMClient → CreditOracle.updateScore(walletAddress, score)
```

架构决策：**评估逻辑全部在 CRE Workflow 中执行**，不需要中心化后端。

1. **Serverless Function**（Cloudflare Worker）：仅创建 Plaid Link token（~10 行代码）
2. **CRE Workflow 完整流程**：前端 Plaid Link 授权完成后，传入 `public_token` 触发 CRE Workflow → token 交换 → 拉银行数据 → AI 评分 → 写链上
3. **前端 DApp**：连钱包 → World ID 验证 → Plaid Link 授权 → 触发 CRE → 监听链上 `ScoreUpdated` 事件 → 显示分数和优惠抵押率 → 借贷

#### Solidity 合约（第一周同步写）

**借贷层：Fork Aave v3**（详见 [aave-fork.md](./aave-fork.md)）

不写玩具合约，直接 fork `aave-dao/aave-v3-origin`（Foundry 原生，v3.6），在 Aave 的核心 LTV 计算函数里注入信用分 boost。改动量极小（~10 行核心逻辑 + 参数透传），但效果是：信用分直接影响 Aave 协议的借贷能力计算、清算逻辑、前端显示——全链路打通。

**CreditOracle.sol**（我们自己的合约，基础版本；第三周增加 World ID ZKP 验证，详见下方）：

```solidity
// CreditOracle.sol — 信用分存储 + LTV boost 计算
contract CreditOracle {
    mapping(address => uint256) public creditScores;  // 0-10000 (bps)
    address public creWorkflow;  // 只有 CRE workflow 能写入
    uint256 public constant MAX_LTV_BOOST_BPS = 1500; // 最大 boost 15%

    function updateScore(address user, uint256 score) external {
        require(msg.sender == creWorkflow || msg.sender == owner());
        creditScores[user] = score;
    }

    // 线性 boost: score 8000 (80/100) → boost = 1500 * 8000 / 10000 = 1200 bps (12%)
    function getLtvBoost(address user) external view returns (uint256) {
        uint256 score = creditScores[user];
        if (score == 0) return 0;
        return (MAX_LTV_BOOST_BPS * score) / 10000;
    }
}
```

**Aave 修改核心**（在 `GenericLogic.calculateUserAccountData()` 中）：

```solidity
// 在原有 LTV 获取之后，加入信用分 boost
if (params.creditOracle != address(0) && vars.ltv != 0) {
    uint256 boost = ICreditOracle(params.creditOracle).getLtvBoost(params.user);
    uint256 liqThreshold = currentReserve.configuration.getLiquidationThreshold();
    uint256 boostedLtv = vars.ltv + boost;
    if (boostedLtv > liqThreshold - 100) {
        boostedLtv = liqThreshold - 100; // 1% 安全边际
    }
    vars.ltv = boostedLtv;
}
```

**Demo 参数**（故意压低 base LTV 让对比更明显）：
- Base LTV: 50%（无信用分的标准 DeFi 超额抵押）
- 清算阈值: 75%
- 最大信用 boost: 15%
- 信用分 80/100 的用户: 有效 LTV = 62% → 抵押率 ~161%（vs 无分数的 200%）
- 信用分 100/100 的用户: 有效 LTV = 65% → 抵押率 ~154%

### 第二周（2/14 起）：切换到 Confidential HTTP

2月14日 Confidential HTTP 开放 early access。改动仅是把 `HTTPClient` 替换为 `ConfidentialHTTPClient`，credentials 存 Vault DON，核心逻辑不变。

### 第三周：World ID 防女巫 + World Mini App

核心流程和 Confidential HTTP 完成后，增加 World ID 链上 ZKP 验证层。详细技术方案见下方「World ID + World Mini App 集成方案」章节。

主要工作：
1. Developer Portal 注册 app，获取 `app_id`，创建 `credit-score` action
2. CreditOracle 合约集成 World ID Router（`verifyProof` + nullifier 映射）
3. 前端增加 World ID 验证组件（双模式：IDKit + MiniKit）
4. CRE Workflow 透传 proof 数据到合约调用
5. Mini App 模式测试（ngrok 隧道 + World App 扫码）

---

## 能做到的最终 Demo 效果

五分钟视频里你能展示的完整故事线：

1. **开场**（30秒）：展示 DeFi 借贷的痛点——"用户想借 $1000，需要锁 $2000，这不是信贷，是典当"
2. **用户流程演示**（90秒）：连钱包 → World ID 验证（Orb 扫描/Simulator 模拟）→ Plaid Link 授权银行 → CRE workflow 执行（展示 CLI simulation 输出日志，清晰可见每一步：token 交换、Confidential HTTP 拉银行数据、AI 评分、链上写入 + ZKP 验证） → 前端监听链上事件，实时刷新信用分（比如 82/100） → 显示 "你的个性化抵押率：161%"（而不是默认的 200%）
3. **借贷演示**（60秒）：在 Fork 的 Aave v3 上操作——存入 $1610 collateral → 成功借出 $1000 → 对比没有信用分的用户需要存 $2000。这不是玩具合约，是真正的 Aave 协议在读取信用分
4. **技术亮点**（60秒）：展示 Confidential HTTP 如何保护银行数据——"原始金融数据从未离开 TEE，链上只记录了评分结果"。World ID 链上 ZKP 验证——"零知识证明确保一人一分，防止多钱包刷分，验证过程不泄露任何身份信息"。展示 Aave GenericLogic 的修改——仅 10 行代码就让整个协议支持信用评分。AI 评分经过 DON 多节点共识取中位数，防止单点操纵
5. **未来展望**（30秒）：接入真实的 Plaid/银行 open banking API → 多协议复用同一个 credit oracle → 构建链上信用历史

---

## 风险点与 Plan B

**最大风险**：Confidential HTTP 在 2/14 开放 early access，但文档和 API 可能不稳定，或需要申请 early access 排队。

**Plan B**：即使 Confidential HTTP 用不上，你仍然可以用普通 HTTPClient + CRE Secrets 管理（存 API key）来构建。在视频演示中说明 "this workflow is designed for Confidential HTTP, currently running in simulation mode with standard HTTP, and will migrate to Confidential HTTP once GA" ——评审理解这是 early access 的限制，你的架构设计已经到位了，这就够了。往届获奖项目很多也只是模拟/testnet 级别。

---

## World ID + World Mini App 集成方案

### 为什么需要 World ID？

信用评分系统最大的漏洞是**女巫攻击**：一个人创建多个钱包，每个钱包都获取一个信用分，然后用多个"高信用"身份同时借贷。World ID 提供零知识证明的**人格证明（proof-of-personhood）**——证明用户是唯一真人，不泄露身份信息。每个真人对应一个唯一的 `nullifier_hash`（per app + per action），写入合约后即可在链上强制执行"一人一分"。

此外，World ID 的验证等级本身就是一个**信任信号**，可以作为 AI 信用评分的输入因子。

### 集成方式：门槛 + AI 评分因子（组合方案）

**1) 门槛（防女巫）**：用户必须先通过 World ID 验证，才能触发 Plaid Link 授权和信用评分流程。`nullifier_hash` 随信用分一起写入 CreditOracle 合约，合约层强制一个 nullifier 只能绑定一个钱包地址。

**2) AI 评分因子**：Orb 验证（虹膜生物识别）本身就是最高信任等级，AI 在评分时可以给予更高的信任权重。这不是简单的加分，而是让 AI 在评估银行数据时，将身份验证强度作为风险因子之一。

### 验证等级

链上 ZKP 验证仅支持 **Orb 等级**（虹膜生物识别，唯一性最强）。Hackathon demo 使用 Worldcoin Simulator 模拟 Orb 验证即可。

### 架构决策：链上 ZKP 验证（非 Cloud API）

选择链上 ZKP 验证而非 Cloud API 验证：
- **不增加后端复杂度**：验证逻辑在 CreditOracle 合约中，合约调用 World ID Router 的 `verifyProof()`，无需后端新增 endpoint
- **节省 CRE HTTP 预算**：验证在链上完成，不占用 CRE 的 5 次 HTTP 请求配额（当前 4/5：Plaid×3 + OpenAI×1）
- **完全去信任化**：ZKP 验证在链上执行，不依赖 Worldcoin Cloud API，与"隐私 + DeFi"赛道叙事一致
- **原子性**：验证 + 写入分数在同一笔交易中完成，不存在验证通过但写入失败的中间状态
- **Hackathon 加分**：链上 ZKP 比 Cloud API 调用更有技术含量

### 合约改动

CreditOracle 增加 World ID Router 集成 + nullifier 防女巫：

```solidity
import { IWorldID } from "@worldcoin/world-id-contracts/interfaces/IWorldID.sol";

// 新增状态变量
IWorldID public worldId;                    // Sepolia Router: 0x469449f251692e0779667583026b5a1e99512157
uint256 public externalNullifierHash;       // hash(hash(app_id), action)
mapping(uint256 => bool) public usedNullifiers;  // 防重复验证

// updateScore 签名变更：增加 ZKP proof 参数
function updateScore(
    address user, uint256 score,
    uint256 root, uint256 nullifierHash, uint256[8] calldata proof
) external {
    require(!usedNullifiers[nullifierHash], "already verified");
    // 链上验证 ZKP — 失败会 revert
    worldId.verifyProof(
        root, 1,  // groupId=1 (Orb)
        hashToField(abi.encodePacked(user)),  // signal = 用户地址
        nullifierHash, externalNullifierHash, proof
    );
    usedNullifiers[nullifierHash] = true;
    creditScores[user] = score;
}
```

CRE Workflow 通过 EVMClient 调用时，需要透传前端 IDKit 生成的 proof 数据（`merkle_root`, `nullifier_hash`, `proof[8]`）。

### 修改后的用户流程

```
连钱包 → World ID 验证（IDKit 生成 ZKP proof）
  → Plaid Link 授权银行数据
  → 触发 CRE Workflow（传入 public_token + proof 数据）
  → CRE: token 交换 → 拉银行数据 → AI 评分（4/5 HTTP 请求）
  → CRE: EVMClient → CreditOracle.updateScore(wallet, score, root, nullifierHash, proof)
  → 合约内部: worldIdRouter.verifyProof() → 验证通过 → 存储 nullifier → 写入分数
  → 前端监听 ScoreUpdated 事件 → 显示分数 + 个性化抵押率 → 借贷
```

### World Mini App 双模式前端

前端同时支持**浏览器模式**和 **World App 内 Mini App 模式**：

| 能力 | 浏览器模式 | Mini App 模式 |
|------|-----------|--------------|
| World ID 验证 | `<IDKitWidget>` 弹窗/扫码 | `MiniKit.commandsAsync.verify()` 原生调用 |
| 钱包连接 | wagmi + ConnectKit | `MiniKit.commandsAsync.walletAuth()` (SIWE) |
| 链上交易 | wagmi 直接发 Sepolia 交易 | 不可用（sendTransaction 仅支持 World Chain） |
| 检测方式 | 默认 | `MiniKit.isInstalled()` |

**关键约束**：MiniKit 的 `sendTransaction` 仅支持 **World Chain**，而我们的 Aave fork 和 CreditOracle 部署在 **Sepolia**。因此 Mini App 模式聚焦"验证 + 评分"体验，完整借贷操作在浏览器模式完成。Mini App 作为 World App 生态的入口，引导用户完成身份验证和信用评估。

**SDK 信息**：
- 浏览器：`@worldcoin/idkit` v2.4.2（React 组件）
- Mini App：`@worldcoin/minikit-js` v1.9.10（peer deps: react ^17-19, viem ^2.23.5）
- Sepolia World ID Router：`0x469449f251692e0779667583026b5a1e99512157`
- Developer Portal：https://developer.worldcoin.org（注册 app，创建 `credit-score` action）
