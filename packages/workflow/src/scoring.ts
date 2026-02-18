import type {
  FinancialProfile,
  PlaidBalanceResponse,
  PlaidTransaction,
  PlaidTransactionsResponse,
  RuleBreakdown,
} from "./types";
import {
  clamp,
  coefficientOfVariation,
  DISCRETIONARY_KEYWORDS,
  percentile,
  RISK_KEYWORDS,
  round2,
  round4,
  sum,
} from "./utils";

export function buildFinancialProfile(
  balanceResponse: PlaidBalanceResponse,
  transactionsResponse: PlaidTransactionsResponse,
): FinancialProfile {
  const accounts = balanceResponse.accounts ?? [];
  const transactions = transactionsResponse.transactions ?? [];

  const incomes: PlaidTransaction[] = [];
  const spends: PlaidTransaction[] = [];

  for (const tx of transactions) {
    if (!Number.isFinite(tx.amount)) {
      continue;
    }

    if (tx.amount < 0) {
      incomes.push(tx);
    } else if (tx.amount > 0) {
      spends.push(tx);
    }
  }

  const incomeAmounts = incomes.map((tx) => Math.abs(tx.amount));
  const spendAmounts = spends.map((tx) => tx.amount);

  const incomeTotal = sum(incomeAmounts);
  const spendTotal = sum(spendAmounts);
  const net = incomeTotal - spendTotal;
  const balanceTotal = sum(
    accounts.map((account) => {
      const current = account.balances?.current;
      const available = account.balances?.available;

      if (typeof current === "number") {
        return current;
      }

      return typeof available === "number" ? available : 0;
    }),
  );

  const dailySpend = spendTotal / 30;
  const bufferDays = balanceTotal / Math.max(dailySpend, 1);
  const netRatio = net / Math.max(incomeTotal, 1);

  const clusterResult = incomeClusterStats(incomes);
  const incomeCv = clusterResult.detected ? clusterResult.cv : null;
  const incomeDetected = clusterResult.detected;
  const incomePeriodicBonus = clusterResult.periodic;

  const discretionarySpend = spends
    .filter((tx) => isDiscretionarySpend(tx))
    .reduce((acc, tx) => acc + tx.amount, 0);
  const discretionaryRatio = discretionarySpend / Math.max(spendTotal, 1);

  const spendSpikeCount = countSpendSpikes(spendAmounts);
  const riskFlagsCount = spends.filter((tx) => hasRiskFlag(tx)).length;

  const merchantAgg = new Map<string, { count: number; total: number }>();
  for (const tx of spends) {
    const name = normalizeMerchantName(tx);
    if (!name) {
      continue;
    }

    const current = merchantAgg.get(name) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += tx.amount;
    merchantAgg.set(name, current);
  }

  const topMerchants = [...merchantAgg.entries()]
    .map(([name, stats]) => ({ name, count: stats.count, total: round2(stats.total) }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);

  return {
    incomeTotal: round2(incomeTotal),
    spendTotal: round2(spendTotal),
    net: round2(net),
    balanceTotal: round2(balanceTotal),
    dailySpend: round2(dailySpend),
    bufferDays: round2(bufferDays),
    netRatio: round4(netRatio),
    incomeCv: incomeCv === null ? null : round4(incomeCv),
    incomeDetected,
    incomePeriodicBonus,
    discretionaryRatio: round4(discretionaryRatio),
    spendSpikeCount,
    riskFlagsCount,
    topMerchants,
  };
}

export function calculateRuleScore(profile: FinancialProfile): RuleBreakdown {
  const buffer = scoreBuffer(profile.bufferDays);
  const netFlow = scoreNetFlow(profile.netRatio);
  const incomeStability = scoreIncomeStability(
    profile.incomeDetected,
    profile.incomeCv,
    profile.incomePeriodicBonus,
  );
  const spendDiscipline = scoreSpendDiscipline(
    profile.discretionaryRatio,
    profile.spendSpikeCount,
  );
  const riskFlags = scoreRiskFlags(profile.riskFlagsCount);

  const weightedScore =
    0.3 * buffer +
    0.25 * netFlow +
    0.2 * incomeStability +
    0.15 * spendDiscipline +
    0.1 * riskFlags;

  return {
    buffer,
    netFlow,
    incomeStability,
    spendDiscipline,
    riskFlags,
    score: Math.round(weightedScore),
  };
}

export function scoreBuffer(bufferDays: number): number {
  if (bufferDays >= 90) {
    return 100;
  }
  if (bufferDays >= 60) {
    return 85;
  }
  if (bufferDays >= 30) {
    return 70;
  }
  if (bufferDays >= 14) {
    return 50;
  }
  if (bufferDays >= 7) {
    return 35;
  }
  return 15;
}

export function scoreNetFlow(netRatio: number): number {
  if (netRatio >= 0.25) {
    return 100;
  }
  if (netRatio >= 0.1) {
    return 80;
  }
  if (netRatio >= 0) {
    return 60;
  }
  if (netRatio >= -0.1) {
    return 40;
  }
  return 20;
}

export function scoreIncomeStability(
  incomeDetected: boolean,
  incomeCv: number | null,
  periodicBonus: boolean = false,
): number {
  if (!incomeDetected || incomeCv === null) {
    return 55;
  }

  let score: number;
  if (incomeCv <= 0.1) {
    score = 100;
  } else if (incomeCv <= 0.25) {
    score = 80;
  } else if (incomeCv <= 0.5) {
    score = 60;
  } else {
    score = 40;
  }

  if (periodicBonus) {
    score = Math.min(100, score + 10);
  }

  return score;
}

export function scoreSpendDiscipline(
  discretionaryRatio: number,
  spendSpikeCount: number,
): number {
  let score = 35;
  if (discretionaryRatio <= 0.25) {
    score = 90;
  } else if (discretionaryRatio <= 0.45) {
    score = 70;
  } else if (discretionaryRatio <= 0.65) {
    score = 50;
  }

  return clamp(score - Math.min(spendSpikeCount * 5, 20), 0, 100);
}

export function scoreRiskFlags(riskFlagsCount: number): number {
  if (riskFlagsCount <= 0) {
    return 100;
  }
  if (riskFlagsCount === 1) {
    return 70;
  }
  if (riskFlagsCount === 2) {
    return 45;
  }
  return 20;
}

export function txSearchText(tx: PlaidTransaction): string {
  return [
    tx.name ?? "",
    tx.merchant_name ?? "",
    tx.original_description ?? "",
    tx.personal_finance_category?.primary ?? "",
    tx.personal_finance_category?.detailed ?? "",
    ...(tx.category ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function isDiscretionarySpend(tx: PlaidTransaction): boolean {
  const searchable = txSearchText(tx);
  return DISCRETIONARY_KEYWORDS.some((keyword) => searchable.includes(keyword));
}

export function hasRiskFlag(tx: PlaidTransaction): boolean {
  const searchable = txSearchText(tx);
  return RISK_KEYWORDS.some((keyword) => searchable.includes(keyword));
}

export function normalizeMerchantName(tx: PlaidTransaction): string | null {
  const name = tx.merchant_name ?? tx.name;
  if (!name) {
    return null;
  }

  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function incomeClusterStats(
  incomeTxs: PlaidTransaction[],
): { detected: boolean; cv: number; periodic: boolean } {
  if (incomeTxs.length < 2) {
    return { detected: false, cv: 0, periodic: false };
  }

  const clusters = new Map<string, PlaidTransaction[]>();
  for (const tx of incomeTxs) {
    const key = normalizeMerchantName(tx) ?? "income";
    const group = clusters.get(key) ?? [];
    group.push(tx);
    clusters.set(key, group);
  }

  let largestCluster: PlaidTransaction[] = [];
  for (const cluster of clusters.values()) {
    if (cluster.length > largestCluster.length) {
      largestCluster = cluster;
    }
  }

  if (largestCluster.length < 2) {
    return { detected: false, cv: 0, periodic: false };
  }

  const amounts = largestCluster.map((tx) => Math.abs(tx.amount));
  const meanAmount = sum(amounts) / amounts.length;
  if (meanAmount <= 0) {
    return { detected: true, cv: 1, periodic: false };
  }

  const cv = coefficientOfVariation(amounts);
  const dates = largestCluster
    .filter((tx): tx is PlaidTransaction & { date: string } => typeof tx.date === "string")
    .map((tx) => new Date(tx.date).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);

  let periodic = false;
  if (dates.length >= 3) {
    const intervals: number[] = [];
    for (let index = 1; index < dates.length; index += 1) {
      const previousDate = dates[index - 1];
      const currentDate = dates[index];
      if (previousDate === undefined || currentDate === undefined) {
        continue;
      }

      const intervalDays = Math.round(
        (currentDate - previousDate) / (24 * 60 * 60 * 1000),
      );
      intervals.push(intervalDays);
    }

    if (intervals.length > 0) {
      const averageGap = sum(intervals) / intervals.length;
      periodic =
        (averageGap >= 11 && averageGap <= 17) ||
        (averageGap >= 25 && averageGap <= 35);
    }
  }

  return { detected: true, cv, periodic };
}

export function countSpendSpikes(spendAmounts: number[]): number {
  if (spendAmounts.length === 0) {
    return 0;
  }

  const sorted = [...spendAmounts].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  const threshold = Math.max(300, p95 * 1.5);
  return spendAmounts.filter((amount) => amount > threshold).length;
}
