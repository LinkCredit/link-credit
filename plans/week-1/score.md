一套**“能解释、能落地、对 CRE 约束友好”**的评分设计：

* **规则分（deterministic）= 主分**：稳定、可复现、适合多节点共识
* **LLM 分 = 校准分（bounded）**：只在小范围内调整 + 产出解释/原因码，避免共识不稳
* 适配你给的 Plaid transactions mock（并且只依赖 transactions + balance 两个端点即可）

---

## 0) 总体输出与权重

* 规则分 `S_rule`：0–100
* LLM 校准 `Δ_ai`：-10 ～ +10（严格限幅）
* 最终分：
  [
  S = clamp(S_{rule} + \Delta_{ai}, 0, 100)
  ]
* 链上写入：`scoreBps = S * 100`（0–10000）

> 为什么不用“LLM 直接给 0-100”？
> 因为 **temperature=0 也可能不完全一致**；你需要让共识容忍波动，所以让 LLM 只做小幅校准最稳。

---

## 1) 你能从 Plaid 数据里稳定抽取哪些“信用相关信号”

在不引入工资识别/贷款账户的复杂前提下，MVP 也能做出合理“隐私信用分”：

### A. 现金流与余额安全垫

* 近 30 天**总收入**（Income）与**总支出**（Spend）
* 近 30 天**净现金流**（Income - Spend）
* 当前总余额（从 `/accounts/balance/get`）

### B. 收入稳定性（近 2-3 个发薪周期）

* 是否存在“定期收入”pattern（例如每 2 周/每月、金额相近、同一 employer/同一描述）
* 收入波动程度（标准差/均值）

### C. 支出健康度（预算与波动）

* 食品/娱乐/订阅等非必要支出占比
* 大额异常支出（单笔 > 月支出 P95 或 > $X）

### D. 风险事件 proxy（Sandbox 能造）

* NSF/overdraft 类关键词：`overdraft`, `nsf`, `returned item`, `insufficient funds`
* 频繁 pending reversal（大量 pending 转 posted 或撤销）——可做弱信号

> 注意：Plaid 生产里还有更强的 signals（liabilities、income verification、identity、bank account ownership），但你 Week1 不建议扩更多 endpoint。

---

## 2) 规则分公式（可解释、可调参）

定义窗口：过去 `T=30天`（强烈建议，避免 1MB）

### 2.1 特征工程（从 transactions / balance）

**分类：收入/支出**

* income 判定（MVP）：`amount < 0` 视为流入（有些环境是反过来的；你需要用 Plaid 的 `transaction_type`/`payment_channel` 不可靠，最稳是用 sign + name/category 关键词兜底）
* spend：`amount > 0`

你给的样例 `amount: 25.30` 显然是消费，所以假设 **amount>0 为支出**。

**核心统计：**

* `income_total` = sum(income_abs)
* `spend_total` = sum(spend)
* `net` = income_total - spend_total
* `balance_total` = sum(accounts.current_balance)
* `daily_spend = spend_total / 30`
* `buffer_days = balance_total / max(daily_spend, 1)` （余额能覆盖多少天支出）

**收入稳定性：**

* 取收入交易集合，按 `merchant_name/name` 聚类（简单做：normalize string 后 group）
* 找最大 cluster（疑似工资），看其出现周期与金额稳定
* `income_cv = std(amounts) / mean(amounts)`（CV 越小越稳定）

**风险事件：**

* `risk_flags` = count(keyword matches in name/merchant/category)

  * keywords：`overdraft|nsf|returned|insufficient|late fee|collections`

---

### 2.2 子分项与分段打分（0–100）

把规则分拆成 5 个子项，各自 0–100，再加权：

| 子项                    |  权重 | 直觉                |
| --------------------- | --: | ----------------- |
| 余额安全垫 Buffer          | 30% | 余额/支出覆盖天数越多越安全    |
| 净现金流 Net Flow         | 25% | 近期是否“赚得比花得多”      |
| 收入稳定 Income Stability | 20% | 工资是否规律、波动小        |
| 支出健康 Spend Discipline | 15% | 非必要支出占比、波动        |
| 风险事件 Risk Flags       | 10% | overdraft/NSF 等扣分 |

#### (1) Buffer 子分 `S_buf`

用 `buffer_days` 分段：

* ≥ 90天：100
* 60–89：85
* 30–59：70
* 14–29：50
* 7–13：35
* <7：15

#### (2) Net Flow 子分 `S_net`

用 `net_ratio = net / max(income_total, 1)`（净流入占收入比例）

* ≥ 0.25：100
* 0.10–0.249：80
* 0–0.099：60
* -0.10–-0.001：40
* < -0.10：20

#### (3) 收入稳定 `S_inc`

若找不到“工资 cluster”（收入交易 <2 次），给中性 55（别直接给低分，sandbox/新人也可能没收入数据）。

如果能识别：

* `income_cv ≤ 0.10`：100
* 0.10–0.25：80
* 0.25–0.5：60
* > 0.5：40

