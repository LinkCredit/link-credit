# Week 1 Open Questions

## 核心架构困境：评估逻辑放哪里？

### 问题

信用评估的核心逻辑（调 Plaid 拿银行数据 → 聚合 → 调 OpenAI 做 AI 评分）应该放在哪里执行？

### 方案 A：放在后端 API

CRE workflow 只调 API `/evaluate`，API 内部完成 Plaid + AI。

**问题：脱裤子放屁。**
- CRE 只做了"调一个 API + 写链上"，核心计算全在中心化后端
- CRE 的核心价值是 Confidential HTTP（隐私计算），但敏感数据（银行数据）全在 API 里处理
- 评审会问："你用 CRE 的意义是什么？直接后端写链上不就行了？"
- 分数本身是公开的（写在链上），需要隐私保护的是 **evaluation 过程**（银行数据、金融画像）
- 这个方案下，CRE 没有提供任何隐私保护

### 方案 B：放在 CRE Workflow

Workflow 直接调 Plaid API + OpenAI API，不需要后端（Week 1 Sandbox）。

**优势：**
- CRE 真正做隐私计算 — 银行数据在 TEE 里处理，没有中心化服务器看到
- 评审故事更强："全部在去中心化网络的可信执行环境里完成"
- 架构更简洁，不需要额外基础设施

**担心：不确定 CRE 能否实现。**

具体限制：
| 限制 | 值 | 影响 |
|------|-----|------|
| 每次执行最多 HTTP 请求数 | 5 个 | Plaid 需要 2-4 个 API 调用 + OpenAI 1 个，非常紧 |
| HTTP 响应大小 | 1 MB | Plaid transactions 数据量可能较大 |
| 执行超时 | 120 秒 | OpenAI API 响应时间不确定 |
| 内存限制 | 128 MB | 聚合大量交易数据时可能不够 |
| QuickJS 引擎 | 非 Node.js | 不确定 JSON 处理、字符串操作等是否有兼容问题 |
| Secrets 存储 | 10 个, 每个 1KB | Plaid credentials + OpenAI key 需要 3-4 个 secret |

### Week 1 Sandbox 下的请求预算（方案 B）

| # | 请求 | 必要性 |
|---|------|--------|
| 1 | Plaid `/sandbox/public_token/create` | 创建测试 item |
| 2 | Plaid `/item/public_token/exchange` | 换 access_token |
| 3 | Plaid `/accounts/balance/get` | 余额数据 |
| 4 | Plaid `/transactions/get` | 交易记录 |
| 5 | OpenAI API | AI 评分 |

刚好 5 个。必须砍掉 `/identity/get`，只用余额 + 交易评分。

### 待验证

- [ ] CRE SDK 的 `HTTPClient.fetch()` 是否支持 POST + JSON body？
- [ ] 5 个 HTTP 请求的限制是硬限制还是可配置？
- [ ] QuickJS 下 JSON.parse 大对象（Plaid transactions）是否有问题？
- [ ] CRE Secrets 能否存 Plaid client_id + secret + OpenAI key？
- [ ] `cre simulate` 本地模拟是否能测试 HTTP 调用？

### 决策

**暂未决定。** 需要先验证 CRE SDK 的实际能力后再定。

建议路径：
1. 先写一个最小 CRE workflow，测试 HTTPClient.fetch() 能否调通 Plaid Sandbox API
2. 如果能跑通 → 方案 B（CRE 做评估）
3. 如果跑不通 → 退回方案 A（后端做评估），但需要在 Demo 中解释清楚升级路径
