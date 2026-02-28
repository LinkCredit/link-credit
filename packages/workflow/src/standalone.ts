import { buildAiPrompt, buildReasonCodes, parseAiResponse } from "./ai";
import { decryptAccessToken, encryptAccessToken } from "./encryption";
import { buildFinancialProfile, calculateRuleScore } from "./scoring";
import type {
  AiAdjustment,
  CronPayload,
  FinancialProfile,
  PlaidBalanceResponse,
  PlaidData,
  PlaidTransactionsResponse,
  ScoreResult,
  TriggerPayload,
  WorkerQueueItem,
  WorkflowConfig,
  WorkflowDeps,
  WorkflowExecutionResult,
} from "./types";
import {
  AI_REASON_CODES,
  clamp,
  safeJsonParse,
  TOKEN_ENCRYPTION_SECRET,
  trimTrailingSlash,
  WORKER_API_KEY_SECRET,
} from "./utils";

export async function executeHttpTrigger(
  config: WorkflowConfig,
  payload: TriggerPayload,
  deps: WorkflowDeps,
): Promise<WorkflowExecutionResult> {
  assertPayload(payload);

  const logger = deps.logger ?? console;
  const accessToken = await exchangePublicToken(config, payload.publicToken, deps);
  const plaidData = await fetchPlaidData(config, accessToken, deps);
  const scoring = await scoreProfile(config, plaidData, deps);

  await deps.oracle.updateScore({
    chainSelectorName: config.chainSelectorName,
    oracleContractAddress: config.oracleContractAddress,
    walletAddress: payload.walletAddress,
    scoreBps: scoring.scoreBps,
    reasonCodes: scoring.reasons,
  });

  const encryptionSecretName =
    config.tokenEncryptionSecretName ?? TOKEN_ENCRYPTION_SECRET;
  const encryptionKey = await deps.secrets.getSecret(encryptionSecretName);
  const encryptedToken = encryptAccessToken(accessToken, encryptionKey);

  await storeEncryptedToken(config, deps, {
    walletAddress: payload.walletAddress,
    encryptedToken,
    lastScore: scoring.score,
  });

  logger.info(
    `[workflow] HTTP scoring complete wallet=${payload.walletAddress} score=${scoring.score}`,
  );

  return {
    mode: "http",
    walletAddress: payload.walletAddress,
    score: scoring.score,
    scoreBps: scoring.scoreBps,
    reasonCodes: scoring.reasons,
  };
}

export async function executeCronTrigger(
  config: WorkflowConfig,
  deps: WorkflowDeps,
  payload?: CronPayload,
): Promise<WorkflowExecutionResult> {
  const logger = deps.logger ?? console;
  if (payload?.walletAddress) {
    logger.warn(
      "[workflow] Cron payload walletAddress override is not supported by Worker queue API. Using next queued user.",
    );
  }

  const item = await fetchNextQueueItem(config, deps);

  if (!item) {
    return {
      mode: "cron",
      walletAddress: payload?.walletAddress ?? "",
      score: 0,
      scoreBps: 0,
      reasonCodes: [],
      skipped: true,
      skipReason: "QUEUE_EMPTY",
    };
  }

  const encryptionSecretName =
    config.tokenEncryptionSecretName ?? TOKEN_ENCRYPTION_SECRET;
  const encryptionKey = await deps.secrets.getSecret(encryptionSecretName);
  const accessToken = decryptAccessToken(item.encryptedToken, encryptionKey);

  const plaidData = await fetchPlaidData(config, accessToken, deps);
  const scoring = await scoreProfile(config, plaidData, deps);

  await deps.oracle.updateScore({
    chainSelectorName: config.chainSelectorName,
    oracleContractAddress: config.oracleContractAddress,
    walletAddress: item.walletAddress,
    scoreBps: scoring.scoreBps,
    reasonCodes: scoring.reasons,
  });

  logger.info(
    `[workflow] Cron scoring complete wallet=${item.walletAddress} score=${scoring.score}`,
  );

  return {
    mode: "cron",
    walletAddress: item.walletAddress,
    score: scoring.score,
    scoreBps: scoring.scoreBps,
    reasonCodes: scoring.reasons,
  };
}

export async function scoreProfile(
  config: WorkflowConfig,
  plaidData: PlaidData,
  deps: WorkflowDeps,
): Promise<ScoreResult> {
  const profile = buildFinancialProfile(plaidData.balance, plaidData.transactions);
  const rule = calculateRuleScore(profile);
  const ai = await getAiAdjustment(config, deps, profile, rule.score);
  const score = clamp(Math.round(rule.score + ai.adjustment), 0, 100);
  const reasons = buildReasonCodes(profile, ai);

  return {
    score,
    scoreBps: score * 100,
    rule,
    ai,
    reasons,
    profile,
  };
}

