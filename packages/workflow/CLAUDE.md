# CLAUDE.md — @link-credit/workflow

CRE credit scoring workflow. Fetches bank data via Plaid, computes a rule-based credit score, applies AI calibration via OpenAI, and writes the final score on-chain.

## Commands

```bash
bun test             # Run tests (encryption + scoring)
bun run build        # TODO — WASM build not implemented yet
```

## Source Files

- `src/index.ts` — Complete workflow logic: triggers, Plaid integration, scoring, encryption
- `src/index.test.ts` — Tests for encryption and rule-based scoring

## Architecture

Dependency-injected library — NOT yet integrated with CRE SDK. Core interfaces:

- `WorkflowDeps` — Injectable dependencies (secrets, oracle writer, fetch, logger)
- `OracleWriter` — Abstract interface for on-chain score writes
- `WorkflowSecretsProvider` — Abstract interface for secret access
- `WorkflowConfig` — Chain selector, oracle address, worker URL, API endpoints

## Two Trigger Modes

1. **HTTP Trigger** (`handleHttpTrigger`) — New user flow:
   Plaid public_token → exchange → fetch balances + transactions → score → write on-chain → store encrypted token

2. **Cron Trigger** (`handleCronTrigger`) — Rescore existing users:
   Fetch next user from Worker queue → decrypt token → fetch fresh data → rescore → write on-chain

## Scoring Algorithm

**Rule-based score (0–100)** with 5 weighted factors:

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| Buffer Days | 30% | Balance / daily spend |
| Net Flow | 25% | (Income − Spend) / Income |
| Income Stability | 20% | Coefficient of variation of monthly income |
| Spend Discipline | 15% | Discretionary ratio + spike detection |
| Risk Flags | 10% | Overdraft, NSF, late fee occurrences |

**AI adjustment**: OpenAI gpt-4o-mini adds −10 to +10 calibration points. Falls back to 0 if API fails.

**Final**: `clamp(rule_score + ai_adjustment, 0, 100)` → stored as BPS (×100) on-chain.

## Encryption

AES-GCM via `@noble/ciphers` for Plaid access token storage. Key from `TOKEN_ENCRYPTION_KEY` secret (32-byte hex or UTF-8).

## CRE Constraints (from SDK docs)

- Max 5 HTTP requests per execution (current usage: 4 — Plaid ×3 + OpenAI ×1)
- QuickJS engine (NOT Node.js) — no `node:crypto` or built-in modules
- 128 MB memory, 120s timeout
- Output is on-chain only — no HTTP response to caller
- BFT consensus via `cre.consensusMedianAggregation`

## Current Status

- ✅ Scoring logic complete and tested
- ✅ Plaid API integration (token exchange, balances, transactions)
- ✅ OpenAI AI calibration
- ✅ Token encryption/decryption
- ❌ No `@chainlink/cre-sdk` dependency or integration
- ❌ No WASM build pipeline
- ❌ World ID proof accepted but ignored
- ❌ `OracleWriter` interface defined but not implemented
