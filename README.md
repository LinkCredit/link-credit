# Link Credit

Link Credit is a hackathon-first DeFi credit layer: users connect real bank activity through Plaid, get a privacy-aware credit score, and unlock better borrowing terms on-chain.

## 1) Implemented: Plaid Data Pipeline + Credit Scoring

This part is already shipped as an independent, testable scoring loop under `src/tests/`:

- `src/tests/plaid_fetch.py`: pulls real Plaid Sandbox balances + transactions
- `src/tests/score_calculator.py`: computes rule score, then lets an AI agent apply a bounded calibration
- `src/tests/test_credit_flow.py`: runs end-to-end for `high_credit` vs `low_credit`
- `config.yaml`: single place for thresholds, weights, and LLM provider routing

### 1.1 Data Flow

```text
[Sandbox Persona]
   -> /sandbox/public_token/create
   -> /item/public_token/exchange
   -> /accounts/balance/get + /transactions/get
   -> Feature extraction
   -> Rule score S_rule (0-100)
   -> Agent input: compressed feature summary + S_rule
   -> Agent output: delta_ai (-10 to +10) + reason codes
   -> Final score S = clamp(S_rule + delta_ai, 0, 100)
   -> scoreBps = S * 100
```

### 1.2 Scoring Formula

The scorer is deterministic-first and agent-calibrated:

`S_rule = 0.30*S_buf + 0.25*S_net + 0.20*S_inc + 0.15*S_spend + 0.10*S_risk`  
`S = clamp(S_rule + delta_ai, 0, 100), where delta_ai in [-10, 10]`

- `S_buf`: balance safety buffer
- `S_net`: net cash flow quality
- `S_inc`: income stability
- `S_spend`: spending discipline
- `S_risk`: risk event penalty (e.g. overdraft/NSF keywords)

Why add agent calibration:
- Keep deterministic scoring as the anchor for reproducibility
- Add limited human-like judgment for edge cases without letting model drift dominate
- Return short reason codes/explanations for demo transparency

Final on-chain-ready output:

`scoreBps = S * 100`

### 1.3 Example

- High-credit persona (example): `S = 84`, `scoreBps = 8400`
- Low-credit persona (example): `S = 49`, `scoreBps = 4900`

This shows clear score separation for different financial behaviors in a hackathon demo setting.

## 2) CRE Workflow Integration

## 3) Smart Contracts + Variable Collateral Lending
