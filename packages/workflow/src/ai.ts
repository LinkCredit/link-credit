import type { AiAdjustment, FinancialProfile } from "./types";
import { AI_REASON_CODES, type AiReasonCode, clamp, safeJsonParse } from "./utils";

export function buildAiPrompt(profile: FinancialProfile, ruleScore: number): object {
  return {
    window_days: 30,
    income_total: profile.incomeTotal,
    spend_total: profile.spendTotal,
    net: profile.net,
    balance_total: profile.balanceTotal,
    buffer_days: profile.bufferDays,
    income_detected: profile.incomeDetected,
    income_cv: profile.incomeCv,
    discretionary_ratio: profile.discretionaryRatio,
    spend_spike_count: profile.spendSpikeCount,
    risk_flags_count: profile.riskFlagsCount,
    top_merchants: profile.topMerchants,
    rule_score: ruleScore,
  };
}

export function parseAiResponse(responseText: string): AiAdjustment {
  const rawParsed = safeJsonParse(responseText);
  if (!rawParsed || typeof rawParsed !== "object") {
    return aiUnavailable("AI output invalid");
  }

  const completionContent = extractCompletionContent(rawParsed);
  if (completionContent) {
    const parsedContent = safeJsonParse(completionContent);
    if (!parsedContent || typeof parsedContent !== "object") {
      return aiUnavailable("AI output invalid");
    }

    return parseAiObject(parsedContent);
  }

  return parseAiObject(rawParsed);
}

export function buildReasonCodes(profile: FinancialProfile, ai: AiAdjustment): string[] {
  const reasonCodes: string[] = [];

  if (profile.bufferDays >= 45) {
    reasonCodes.push("STRONG_BUFFER");
  }
  if (profile.netRatio >= 0.1) {
    reasonCodes.push("POSITIVE_NET_FLOW");
  }
  if (profile.incomeDetected && profile.incomeCv !== null && profile.incomeCv <= 0.25) {
    reasonCodes.push("STABLE_INCOME");
  }
  if (profile.discretionaryRatio > 0.45) {
    reasonCodes.push("HIGH_DISCRETIONARY_SPEND");
  }
  if (profile.spendSpikeCount > 0) {
    reasonCodes.push("SPEND_SPIKES");
  }
  if (profile.riskFlagsCount > 0) {
    reasonCodes.push("RISK_FLAGS_PRESENT");
  }
  if (reasonCodes.length === 0) {
    reasonCodes.push("NEUTRAL_PROFILE");
  }

  for (const code of ai.reasonCodes) {
    if (!reasonCodes.includes(code)) {
      reasonCodes.push(code);
    }
  }

  return reasonCodes;
}

function parseAiObject(payload: object): AiAdjustment {
  const adjustmentRaw = (payload as { adjustment?: unknown }).adjustment;
  const reasonCodesRaw = (payload as { reason_codes?: unknown }).reason_codes;
  const explanationRaw = (payload as { one_sentence_explanation?: unknown })
    .one_sentence_explanation;

  const adjustment =
    typeof adjustmentRaw === "number" && Number.isFinite(adjustmentRaw)
      ? clamp(Math.round(adjustmentRaw), -10, 10)
      : 0;

  const reasonCodes = Array.isArray(reasonCodesRaw)
    ? reasonCodesRaw
        .filter((code): code is string => typeof code === "string")
        .filter((code): code is AiReasonCode =>
          AI_REASON_CODES.includes(code as AiReasonCode),
        )
    : [];

  const explanation =
    typeof explanationRaw === "string" && explanationRaw.length > 0
      ? explanationRaw
      : "AI calibration applied";

  return {
    adjustment,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["AI_UNAVAILABLE"],
    explanation,
  };
}

function extractCompletionContent(payload: object): string | null {
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return null;
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return null;
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function aiUnavailable(explanation: string): AiAdjustment {
  return {
    adjustment: 0,
    reasonCodes: ["AI_UNAVAILABLE"],
    explanation,
  };
}
