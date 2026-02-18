export interface WorkflowConfig {
  chainSelectorName: string;
  oracleContractAddress: string;
  workerBaseUrl: string;
  plaidBaseUrl?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  transactionsLookbackDays?: number;
  tokenEncryptionSecretName?: string;
  workerApiKeySecretName?: string;
}

export interface TriggerPayload {
  publicToken: string;
  walletAddress: string;
}

export interface CronPayload {
  walletAddress?: string;
}

export interface WorkerQueueItem {
  walletAddress: string;
  encryptedToken: string;
  updatedAt?: string;
  lastScore?: number;
}

export interface WorkflowSecretsProvider {
  getSecret(name: string): Promise<string>;
}

export interface OracleWriter {
  updateScore(input: {
    chainSelectorName: string;
    oracleContractAddress: string;
    walletAddress: string;
    scoreBps: number;
    reasonCodes: string[];
  }): Promise<void>;
}

export interface WorkflowDeps {
  secrets: WorkflowSecretsProvider;
  oracle: OracleWriter;
  fetchFn?: typeof fetch;
  logger?: Pick<Console, "info" | "warn" | "error">;
  now?: () => Date;
}

export interface PlaidAccount {
  balances?: {
    current?: number | null;
    available?: number | null;
  };
}

export interface PlaidTransaction {
  amount: number;
  date?: string;
  name?: string;
  merchant_name?: string;
  original_description?: string;
  category?: string[];
  personal_finance_category?: {
    primary?: string;
    detailed?: string;
  };
}

export interface PlaidBalanceResponse {
  accounts?: PlaidAccount[];
}

export interface PlaidTransactionsResponse {
  transactions?: PlaidTransaction[];
}

export interface PlaidData {
  balance: PlaidBalanceResponse;
  transactions: PlaidTransactionsResponse;
}

export interface FinancialProfile {
  incomeTotal: number;
  spendTotal: number;
  net: number;
  balanceTotal: number;
  dailySpend: number;
  bufferDays: number;
  netRatio: number;
  incomeCv: number | null;
  incomeDetected: boolean;
  incomePeriodicBonus: boolean;
  discretionaryRatio: number;
  spendSpikeCount: number;
  riskFlagsCount: number;
  topMerchants: Array<{
    name: string;
    count: number;
    total: number;
  }>;
}

export interface RuleBreakdown {
  buffer: number;
  netFlow: number;
  incomeStability: number;
  spendDiscipline: number;
  riskFlags: number;
  score: number;
}

export interface AiAdjustment {
  adjustment: number;
  reasonCodes: string[];
  explanation: string;
}

export interface ScoreResult {
  score: number;
  scoreBps: number;
  rule: RuleBreakdown;
  ai: AiAdjustment;
  reasons: string[];
  profile: FinancialProfile;
}

export interface WorkflowExecutionResult {
  mode: "http" | "cron";
  walletAddress: string;
  score: number;
  scoreBps: number;
  reasonCodes: string[];
  skipped?: boolean;
  skipReason?: string;
}
