from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, List, Tuple


@dataclass
class ScoreResult:
    rule_score: int
    ai_adjustment: int
    final_score: int
    score_bps: int
    reasons: List[str]
    features: Dict[str, float]
    model_version: str


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

    return ScoreResult(
        rule_score=rule_score,
        ai_adjustment=ai_adjustment,
        final_score=final_score,
        score_bps=final_score * 100,
        reasons=reasons,
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