并加一个周期奖励（可选）：

* 如果两次收入间隔接近 14±3天 或 30±5天：+10（上限 100）

#### (4) 支出健康 `S_spend`

两条信号：

* `discretionary_ratio`：Food&Drink、Travel、Entertainment、Shopping(非必需) 等占比
* `spend_spike`：大额异常支出次数

简单实现（MVP）：

* `discretionary_ratio ≤ 0.25`：90
* 0.25–0.45：70
* 0.45–0.65：50
* > 0.65：35
  > 然后每出现一次 spike（例如单笔 > 300 或 > P95*1.5）扣 5（最多扣 20）

#### (5) 风险事件 `S_risk`

* 0 次：100
* 1 次：70
* 2 次：45
* ≥3 次：20

---

### 2.3 合成规则分

[
S_{rule}=0.30S_{buf}+0.25S_{net}+0.20S_{inc}+0.15S_{spend}+0.10S_{risk}
]

并输出 explain（deterministic）：

* top positive factors：buffer_days、net_ratio、income_cv…
* top negative factors：risk_flags、discretionary_ratio、spend_spike…

---

## 3) LLM 校准：只输出“小幅调整 + 解释码”

### 3.1 LLM 输入（必须压缩）

你不能把全量交易喂给 LLM（成本、1MB、超时）。给它一个 summary：

```json
{
  "window_days": 30,
  "income_total": 4200,
  "spend_total": 3100,
  "net": 1100,
  "balance_total": 5600,
  "buffer_days": 54,
  "income_detected": true,
  "income_cv": 0.12,
  "discretionary_ratio": 0.38,
  "spend_spike_count": 1,
  "risk_flags_count": 0,
  "top_merchants": [
    {"name": "Starbucks", "count": 6, "total": 52.3},
    {"name": "Whole Foods", "count": 3, "total": 210.0}
  ],
  "rule_score": 78
}
```

### 3.2 LLM 输出 schema（强约束）

让模型只能输出：

```json
{
  "adjustment": -3,
  "reason_codes": ["LOW_BUFFER", "INCOME_STABLE"],
  "one_sentence_explanation": "..."
}
```

并强制：

* adjustment 必须 integer，范围 [-10,10]
* reason_codes 从白名单选择（你定义 10–15 个就够）
* 解释一句话（demo 用）

### 3.3 adjustment 逻辑建议

让 LLM 做“人类信用官”校准，但**必须 bounded**。例如：

* 如果 `income_detected=false` 且 net>0：LLM 可能给 -2（“income signal weak”）
* 如果 discretionary_ratio 高但 net 很高：LLM 给 +1 或 0（“虽然花得多但现金流覆盖”）
* 如果 buffer_days 很低但 net>0：LLM -3（“短期流动性风险”）

最终：
[
S = clamp(S_{rule} + adjustment, 0, 100)
]

---

## 4) 你要的“加权融合”版本（如果你坚持 LLM 给 overall score）

也可以，但要做成“二级融合”，仍然避免不稳：

* LLM 输出 `ai_score`（0–100）+ `confidence`（0–1）
* 规则分为主，LLM 只在置信高时影响更大：

[
S = clamp(0.8S_{rule}+0.2(\text{confidence}\cdot S_{ai}+(1-\text{confidence})\cdot S_{rule}), 0, 100)
]

等价于：

* 默认 80/20
* 若 LLM 自评不确定（confidence低），自动退回规则分

但我更建议你用 **adjustment**，更简单稳。

---

## 5) Plaid Sandbox “造数据”怎么对上这套分数（Demo 需要）

你要能做出 3 类用户，分数差异明显：

### Persona A：Prime（80–95）

* 每两周/每月固定收入（同 merchant/name，金额波动 <10%）
* discretionary_ratio < 0.35
* buffer_days > 45
* 无 risk_flags

### Persona B：Near-prime（60–75）

* 收入存在但波动（CV 0.25–0.5）
* discretionary_ratio 0.45 左右
* buffer_days 20–40
* 0–1 次 risk flag

### Persona C：Subprime（30–55）

* 收入不规律/缺失
* net 为负或接近 0
* buffer_days < 14
* 2+ 次 overdraft/NSF 关键词交易

你在 demo 里只要展示：同样借 $1000，Prime collateral ratio 显著下降（来自你 LTV boost）。

---

## 6) 落地到代码：Workflow 内的最小实现接口

建议 workflow 内输出一个 object（供 log + LLM + onchain）：

```ts
type ScoreResult = {
  ruleScore: number;        // 0-100
  aiAdjustment: number;     // -10..10
  finalScore: number;       // 0-100
  reasons: string[];        // reason codes
  features: {
    bufferDays: number;
    netRatio: number;
    incomeCV?: number;
    discretionaryRatio: number;
    riskFlags: number;
  };
};
```

链上只写：`finalScoreBps = finalScore * 100` + `updatedAt` + `modelVersion`