async function exchangePublicToken(
  config: WorkflowConfig,
  publicToken: string,
  deps: WorkflowDeps,
): Promise<string> {
  const plaidClientId = await deps.secrets.getSecret("PLAID_CLIENT_ID");
  const plaidSecret = await deps.secrets.getSecret("PLAID_SECRET");
  const response = await plaidRequest<{ access_token?: string }>(
    config,
    deps,
    "/item/public_token/exchange",
    {
      client_id: plaidClientId,
      secret: plaidSecret,
      public_token: publicToken,
    },
  );

  if (!response.access_token) {
    throw new Error("Plaid exchange response missing access_token");
  }

  return response.access_token;
}

async function fetchPlaidData(
  config: WorkflowConfig,
  accessToken: string,
  deps: WorkflowDeps,
): Promise<{
  balance: PlaidBalanceResponse;
  transactions: PlaidTransactionsResponse;
}> {
  const plaidClientId = await deps.secrets.getSecret("PLAID_CLIENT_ID");
  const plaidSecret = await deps.secrets.getSecret("PLAID_SECRET");
  const now = deps.now ? deps.now() : new Date();
  const lookbackDays = config.transactionsLookbackDays ?? 30;

  const startDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  const [balance, transactions] = await Promise.all([
    plaidRequest<PlaidBalanceResponse>(config, deps, "/accounts/balance/get", {
      client_id: plaidClientId,
      secret: plaidSecret,
      access_token: accessToken,
    }),
    plaidRequest<PlaidTransactionsResponse>(config, deps, "/transactions/get", {
      client_id: plaidClientId,
      secret: plaidSecret,
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: 250,
      },
    }),
  ]);

  return { balance, transactions };
}

async function getAiAdjustment(
  config: WorkflowConfig,
  deps: WorkflowDeps,
  profile: FinancialProfile,
  ruleScore: number,
): Promise<AiAdjustment> {
  const logger = deps.logger ?? console;
  const openAiApiKey = await deps.secrets.getSecret("OPENAI_API_KEY");
  const fetchFn = deps.fetchFn ?? fetch;
  const openAiBaseUrl = config.openAiBaseUrl ?? "https://api.openai.com/v1";
  const openAiModel = config.openAiModel ?? "gpt-4o-mini";

  const prompt = buildAiPrompt(profile, ruleScore);

  const response = await fetchFn(`${openAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You calibrate a deterministic credit score. Return JSON with keys: adjustment (integer -10..10), reason_codes (array), one_sentence_explanation.",
        },
        {
          role: "user",
          content: JSON.stringify({
            allowed_reason_codes: AI_REASON_CODES,
            profile: prompt,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn(`[workflow] OpenAI response error status=${response.status} body=${text}`);
    return {
      adjustment: 0,
      reasonCodes: ["AI_UNAVAILABLE"],
      explanation: "AI calibration unavailable",
    };
  }

  const text = await response.text();
  return parseAiResponse(text);
}

async function plaidRequest<T>(
  config: WorkflowConfig,
  deps: WorkflowDeps,
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const fetchFn = deps.fetchFn ?? fetch;
  const baseUrl = config.plaidBaseUrl ?? "https://sandbox.plaid.com";
  const response = await fetchFn(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Plaid request failed path=${path} status=${response.status} body=${text}`);
  }

  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Plaid request path=${path} returned invalid JSON`);
  }

  return parsed as T;
}

async function storeEncryptedToken(
  config: WorkflowConfig,
  deps: WorkflowDeps,
  payload: {
    walletAddress: string;
    encryptedToken: string;
    lastScore: number;
  },
): Promise<void> {
  const workerApiKeySecret =
    config.workerApiKeySecretName ?? WORKER_API_KEY_SECRET;
  const workerApiKey = await deps.secrets.getSecret(workerApiKeySecret);
  const fetchFn = deps.fetchFn ?? fetch;

  const response = await fetchFn(`${trimTrailingSlash(config.workerBaseUrl)}/access-token`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": workerApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker /access-token failed status=${response.status} body=${text}`);
  }
}

async function fetchNextQueueItem(
  config: WorkflowConfig,
  deps: WorkflowDeps,
): Promise<WorkerQueueItem | null> {
  const workerApiKeySecret =
    config.workerApiKeySecretName ?? WORKER_API_KEY_SECRET;
  const workerApiKey = await deps.secrets.getSecret(workerApiKeySecret);
  const fetchFn = deps.fetchFn ?? fetch;

  const response = await fetchFn(`${trimTrailingSlash(config.workerBaseUrl)}/next-user`, {
    method: "GET",
    headers: {
      "x-api-key": workerApiKey,
    },
  });

  if (response.status === 404) {
    return null;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Worker /next-user failed status=${response.status} body=${text}`);
  }

  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Worker /next-user returned invalid JSON");
  }

  const data = parsed as Record<string, unknown>;
  if (typeof data.walletAddress !== "string" || typeof data.encryptedToken !== "string") {
    throw new Error("Worker /next-user response missing walletAddress or encryptedToken");
  }

  return {
    walletAddress: data.walletAddress,
    encryptedToken: data.encryptedToken,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    lastScore: typeof data.lastScore === "number" ? data.lastScore : undefined,
  };
}

function assertPayload(payload: TriggerPayload): void {
  if (!payload.publicToken || !payload.walletAddress) {
    throw new Error("publicToken and walletAddress are required in HTTP trigger payload");
  }
}
