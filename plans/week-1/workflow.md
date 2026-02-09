# Week 1 Plan: CRE Workflow (`packages/workflow/`)

> 目标：用明文 HTTPClient 跑通完整 flow（调 API → 拿评分 → 写链上），先不管 Confidential HTTP

---

## 1. 理解 CRE SDK 约束

在写代码之前，先明确 CRE workflow 的运行环境限制：

- **QuickJS 引擎**，不是 Node.js — 无 `node:crypto`、`fs` 等内置模块
- **无状态回调** — 每次触发从零开始，无持久化
- **多节点执行** — 每个 DON 节点独立跑一遍，通过 BFT 共识出结果
- **编译目标**: TypeScript → WASM
- **可用能力**: `HTTPClient`（HTTP 请求）、`EVMClient`（链上读写）、`CronTrigger`

## 2. Workflow 主流程

### 触发方式

- Week 1: `CronTrigger`（定时触发，如每 6 小时）
- 未来可改为链上事件触发（用户请求评估时触发）

### 三步流程

**Step 1: 触发评估**
- [ ] 接收用户钱包地址（通过 config 或触发参数）

**Step 2: 调用 API 获取信用评分**
- [ ] 用明文 `HTTPClient.fetch()` 调用 API 的 `POST /api/evaluate`
- [ ] 请求体: `{ walletAddress: "0x..." }`（API 从 Postgres 查 access_token）
- [ ] API 内部完成：Plaid 数据拉取 → 聚合 → AI 评分
- [ ] 解析返回的 JSON：`{ score, collateralRatio, reasoning }`
- [ ] 使用 `cre.consensusMedianAggregation` — 多节点各自调 API，取中位数防操纵

**Step 3: 链上写入**
- [ ] 使用 `EVMClient` 调用 `CreditOracle.updateScore(userAddress, score)`
- [ ] score 从 0-100 转为 0-10000 bps（乘以 100）
- [ ] 目标链: Sepolia

## 3. 配置 Schema

- [ ] 定义 `configSchema`（用 zod）：
  - `schedule`: cron 表达式
  - `apiBaseUrl`: API 服务 base URL
  - `userAddress`: 待评估的用户钱包地址
  - `evms[]`: 链配置（chainSelectorName, oracleContractAddress）

## 4. 本地模拟测试

- [ ] 使用 CRE SDK 的本地模拟模式（`cre simulate`）跑通完整流程
- [ ] 验证：API 调用 → 信用评分返回 → 链上写入的日志输出清晰
- [ ] 这个日志输出在 Demo 视频中会展示，需要可读性好

## 5. Week 1 不做的事

- 不用 Confidential HTTP（等 Week 2 上线后再切换）
- 不用 Vault DON 存 secrets（Week 1 用 CRE Secrets 即可）
- 不需要在 workflow 内直接调 Plaid（全部走 API 中间层）

## Week 1 交付物

1. Workflow 代码编译通过（TS → WASM）
2. 本地模拟跑通：明文 HTTP 调 API → 拿评分 → 写链上
3. 日志输出清晰可读（Demo 用）

## 依赖关系

- **依赖 `api`**: 需要 API 服务的公网 URL（`/api/evaluate` endpoint）
- **依赖 `contracts`**: 需要 CreditOracle 的 Sepolia 合约地址
- 输出：CRE workflow 地址 → 被 `contracts`（授权写入）和 `frontend`（触发评估）消费

## 风险

| 风险 | 应对 |
|------|------|
| CRE SDK 文档不完整 | 参考 SDK 源码和示例项目 |
| QuickJS 兼容性问题 | 避免使用 Node.js 特有 API，提前测试 |
| 多节点共识下 AI 评分不一致 | 温度设 0 + 取中位数 |
