from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class ScoreResult:
    rule_score: int
    ai_adjustment: int
    final_score: int
    score_bps: int
    reasons: List[str]
    ai_reason_codes: List[str]
    ai_explanation: str
    features: Dict[str, float]
    model_version: str


REASON_CODE_WHITELIST = {
    "LOW_BUFFER",
    "HIGH_BUFFER",
    "POSITIVE_NET_FLOW",
    "NEGATIVE_NET_FLOW",
    "INCOME_STABLE",
    "INCOME_UNSTABLE",
    "INCOME_SIGNAL_WEAK",
    "HIGH_DISCRETIONARY_SPEND",
    "SPEND_DISCIPLINED",
    "SPEND_SPIKES",
    "RISK_FLAGS_PRESENT",
    "RISK_FLAGS_NONE",
    "NEUTRAL_PROFILE",
}


def _band_score_by_min(value: float, bands: List[Dict[str, float]]) -> int:
    for band in bands:
        if value >= float(band["min"]):
            return int(band["score"])
    return int(bands[-1]["score"])


def _band_score_by_max(value: float, bands: List[Dict[str, float]]) -> int:
    for band in bands:
        if value <= float(band["max"]):
            return int(band["score"])
    return int(bands[-1]["score"])


def _normalize_name(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t


def _percentile(sorted_values: List[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    d0 = sorted_values[f] * (c - k)
    d1 = sorted_values[c] * (k - f)
    return d0 + d1


def _parse_date(iso_date: str) -> datetime:
    return datetime.strptime(iso_date, "%Y-%m-%d")


def _tx_text(tx: Dict[str, Any]) -> str:
    parts = [
        str(tx.get("name", "")),
        str(tx.get("merchant_name", "")),
        str(tx.get("original_description", "")),
    ]
    pfc = tx.get("personal_finance_category") or {}
    parts.append(str(pfc.get("primary", "")))
    parts.append(str(pfc.get("detailed", "")))
    if tx.get("category"):
        parts.extend(str(c) for c in tx.get("category", []))
    return " ".join(parts).lower()


def _count_risk_flags(transactions: Iterable[Dict[str, Any]], keywords: List[str]) -> int:
    count = 0
    for tx in transactions:
        text = _tx_text(tx)
        if any(k in text for k in keywords):
            count += 1
    return count


def _sum_balances(accounts: Iterable[Dict[str, Any]]) -> float:
    total = 0.0
    for a in accounts:
        balances = a.get("balances", {})
        current = balances.get("current")
        if isinstance(current, (int, float)):
            total += float(current)
    return max(total, 0.0)


def _income_cluster_stats(income_txs: List[Dict[str, Any]]) -> Tuple[bool, float, bool]:
    if len(income_txs) < 2:
        return False, 0.0, False

    clusters: Dict[str, List[Dict[str, Any]]] = {}
    for tx in income_txs:
        key = _normalize_name(str(tx.get("merchant_name") or tx.get("name") or "income"))
        clusters.setdefault(key, []).append(tx)

    cluster = max(clusters.values(), key=len)
    if len(cluster) < 2:
        return False, 0.0, False

    amounts = [abs(float(tx.get("amount", 0.0))) for tx in cluster]
    amt_mean = mean(amounts)
    if amt_mean <= 0:
        return True, 1.0, False

    cv = pstdev(amounts) / amt_mean if len(amounts) > 1 else 0.0

    dates = sorted(_parse_date(tx["date"]) for tx in cluster if tx.get("date"))
    periodic = False
    if len(dates) >= 3:
        intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        if intervals:
            avg_gap = sum(intervals) / len(intervals)
            periodic = (11 <= avg_gap <= 17) or (25 <= avg_gap <= 35)

    return True, cv, periodic


def _discretionary_ratio(spend_txs: Iterable[Dict[str, Any]], discretionary_keywords: List[str]) -> float:
    spend_total = 0.0
    discretionary_total = 0.0
    for tx in spend_txs:
        amt = float(tx.get("amount", 0.0))
        if amt <= 0:
            continue
        spend_total += amt
        text = _tx_text(tx)
        if any(k in text for k in discretionary_keywords):
            discretionary_total += amt
    if spend_total <= 0:
        return 0.0
    return discretionary_total / spend_total


def _spend_spike_count(spend_amounts: List[float], absolute_floor: float, multiplier: float) -> int:
    if not spend_amounts:
        return 0
    sorted_amts = sorted(spend_amounts)
    p95 = _percentile(sorted_amts, 0.95)
    threshold = max(absolute_floor, p95 * multiplier)
    return sum(1 for x in spend_amounts if x > threshold)


def _top_merchants(spend_txs: Iterable[Dict[str, Any]], limit: int = 5) -> List[Dict[str, Any]]:
    buckets: Dict[str, Dict[str, float]] = {}
    for tx in spend_txs:
        amount = float(tx.get("amount", 0.0))
        if amount <= 0:
            continue
        raw = str(tx.get("merchant_name") or tx.get("name") or "UNKNOWN").strip()
        key = raw if raw else "UNKNOWN"
        item = buckets.setdefault(key, {"count": 0.0, "total": 0.0})
        item["count"] += 1.0
        item["total"] += amount
    ranked = sorted(buckets.items(), key=lambda kv: (kv[1]["total"], kv[1]["count"]), reverse=True)
    out: List[Dict[str, Any]] = []
    for name, stats in ranked[:limit]:
        out.append(
            {
                "name": name,
                "count": int(stats["count"]),
                "total": round(stats["total"], 2),
            }
        )
    return out


def _extract_json_object(text: str) -> Dict[str, Any]:
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return json.loads(text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError("No JSON object found in LLM response")


def _request_ai_adjustment(summary: Dict[str, Any], config: Dict[str, Any]) -> Tuple[int, List[str], str]:
    llm_cfg = config.get("llm", {})
    selected_provider = str(llm_cfg.get("selected_provider", "none")).strip().lower()
    max_adj = int(llm_cfg.get("max_adjustment_abs", 10))

    if selected_provider in {"", "none"}:
        return 0, [], "LLM calibration disabled by config."

    providers = llm_cfg.get("providers", {})
    provider_cfg = providers.get(selected_provider)
    if not provider_cfg:
        return 0, ["NEUTRAL_PROFILE"], f"Unknown LLM provider '{selected_provider}', fallback to 0 adjustment."

    api_key = os.environ.get(str(provider_cfg.get("api_key_env", "")).strip(), "").strip()
    if not api_key:
        return 0, [], f"Missing API key env for provider '{selected_provider}', fallback to 0 adjustment."

    base_url = str(provider_cfg.get("base_url", "")).rstrip("/")
    model = str(provider_cfg.get("model", "")).strip()
    if not base_url or not model:
        return 0, ["NEUTRAL_PROFILE"], "Missing LLM base_url/model in config, fallback to 0 adjustment."

    endpoint = f"{base_url}/chat/completions"
    timeout_seconds = int(llm_cfg.get("timeout_seconds", 30))

    system_prompt = (
        "You are a credit score calibration assistant. "
        "Given a deterministic rule score summary, return a bounded adjustment only. "
        "Output JSON only with keys: adjustment (int), reason_codes (string array), one_sentence_explanation (string). "
        "Rules: adjustment must be integer in [-10, 10]. "
        "Use reason_codes from whitelist only."
    )
    user_prompt = json.dumps(
        {
            "reason_code_whitelist": sorted(REASON_CODE_WHITELIST),
            "summary": summary,
        },
        ensure_ascii=True,
    )

    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    req = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=timeout_seconds) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        content = raw["choices"][0]["message"]["content"]
        parsed = _extract_json_object(content)

        adj = int(parsed.get("adjustment", 0))
        adj = max(-max_adj, min(max_adj, adj))

        codes_raw = parsed.get("reason_codes", [])
        codes: List[str] = []
        if isinstance(codes_raw, list):
            for c in codes_raw:
                code = str(c).strip().upper()
                if code in REASON_CODE_WHITELIST and code not in codes:
                    codes.append(code)

        explanation = str(parsed.get("one_sentence_explanation", "")).strip()
        if not explanation:
            explanation = "LLM calibration completed."
        if len(explanation) > 220:
            explanation = explanation[:220]

        return adj, codes, explanation
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as err:
        return 0, [], f"LLM calibration failed ({err.__class__.__name__}), fallback to 0 adjustment."


def calculate_credit_score(
    accounts: List[Dict[str, Any]],
    transactions: List[Dict[str, Any]],
    config: Dict[str, Any],
) -> ScoreResult:
    scfg = config["score"]

    income_txs = [tx for tx in transactions if float(tx.get("amount", 0.0)) < 0]
    spend_txs = [tx for tx in transactions if float(tx.get("amount", 0.0)) > 0]

    income_total = sum(abs(float(tx.get("amount", 0.0))) for tx in income_txs)
    spend_total = sum(float(tx.get("amount", 0.0)) for tx in spend_txs)
    net = income_total - spend_total
    net_ratio = net / max(income_total, 1.0)

    balance_total = _sum_balances(accounts)
    daily_spend = spend_total / 30.0
    buffer_days = balance_total / max(daily_spend, 1.0)

    income_detected, income_cv, periodic_bonus = _income_cluster_stats(income_txs)
    discretionary_ratio = _discretionary_ratio(spend_txs, scfg["discretionary_keywords"])

    spend_amounts = [float(tx.get("amount", 0.0)) for tx in spend_txs]
    spike_cfg = scfg["spike"]
    spikes = _spend_spike_count(
        spend_amounts,
        float(spike_cfg["absolute_floor_usd"]),
        float(spike_cfg["relative_multiplier"]),
    )

    risk_flags = _count_risk_flags(transactions, scfg["risk_keywords"])

    s_buf = _band_score_by_min(buffer_days, scfg["buffer_days_bands"])
    s_net = _band_score_by_min(net_ratio, scfg["net_ratio_bands"])

    if income_detected:
        s_inc = _band_score_by_max(income_cv, scfg["income_cv_bands"])
        if periodic_bonus:
            s_inc = min(100, s_inc + 10)
    else:
        s_inc = 55

    s_spend_base = _band_score_by_max(discretionary_ratio, scfg["discretionary_ratio_bands"])
    spike_penalty = min(
        int(spike_cfg["max_penalty"]),
        spikes * int(spike_cfg["per_spike_penalty"]),
    )
    s_spend = max(0, s_spend_base - spike_penalty)

    if risk_flags == 0:
        s_risk = 100
    elif risk_flags == 1:
        s_risk = 70
    elif risk_flags == 2:
        s_risk = 45
    else:
        s_risk = 20

    w = scfg["weights"]
    rule_score = round(
        float(w["buffer"]) * s_buf
        + float(w["net_flow"]) * s_net
        + float(w["income_stability"]) * s_inc
        + float(w["spend_discipline"]) * s_spend
        + float(w["risk_flags"]) * s_risk
    )

    llm_summary = {
        "window_days": 30,
        "income_total": round(income_total, 2),
        "spend_total": round(spend_total, 2),
        "net": round(net, 2),
        "balance_total": round(balance_total, 2),
        "buffer_days": round(buffer_days, 2),
        "income_detected": income_detected,
        "income_cv": round(income_cv, 4) if income_detected else None,
        "discretionary_ratio": round(discretionary_ratio, 4),
        "spend_spike_count": spikes,
        "risk_flags_count": risk_flags,
        "top_merchants": _top_merchants(spend_txs),
        "rule_score": rule_score,
    }

    ai_adjustment, ai_reason_codes, ai_explanation = _request_ai_adjustment(llm_summary, config)
    if ai_adjustment == 0 and not ai_reason_codes:
        ai_adjustment = int(scfg["model"].get("ai_adjustment_default", 0))

    final_score = max(0, min(100, rule_score + ai_adjustment))

    reasons: List[str] = []
    if buffer_days >= 45:
        reasons.append("STRONG_BUFFER")
    if net_ratio >= 0.10:
        reasons.append("POSITIVE_NET_FLOW")
    if income_detected and income_cv <= 0.25:
        reasons.append("STABLE_INCOME")
    if discretionary_ratio > 0.45:
        reasons.append("HIGH_DISCRETIONARY_SPEND")
    if spikes > 0:
        reasons.append("SPEND_SPIKES")
    if risk_flags > 0:
        reasons.append("RISK_FLAGS_PRESENT")
    if not reasons:
        reasons.append("NEUTRAL_PROFILE")
    for code in ai_reason_codes:
        if code not in reasons:
            reasons.append(code)

    return ScoreResult(
        rule_score=rule_score,
        ai_adjustment=ai_adjustment,
        final_score=final_score,
        score_bps=final_score * 100,
        reasons=reasons,
        ai_reason_codes=ai_reason_codes,
        ai_explanation=ai_explanation,
        model_version=str(scfg["model"].get("version", "rule-v1")),
        features={
            "income_total": round(income_total, 2),
            "spend_total": round(spend_total, 2),
            "net": round(net, 2),
            "net_ratio": round(net_ratio, 4),
            "balance_total": round(balance_total, 2),
            "buffer_days": round(buffer_days, 2),
            "income_cv": round(income_cv, 4) if income_detected else -1.0,
            "discretionary_ratio": round(discretionary_ratio, 4),
            "spend_spike_count": float(spikes),
            "risk_flags_count": float(risk_flags),
        },
    )
