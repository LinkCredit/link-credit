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

不要做一个完整借贷协议。只做"信用评分预言机"这一层——一个 CRE workflow，输入是用户授权的 Plaid/银行 API token，通过 Confidential HTTP 调用，AI 模型（可以调 LLM API）解析返回的金融数据并生成 0-100 信用分，将分数上链。然后写一个极简的示范合约展示：分数 > 70 的用户可以以 110% 抵押率借贷（而不是 150%）。

## 为什么评审会喜欢？

- 用了 CRE 最新的 Confidential HTTP 功能（评审看到你用新功能会加分）
- AI 是关键环节（信用评估）而不是噱头
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
│  用户连接钱包 → 授权信用评估 → 查看分数 → 一键借贷  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 2: CRE Workflow（TypeScript, 核心）        │
│  Confidential HTTP 调用外部 API → AI 评分 →       │
│  将评分上链写入 CreditOracle 合约                  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 1: Solidity 合约（Sepolia testnet）        │
│  CreditOracle.sol ← 存储信用分                    │
│  CreditLendingPool.sol ← 根据分数动态调抵押率      │
└─────────────────────────────────────────────────┘
```

### CRE Workflow 具体能做什么

CRE SDK 给你的核心能力是：**HTTPClient**（发 HTTP 请求，含 Confidential 模式）+ **EVMClient**（读写链上合约）+ **CronTrigger / 链上事件 Trigger**。Workflow 编译成 WASM 在 DON 节点上执行，每个节点独立跑一遍，通过 BFT 共识出最终结果。

**关键约束**：workflow callback 是无状态的，每次触发从零开始。QuickJS 引擎不是完整 Node.js，不能用 `node:crypto` 等内置模块。但可以调任何 HTTP API，所以 AI 推理可以完全外包给外部服务。

---

## 具体实现步骤

### 第一周（2/6-2/13）：搭基座

在 Confidential HTTP 还没上线之前，先用普通 HTTPClient 把整个 flow 跑通：

```typescript
// credit-score-workflow/main.ts
import { cre, type Runtime, type NodeRuntime } from "@chainlink/cre-sdk"
import { z } from "zod"

const configSchema = z.object({
  schedule: z.string(),           // "0 */6 * * *" 每6小时
  creditApiUrl: z.string(),       // mock credit API endpoint
  aiScoringUrl: z.string(),       // LLM scoring API endpoint
  evms: z.array(z.object({
    chainSelectorName: z.string(),
    oracleContractAddress: z.string(),
  }))
})

type Config = z.infer<typeof configSchema>

// 步骤1: 从"银行API"拉取用户金融数据
const fetchFinancialData = async (nodeRuntime: NodeRuntime<Config>) => {
  const httpClient = new cre.capabilities.HTTPClient()
  const response = httpClient.fetch(nodeRuntime, {
    url: nodeRuntime.config.creditApiUrl,
    method: "GET",
    headers: { "Authorization": "Bearer ${SECRET_BANK_API_KEY}" }
  }).result()
  return response.body  // JSON: { balance, income, debtRatio, paymentHistory... }
}

// 步骤2: 将金融数据送给AI评分
const getAiCreditScore = async (nodeRuntime: NodeRuntime<Config>) => {
  const financialData = await fetchFinancialData(nodeRuntime)
  const httpClient = new cre.capabilities.HTTPClient()
  const aiResponse = httpClient.fetch(nodeRuntime, {
    url: nodeRuntime.config.aiScoringUrl,
    method: "POST",
    body: JSON.stringify({
      prompt: `Analyze this financial profile and return a credit score 0-100
               and a recommended collateral ratio (100-200%).
               Return ONLY JSON: {"score": N, "collatRatio": N}`,
      data: financialData
    })
  }).result()
  return JSON.parse(aiResponse.body)
}

// 步骤3: 将评分写入链上 Oracle 合约
const onCronTrigger = (runtime: Runtime<Config>): string => {
  const aiResult = runtime.runInNodeMode(getAiCreditScore,
    cre.consensusMedianAggregation  // 多个节点各自算分，取中位数 → 防单点操纵
  )

  const evmClient = new cre.capabilities.EVMClient(
    runtime.config.evms[0].chainSelectorName
  )
  // 调用 CreditOracle.updateScore(userAddress, score, collatRatio)
  evmClient.writeContract(runtime, {
    to: runtime.config.evms[0].oracleContractAddress,
    data: encodeUpdateScore(aiResult.score, aiResult.collatRatio)
  })

  return `Score updated: ${aiResult.score}`
}
```

#### Solidity 合约（第一周同步写）

```solidity
// CreditOracle.sol — 极简版
contract CreditOracle {
    mapping(address => uint256) public creditScores;      // 0-100
    mapping(address => uint256) public collateralRatios;   // 100-200, 单位%
    address public creWorkflowAddress;  // 只有CRE workflow能写入

    function updateScore(address user, uint256 score, uint256 ratio) external {
        require(msg.sender == creWorkflowAddress);
        creditScores[user] = score;
        collateralRatios[user] = ratio;
    }
}

