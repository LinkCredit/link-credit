# Week 1 Plan: Frontend (`packages/frontend/`)

> 目标：可连接钱包、展示信用分、执行借贷操作的 DApp 原型

---

## 1. 技术选型

- **框架**: React + Vite（已 scaffold）
- **Web3**: wagmi v2 + viem（类型安全的以太坊交互）
- **样式**: TailwindCSS
- **钱包**: RainbowKit 或 ConnectKit（快速集成多钱包）
- **网络**: Sepolia testnet

## 2. 页面结构

单页应用，3 个主要区域：

### Header
- [ ] 钱包连接按钮（ConnectKit/RainbowKit）
- [ ] 显示连接状态、地址、网络（Sepolia）
- [ ] 网络不对时提示切换

### Credit Score Panel
- [ ] 显示当前用户的链上信用分（读取 `CreditOracle.creditScores(address)`）
- [ ] 无分数时显示 "No credit score yet"
- [ ] 有分数时显示：分数（0-100）、对应的 LTV boost、有效抵押率
- [ ] "Evaluate My Credit" 按钮 → 触发信用评估流程（见 Section 4）
- [ ] 评估中显示 loading 状态

### Lending Panel
- [ ] 显示市场信息：资产（WETH/USDC）、base LTV、用户有效 LTV
- [ ] **Supply（存入抵押品）**:
  - 输入存入金额
  - 显示预估可借额度（基于有效 LTV）
  - 调用 `Pool.supply()`
- [ ] **Borrow（借出）**:
  - 输入借出金额
  - 显示当前 health factor
  - 调用 `Pool.borrow()`
- [ ] **对比展示**（Demo 核心亮点）:
  - 并排显示：无信用分 vs 有信用分的抵押率差异
  - 例："借 $1000: 无分数需 $2000 抵押 → 有分数只需 $1538"

## 3. 合约交互层

- [ ] 生成合约 ABI TypeScript 类型（从 Foundry artifacts）
- [ ] 配置 wagmi contracts：
  - `CreditOracle` — `creditScores()`, `getLtvBoost()`
  - `Pool` — `supply()`, `borrow()`, `getUserAccountData()`
  - `TestnetERC20` — `approve()`, `balanceOf()`, `mint()`（测试用 faucet）
- [ ] 合约地址从配置文件/环境变量读取

## 4. 信用评估流程（Plaid Link + CRE Workflow）

前端集成 Plaid Link，授权完成后触发 CRE Workflow，结果通过链上事件返回：

1. 用户点击 "Evaluate My Credit"
2. 前端调 Serverless `POST /api/plaid/create-link-token` → 拿到 `link_token`
3. 用 `link_token` 初始化 Plaid Link UI（`react-plaid-link` 组件）
4. 用户在 Plaid Link 中选择银行、输入测试凭证（`user_good`/`pass_good`）
5. Plaid Link 返回 `public_token`
6. 前端触发 CRE Workflow，传入 `public_token` + `walletAddress`
7. 前端显示 loading 状态，监听链上 `ScoreUpdated` 事件
8. CRE Workflow 执行（token 交换 → 银行数据获取 → AI 评分 → 写链上）
9. 前端收到 `ScoreUpdated` 事件 → 显示信用分和有效抵押率

### 依赖

- [ ] 安装 `react-plaid-link`（Plaid 官方 React 组件）
- [ ] Serverless API base URL 从环境变量读取

## 5. UI/UX 要点

- [ ] 深色主题（DeFi 标配）
- [ ] 数字动画（分数从 0 滚动到目标值）
- [ ] 抵押率对比用颜色区分（红色=高抵押率，绿色=低抵押率）
- [ ] 响应式但 Desktop-first（Demo 视频用桌面录制）

## 6. 开发环境

- [ ] 配置 Vite + React + TypeScript
- [ ] 安装 wagmi, viem, @tanstack/react-query, tailwindcss
- [ ] 安装 connectkit 或 rainbowkit
- [ ] 安装 react-plaid-link
- [ ] 配置 Sepolia RPC（Alchemy/Infura）

## Week 1 交付物

1. 钱包连接功能正常
2. 能读取并显示链上信用分
3. Plaid Link 集成完成（真实的银行授权流程）
4. 信用评估触发 CRE Workflow + 监听链上事件获取结果
5. 能执行 supply + borrow 操作
6. 对比展示 UI（无分数 vs 有分数）
7. 基本的 loading/error 状态处理

## 依赖关系

- **依赖 `contracts`**: 需要合约 ABI + Sepolia 部署地址
- **依赖 `api`**: Serverless function 提供 Plaid Link token
- 输出：可演示的 DApp → Demo 视频录制

## 优先级排序

1. **P0**: 钱包连接 + 读取信用分 + 对比展示（Demo 核心）
2. **P1**: Plaid Link 集成 + 信用评估流程
3. **P2**: Supply + Borrow 操作
4. **P3**: UI 动画和打磨
