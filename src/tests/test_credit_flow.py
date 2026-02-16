from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import yaml

from plaid_fetch import build_client
from score_calculator import calculate_credit_score


ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "config.yaml"


def load_config(path: Path) -> Dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def run_flow() -> Dict[str, Any]:
    config = load_config(CONFIG_PATH)
    client = build_client(CONFIG_PATH)

    personas = config["plaid"]["sandbox_personas"]
    results: Dict[str, Any] = {}

    for label, username in personas.items():
        profile = client.fetch_profile_from_sandbox_user(username)
        score = calculate_credit_score(
            accounts=profile["accounts"],
            transactions=profile["transactions"],
            config=config,
        )
        results[label] = {
            "username": username,
            "accounts_count": len(profile["accounts"]),
            "transactions_count": len(profile["transactions"]),
            "score": {
                "rule_score": score.rule_score,
                "ai_adjustment": score.ai_adjustment,
                "final_score": score.final_score,
                "score_bps": score.score_bps,
                "reasons": score.reasons,
                "features": score.features,
                "model_version": score.model_version,
            },
        }

    high = results["high_credit"]["score"]["final_score"]
    low = results["low_credit"]["score"]["final_score"]

    assert 0 <= high <= 100, "High-credit score out of range"
    assert 0 <= low <= 100, "Low-credit score out of range"
    assert high > low, f"Expected high_credit > low_credit, got {high} <= {low}"
    assert (high - low) >= 10, f"Expected score gap >= 10, got gap={high - low}"

    return results


if __name__ == "__main__":
    payload = run_flow()
    print(json.dumps(payload, indent=2))
