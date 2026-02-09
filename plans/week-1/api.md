# Week 1 Plan: API (`packages/api/`)

> 目标：Plaid 代理 + 数据聚合 + AI 评分的薄中间层

---

## 1. 定位

API 不是 mock 服务，而是一个**薄中间层**，承担三个职责：

1. **Plaid Link 代理** — 前端需要后端来创建 link token、交换 access token（Plaid credentials 不能暴露在前端）
2. **数据聚合** — 将 Plaid 多个 API 的原始数据聚合为结构化的 `FinancialProfile`
3. **AI 评分** — 调用 LLM 对金融画像进行信用评分（OpenAI API key 不能暴露）

## 2. 技术选型

- **框架**: Hono（已在 package.json 中）
- **运行时**: Bun
- **部署**: Fly.io（长驻进程，支持 Bun runtime）
- **数据库**: Fly Postgres（存储 Plaid access_token 和评分结果）
- **银行数据**: Plaid Sandbox（真实 API，测试数据）
- **AI**: OpenAI API（GPT-4o-mini，成本低速度快）

## 3. Endpoints（仅 3 个）

| Endpoint | 作用 | 调用方 |
|----------|------|--------|
| `POST /api/plaid/create-link-token` | 创建 Plaid Link token | 前端 |
| `POST /api/plaid/exchange-token` | 交换 public_token → access_token | 前端 |
| `POST /api/evaluate` | 拉 Plaid 数据 → 聚合 → AI 评分 → 返回结果 | CRE workflow / 前端 |

### `POST /api/plaid/create-link-token`

- 调用 Plaid `/link/token/create`
- 返回 `link_token` 给前端初始化 Plaid Link UI
- 前端用户通过 Link UI 授权银行账户

### `POST /api/plaid/exchange-token`

- 接收前端传来的 `public_token` + 用户钱包地址
- 调用 Plaid `/item/public_token/exchange` 换取 `access_token`
- 将 `access_token` 存入 Postgres（关联钱包地址）
- 返回成功状态（不暴露 access_token 给前端）

### `POST /api/evaluate`

核心 endpoint，一次调用完成全部流程：

- 请求体: `{ walletAddress: "0x..." }`
1. 从 Postgres 读取该钱包地址关联的 `access_token`
2. 用 `access_token` 调用 Plaid APIs：
   - `/accounts/balance/get` — 账户余额
   - `/transactions/get` — 近 6 个月交易记录
   - `/identity/get` — 身份信息
2. 聚合为 `FinancialProfile`：
   - 计算月均收入、负债比、余额波动率、账龄等衍生指标
3. 将 `FinancialProfile` 送入 AI 评分：
   - 调用 OpenAI API
   - 返回 `{ "score": 0-100, "collateralRatio": 100-200, "reasoning": "..." }`
4. 将评分结果存入 Postgres（历史记录）

## 4. 数据库 Schema（Fly Postgres）

极简设计，两张表：

### `plaid_items` — 存储 Plaid 连接

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | uuid PK | |
| `wallet_address` | text UNIQUE | 用户钱包地址（小写） |
| `access_token` | text | Plaid access_token |
| `item_id` | text | Plaid item ID |
| `created_at` | timestamp | |

### `credit_scores` — 评分历史

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | uuid PK | |
| `wallet_address` | text | 用户钱包地址 |
| `score` | integer | 0-100 |
| `collateral_ratio` | integer | 100-200 |
| `reasoning` | text | AI 评分理由 |
| `financial_profile` | jsonb | 聚合后的金融画像快照 |
| `created_at` | timestamp | |

## 5. Plaid Sandbox 配置

直接使用 Plaid Sandbox 环境，不自己 mock 数据：
- 免费的测试 API keys（Dashboard 注册即得）
- 预置测试用户（`user_good`/`pass_good` 等）
- 真实的 API 响应格式（和 Production 完全一致）

### Plaid 测试用户

| Sandbox 用户名 | 说明 | 预期信用分 |
|---------------|------|-----------|
| `user_good` / `pass_good` | 标准用户，正常余额和交易 | 60-75 |
| `user_transactions_dynamic` | 动态交易历史，更真实 | 70-85 |
| `user_bank_income` | 多种收入流，适合收入验证 | 80-90 |
| `user_custom` + 自定义 JSON | 可自定义余额/交易/收入 | 按配置 |

## 6. AI 评分策略

- System prompt 定义评分标准（收入/负债比、账龄、违约记录、余额稳定性）
- 强制 JSON-only 输出，用 `response_format: { type: "json_object" }` 约束
- 温度设为 0，确保相同输入产生一致结果（CRE 多节点共识需要）
- 加入 fallback：如果 LLM 返回格式异常，返回默认保守分数

### 评分标准

| 因素 | 权重 | 说明 |
|------|------|------|
| 月收入/负债比 | 30% | > 3 高分，< 1 低分 |
| 账户存续时间 | 20% | > 24 月加分 |
| 历史违约记录 | 25% | 有违约大幅扣分 |
| 余额稳定性 | 15% | 波动率低加分 |
| 收入多样性 | 10% | 多来源加分 |

## 7. 架构演进

```
Week 1 (普通 HTTP):
  前端 → API (Plaid Link 代理)
  CRE Workflow → API /evaluate → Plaid Sandbox + OpenAI

Week 2 (Confidential HTTP):
  前端 → API (Plaid Link 代理，不变)
  CRE Workflow → Plaid 直接调用 (credentials 存 Vault DON)
  CRE Workflow → API /evaluate (仅 AI 评分部分)
```

Week 2 后 API 的 Plaid 代理职责可部分迁移到 CRE workflow，但前端的 Plaid Link 流程和 AI 评分仍需要 API。

## 8. 部署（Fly.io）

- [ ] `fly launch` 初始化 Fly app（选 Bun runtime）
- [ ] `fly postgres create` 创建 Fly Postgres 实例
- [ ] `fly postgres attach` 关联到 app（自动注入 `DATABASE_URL`）
- [ ] 设置 secrets：
  - `fly secrets set PLAID_CLIENT_ID=xxx`
  - `fly secrets set PLAID_SECRET=xxx`
  - `fly secrets set PLAID_ENV=sandbox`
  - `fly secrets set OPENAI_API_KEY=xxx`
- [ ] 配置 `Dockerfile`（Bun + Hono）
- [ ] 数据库 migration（建表脚本）
- [ ] 验证部署后的 endpoints 可从外部访问

## Week 1 交付物

1. 3 个 endpoints 可用（create-link-token, exchange-token, evaluate）
2. Plaid Sandbox 集成完成，能拉取真实格式的银行数据
3. Postgres 存储 access_token 和评分历史
4. 金融画像聚合逻辑（balance + transactions + identity → FinancialProfile）
5. AI 评分返回结构化 JSON
6. 部署到 Fly.io 公网可访问

## 依赖关系

- **外部依赖**: Plaid Sandbox API keys + OpenAI API key + Fly.io 账号
- **无内部依赖**，可独立开发
- 输出：公网 API URL → 被 `workflow` 和 `frontend` 消费

## 依赖安装

- `hono` — 已有
- `postgres` / `pg` — Postgres 客户端（推荐 `postgres` 即 postgres.js，轻量）
- `openai` — OpenAI SDK
- Plaid: 直接用 `fetch` 调 REST API（不引入 `plaid` SDK，避免 Node.js 依赖问题）
