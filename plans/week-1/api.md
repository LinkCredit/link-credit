# Week 1 Plan: API (`packages/api/`)

> 极简 Serverless Function，仅创建 Plaid Link token

---

## Endpoint（仅 1 个）

### `POST /api/plaid/create-link-token`

- 接收: `{ userId: string }` (用户钱包地址)
- 调用 Plaid `/link/token/create`
- 返回: `{ link_token: string, expiration: string }`

```typescript
// src/index.ts (Cloudflare Worker)
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { userId } = await req.json()
    const res = await fetch('https://sandbox.plaid.com/link/token/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.PLAID_CLIENT_ID,
        secret: env.PLAID_SECRET,
        user: { client_user_id: userId },
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      }),
    })
    return new Response(JSON.stringify(await res.json()), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
```

## 环境变量（Cloudflare Secrets）

- `PLAID_CLIENT_ID` — Plaid Sandbox client ID
- `PLAID_SECRET` — Plaid Sandbox secret

## 部署（Cloudflare Worker）

- [ ] `wrangler init` 或配置 `wrangler.toml`
- [ ] `wrangler secret put PLAID_CLIENT_ID` / `PLAID_SECRET`
- [ ] `wrangler deploy`

## 依赖关系

- **外部依赖**: Plaid Sandbox API keys + Cloudflare 账号
- **无内部依赖**，仅被 `frontend` 消费
