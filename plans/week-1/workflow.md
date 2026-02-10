# Week 1 Plan: CRE Workflow (`packages/workflow/`)

> CRE Workflow 承担完整信用评估流程（token 交换 + 银行数据获取 + AI 评分 + 链上写入）

---

## CRE SDK 约束

| 限制 | 值 |
|------|-----|
| HTTP 请求数 | 5 个/次 |
| HTTP 响应大小 | 1 MB |
| 执行超时 | 120 秒 |
| 内存 | 128 MB |
| 引擎 | QuickJS（非 Node.js） |
| Secrets | 10 个, 每个 1KB |
| 输出 | 只能写链上，无 HTTP response |

## 主流程

```
Frontend (Plaid Link 完成) → public_token + walletAddress → 触发 CRE

CRE Workflow (4/5 HTTP 请求):
  [1] Plaid /item/public_token/exchange → access_token
  [2] Plaid /accounts/balance/get → 余额
  [3] Plaid /transactions/get → 交易记录
  ──  本地聚合 → FinancialProfile + 规则评分（非 HTTP，不占配额）
  [4] OpenAI API → AI 信用评分
  ──  加权合并（规则评分 + AI 评分）→ 最终分数 (consensusMedianAggregation)
  └─ EVMClient → CreditOracle.updateScore(walletAddress, score)
```


## Secrets（DON Vault）

- `PLAID_CLIENT_ID` / `PLAID_SECRET` — Plaid API
- `OPENAI_API_KEY` — AI 评分

## 配置 Schema

```typescript
const configSchema = z.object({
  publicToken: z.string(),
  userAddress: z.string(),
  evms: z.array(z.object({
    chainSelectorName: z.string(),
    oracleContractAddress: z.string(),
  })),
})
```

## Week 1 Sandbox

Plaid Sandbox 可用 `/sandbox/public_token/create` 直接创建测试 token，Week 1 可独立测试 workflow，不依赖前端。

## 交付物

1. Workflow 编译通过（TS → WASM）
2. `cre simulate` 跑通完整流程
3. 日志输出清晰可读（Demo 用）

## 依赖关系

- **外部**: Plaid Sandbox API keys + OpenAI API key
- **依赖 `contracts`**: CreditOracle 合约地址
- **不依赖 `api`**

## 待验证

- [ ] `HTTPClient.fetch()` 是否支持 POST + JSON body？
- [ ] 5 个 HTTP 请求是硬限制还是可配置？
- [ ] QuickJS 下 JSON.parse 大对象是否有问题？
- [ ] `cre simulate` 能否测试 HTTP 调用？
- [ ] CRE Workflow 如何被前端触发？（链上交易 / 外部 trigger API？）

## 风险

| 风险 | 应对 |
|------|------|
| CRE SDK 文档不完整 | 参考 SDK 源码和示例 |
| QuickJS 兼容性 | 避免 Node.js 特有 API |
| AI 评分不一致 | 温度 0 + 取中位数 |
| transactions 数据过大 | 限制查询 3 个月 |
