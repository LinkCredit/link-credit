# CLAUDE.md — @link-credit/api

Hono serverless API handling Plaid Link token creation, CRE workflow triggering, and encrypted token storage. Runs on Bun locally, targets Cloudflare Worker for production.

## Commands

```bash
bun run dev          # Hot-reload dev server on port 3001
bun run build        # Build to dist/ (Bun target)
bun test             # Run tests
```

## Source Files

- `src/index.ts` — All endpoints, auth helpers, and KV logic (single-file API)
- `src/index.test.ts` — Tests (minimal coverage)

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | None | Status + queue size |
| POST | `/link-token` | None | Create Plaid Link token |
| POST | `/trigger-scoring` | Wallet signature (EIP-191) | Trigger CRE workflow |
| PUT | `/access-token` | API key | Store encrypted Plaid token in KV |
| GET | `/next-user` | API key | Pop next user from rescore queue |

## Auth Mechanisms

- **Wallet signature** — EIP-191 `verifyMessage` via viem (public endpoints)
- **API key** — `X-API-Key` header or `Bearer` token (internal endpoints, used by CRE workflow)
- **CRE JWT** — ES256K signed JWT for CRE gateway authentication (secp256k1 via @noble/curves)

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `PLAID_CLIENT_ID` | Yes | — |
| `PLAID_SECRET` | Yes | — |
| `PLAID_BASE_URL` | No | `https://sandbox.plaid.com` |
| `CRE_GATEWAY_URL` | No | `https://gateway.chain.link/v1/workflows/execute` |
| `CRE_WORKFLOW_ID` | Yes | — |
| `CRE_WORKER_PRIVATE_KEY` | Yes | — |
| `WORKER_API_KEY` | Yes | — |
| `ACCESS_TOKEN_KV` | Yes | KV namespace binding |

## Dependencies

- `hono` — Web framework (Cloudflare Worker compatible)
- `viem` — Ethereum utils (address checksum, signature verification)
- `@noble/curves` — secp256k1 for ES256K JWT signing
- `@noble/hashes` — SHA-256 for JWT

## Key Patterns

- KV keys: `wallet-token:{lowercase_address}` for tokens, `users:queue` for rescore queue
- Queue is round-robin: pop front, push back after processing
- CORS allows all origins (`*`) — restrict for production
- No wrangler.toml yet — needs Cloudflare deployment config
- No rate limiting — add before production
