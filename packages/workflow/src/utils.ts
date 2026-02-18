export const TOKEN_ENCRYPTION_SECRET = "TOKEN_ENCRYPTION_KEY";
export const WORKER_API_KEY_SECRET = "WORKER_API_KEY";

export const DISCRETIONARY_KEYWORDS = [
  "food",
  "drink",
  "entertainment",
  "shopping",
  "travel",
  "subscription",
  "coffee",
  "restaurant",
];

export const RISK_KEYWORDS = [
  "overdraft",
  "nsf",
  "returned",
  "insufficient",
  "late fee",
  "collections",
];

export const AI_REASON_CODES = [
  "LOW_BUFFER",
  "HIGH_BUFFER",
  "POSITIVE_NET_FLOW",
  "NEGATIVE_NET_FLOW",
  "INCOME_STABLE",
  "INCOME_UNSTABLE",
  "INCOME_SIGNAL_WEAK",
  "HIGH_DISCRETIONARY_SPEND",
  "SPEND_DISCIPLINED",
  "RISK_FLAGS_PRESENT",
  "RISK_FLAGS_NONE",
  "SPEND_SPIKES",
  "NEUTRAL_PROFILE",
  "AI_UNAVAILABLE",
] as const;

export type AiReasonCode = (typeof AI_REASON_CODES)[number];

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function percentile(sortedNumbers: number[], p: number): number {
  if (sortedNumbers.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedNumbers.length - 1,
    Math.max(0, Math.floor(p * (sortedNumbers.length - 1))),
  );

  return sortedNumbers[index] ?? 0;
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = sum(values) / values.length;
  if (mean === 0) {
    return 0;
  }

  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

export function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