// CreditLendingPool.sol — 极简借贷演示
contract CreditLendingPool {
    CreditOracle public oracle;

    function borrow(uint256 amount) external payable {
        uint256 ratio = oracle.collateralRatios(msg.sender);
        if (ratio == 0) ratio = 150; // 无评分默认150%
        require(msg.value * 100 >= amount * ratio, "Insufficient collateral");
        // ... 发放贷款逻辑
    }
}
```

### 第二周（2/14 起）：切换到 Confidential HTTP

2月14日 Confidential HTTP 和 Private Transactions 开放 early access。根据 Hackathon prizes 页面的描述，Confidential HTTP 的能力是：

- API credentials（密钥）不暴露给任何人（包括 DON 节点操作者）
- Request 和 Response 的选定字段保持机密
- 计算在 TEE（可信执行环境）中完成

实际操作上，你需要做的改动应该相对小——把 HTTPClient 替换为 Confidential HTTP capability，并通过 CRE 的 Vault DON 存储银行 API 密钥：

```typescript
// 伪代码 — 具体 API 需等 2/14 文档确认
const fetchFinancialDataConfidential = async (nodeRuntime: NodeRuntime<Config>) => {
  const confidentialHttp = new cre.capabilities.ConfidentialHTTPClient()
  // API key 存在 Vault DON 里，节点操作者看不到
  // 返回的原始金融数据也在 TEE 内处理，只输出评分结果
  const response = confidentialHttp.fetch(nodeRuntime, {
    url: "https://api.plaid.com/accounts/balance/get",
    secretRef: "plaid_api_key",  // 引用Vault DON中的secret
    confidentialFields: ["response.accounts.balances"] // 这些字段不出TEE
  }).result()
  return response.body
}
```

### 第二/三周：Mock Credit API + AI 评分服务

这是最现实的部分——Hackathon 环境下你不太可能接入真正的 Plaid API（需要生产 key 和银行账户）。策略是：

1. **自建 Mock Bank API**（部署在 Vercel/Railway 上），返回模拟的金融数据。关键是它看起来像真的 API——有 auth、有结构化的 JSON response
2. **AI 评分服务**：部署一个简单的 API endpoint，后端调用 OpenAI/Claude API 做信用评估。prompt 大概是：

   ```text
   你是一个信用评估 AI。基于以下金融数据，输出信用评分(0-100)和建议抵押率(100-200%)。
   评分标准：
   - 月收入/负债比 > 3 → 高分
   - 账户存续时间 > 24个月 → 加分
   - 历史违约记录 → 扣分
   - 余额稳定性（波动率低） → 加分
   必须只返回 JSON: {"score": N, "collateralRatio": N, "reasoning": "..."}
   ```

3. **前端 DApp**：用户连接钱包 → 点击 "Evaluate My Credit" → mock 授权流程 → CRE workflow 被触发 → 几秒后分数上链 → 前端显示分数和可用的优惠抵押率 → 一键存 collateral 并借出

---

## 能做到的最终 Demo 效果

五分钟视频里你能展示的完整故事线：

1. **开场**（30秒）：展示 DeFi 借贷的痛点——"用户想借 $1000，需要锁 $1500+，这不是信贷，是典当"
2. **用户流程演示**（90秒）：连钱包 → 授权银行数据评估 → CRE workflow 执行（展示 CLI simulation 输出日志，清晰可见每一步：Confidential HTTP 调用、AI 评分、链上写入） → 前端实时刷新信用分（比如 82/100） → 显示 "你的个性化抵押率：115%"（而不是默认的 150%）
3. **借贷演示**（60秒）：存入 $1150 collateral → 成功借出 $1000 → 对比没有信用分的用户需要存 $1500
4. **技术亮点**（60秒）：展示 Confidential HTTP 如何保护银行数据——"原始金融数据从未离开 TEE，链上只记录了评分结果"。展示合约代码中 CRE workflow 是唯一写入者。AI 评分经过 DON 多节点共识取中位数，防止单点操纵
5. **未来展望**（30秒）：接入真实的 Plaid/银行 open banking API → 多协议复用同一个 credit oracle → 构建链上信用历史

---

## 风险点与 Plan B

**最大风险**：Confidential HTTP 在 2/14 开放 early access，但文档和 API 可能不稳定，或需要申请 early access 排队。

**Plan B**：即使 Confidential HTTP 用不上，你仍然可以用普通 HTTPClient + CRE Secrets 管理（存 API key）来构建。在视频演示中说明 "this workflow is designed for Confidential HTTP, currently running in simulation mode with standard HTTP, and will migrate to Confidential HTTP once GA" ——评审理解这是 early access 的限制，你的架构设计已经到位了，这就够了。往届获奖项目很多也只是模拟/testnet 级别。
