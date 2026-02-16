# Link Credit

Link Credit is a DeFi demo that turns traditional finance data (Plaid) into an on-chain credit score, then uses that score to support variable collateral lending.

## 1) Implemented: Plaid Data Pipeline + Credit Scoring

This part is implemented as an independent backend-style loop under `src/tests/`:

- `src/tests/plaid_fetch.py`: calls real Plaid Sandbox APIs to fetch account balances and transactions
- `src/tests/score_calculator.py`: computes a deterministic 0-100 credit score from financial behavior
- `src/tests/test_credit_flow.py`: runs end-to-end tests with two personas (`high_credit` vs `low_credit`)
- `config.yaml`: central config for Plaid and scoring thresholds/weights

### 1.1 Data Flow

```mermaid
flowchart LR
  A[Sandbox Persona] --> B[/sandbox/public_token/create]
  B --> C["/item/public_token/exchange"]
  C --> D["/accounts/balance/get"]
  C --> E["/transactions/get"]
  D --> F[Feature Extraction]
  E --> F
  F --> G[Rule-Based Score 0-100]
  G --> H[Score in BPS = score * 100]
```

### 1.2 Scoring Formula

The current scorer is deterministic and explainable:

`S_rule = 0.30*S_buf + 0.25*S_net + 0.20*S_inc + 0.15*S_spend + 0.10*S_risk`

- `S_buf`: balance safety buffer
- `S_net`: net cash flow quality
- `S_inc`: income stability
- `S_spend`: spending discipline
- `S_risk`: risk event penalty (e.g. overdraft/NSF keywords)

Final on-chain-ready output:

`scoreBps = S * 100, where S in [0, 100]`

### 1.3 Example

- High-credit persona result (example): `S = 84`, `scoreBps = 8400`
- Low-credit persona result (example): `S = 49`, `scoreBps = 4900`

This verifies the pipeline can produce materially different scores for different financial profiles.

## 2) CRE Workflow Integration

## 3) Smart Contracts + Variable Collateral Lending
