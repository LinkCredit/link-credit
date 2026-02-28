import {
  consensusIdenticalAggregation,
  CronCapability,
  decodeJson,
  EVMClient,
  getNetwork,
  handler,
  hexToBase64,
  HTTPCapability,
  HTTPClient,
  prepareReportRequest,
  Runner,
  type CronPayload as CRECronPayload,
  type HTTPPayload,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  stringToHex,
  type Address,
} from "viem";
import { z } from "zod";

import { buildAiPrompt, parseAiResponse } from "./ai";
import { decryptAccessToken, encryptAccessToken } from "./encryption";
import { buildFinancialProfile, calculateRuleScore } from "./scoring";
import type {
  AiAdjustment,
  PlaidBalanceResponse,
  PlaidData,
  PlaidTransactionsResponse,
  TriggerPayload,
  WorkerQueueItem,
} from "./types";
import {
  AI_REASON_CODES,
  clamp,
  safeJsonParse,
  TOKEN_ENCRYPTION_SECRET,
  trimTrailingSlash,
  WORKER_API_KEY_SECRET,
} from "./utils";

const configSchema = z.object({
  chainSelectorName: z.string(),
  oracleContractAddress: z.string(),
  workerBaseUrl: z.string(),
  plaidBaseUrl: z.string().default("https://sandbox.plaid.com"),
  openAiBaseUrl: z.string().default("https://api.openai.com/v1"),
  openAiModel: z.string().default("gpt-4o-mini"),
  transactionsLookbackDays: z.number().int().positive().default(30),
});

const httpInputSchema = z.object({
  publicToken: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

type Config = z.infer<typeof configSchema>;
type HttpResponse = ReturnType<HTTPSendRequester["sendRequest"]> extends {
  result: () => infer T;
}
  ? T
  : never;

export const initWorkflow = (rawConfig: Config) => {
  const config = configSchema.parse(rawConfig);
  const http = new HTTPCapability();
  const cron = new CronCapability();

  const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    const input = parseHttpInput(payload);
    const httpClient = new HTTPClient();

    const plaidClientId = readSecret(runtime, "PLAID_CLIENT_ID");
    const plaidSecret = readSecret(runtime, "PLAID_SECRET");
    const encryptionKey = readSecret(runtime, TOKEN_ENCRYPTION_SECRET);
    const workerApiKey = readSecret(runtime, WORKER_API_KEY_SECRET);
    const openAiApiKey = readSecret(runtime, "OPENAI_API_KEY");

    const accessToken = httpClient
      .sendRequest(
        runtime,
        (requester) =>
          exchangePlaidToken(requester, config, plaidClientId, plaidSecret, input.publicToken),
        consensusIdenticalAggregation<string>(),
      )()
      .result();

    const plaidDataRaw = httpClient
      .sendRequest(
        runtime,
        (requester) =>
          JSON.stringify(
            fetchPlaidDataCRE(requester, config, plaidClientId, plaidSecret, accessToken),
          ),
        consensusIdenticalAggregation<string>(),
      )()
      .result();
    const plaidData = parsePlaidData(plaidDataRaw);

    const profile = buildFinancialProfile(plaidData.balance, plaidData.transactions);
    const rule = calculateRuleScore(profile);
    const aiPrompt = buildAiPrompt(profile, rule.score);

    const aiResult = httpClient
      .sendRequest(
        runtime,
        (requester) => callOpenAI(requester, config, openAiApiKey, aiPrompt),
        consensusIdenticalAggregation<AiAdjustment>(),
      )()
      .result();

    const score = clamp(Math.round(rule.score + aiResult.adjustment), 0, 100);
    writeScoreOnChain(runtime, config, input.walletAddress, score * 100);

    const encryptedToken = encryptAccessToken(accessToken, encryptionKey);
    httpClient
      .sendRequest(
        runtime,
        (requester) =>
          storeTokenCRE(
            requester,
            config,
            workerApiKey,
            input.walletAddress,
            encryptedToken,
            score,
          ),
        consensusIdenticalAggregation<boolean>(),
      )()
      .result();

    runtime.log(
      `[workflow] HTTP scoring complete wallet=${input.walletAddress} score=${score}`,
    );

    return "ok";
  };

  const onCronTrigger = (runtime: Runtime<Config>, _payload: CRECronPayload): string => {
    const httpClient = new HTTPClient();

    const plaidClientId = readSecret(runtime, "PLAID_CLIENT_ID");
    const plaidSecret = readSecret(runtime, "PLAID_SECRET");
    const encryptionKey = readSecret(runtime, TOKEN_ENCRYPTION_SECRET);
    const workerApiKey = readSecret(runtime, WORKER_API_KEY_SECRET);
    const openAiApiKey = readSecret(runtime, "OPENAI_API_KEY");

    const queueItem = httpClient
      .sendRequest(
        runtime,
        (requester) => fetchNextQueueItemCRE(requester, config, workerApiKey),
        consensusIdenticalAggregation<WorkerQueueItem | null>(),
      )()
      .result();

    if (!queueItem) {
      runtime.log("[workflow] Cron skipped: queue empty");
      return "skipped";
    }

    const accessToken = decryptAccessToken(queueItem.encryptedToken, encryptionKey);

    const plaidDataRaw = httpClient
      .sendRequest(
        runtime,
        (requester) =>
          JSON.stringify(
            fetchPlaidDataCRE(requester, config, plaidClientId, plaidSecret, accessToken),
          ),
        consensusIdenticalAggregation<string>(),
      )()
      .result();
    const plaidData = parsePlaidData(plaidDataRaw);

    const profile = buildFinancialProfile(plaidData.balance, plaidData.transactions);
    const rule = calculateRuleScore(profile);
    const aiPrompt = buildAiPrompt(profile, rule.score);

    const aiResult = httpClient
      .sendRequest(
        runtime,
        (requester) => callOpenAI(requester, config, openAiApiKey, aiPrompt),
        consensusIdenticalAggregation<AiAdjustment>(),
      )()
      .result();

    const score = clamp(Math.round(rule.score + aiResult.adjustment), 0, 100);
    writeScoreOnChain(runtime, config, queueItem.walletAddress, score * 100);

    httpClient
      .sendRequest(
        runtime,
        (requester) =>
          storeTokenCRE(
            requester,
            config,
            workerApiKey,
            queueItem.walletAddress,
            queueItem.encryptedToken,
            score,
          ),
        consensusIdenticalAggregation<boolean>(),
      )()
      .result();

    runtime.log(
      `[workflow] Cron scoring complete wallet=${queueItem.walletAddress} score=${score}`,
    );

    return "ok";
  };

  return [
    handler(http.trigger({ authorizedKeys: [] }), onHttpTrigger),
    handler(cron.trigger({ schedule: "0 */6 * * *" }), onCronTrigger),
  ];
};

export async function main(): Promise<void> {
  const runner = await Runner.newRunner<Config>();
  await runner.run((config) => initWorkflow(configSchema.parse(config)));
}

function parseHttpInput(payload: HTTPPayload): TriggerPayload {
  const parsed = decodeJson(payload.input);
  return httpInputSchema.parse(parsed);
}

function readSecret(runtime: Runtime<Config>, id: string): string {
  return runtime.getSecret({ id }).result().value;
}

function exchangePlaidToken(
  sendRequester: HTTPSendRequester,
  config: Config,
  plaidClientId: string,
  plaidSecret: string,
  publicToken: string,
): string {
  const response = sendRequester
    .sendRequest({
      url: `${config.plaidBaseUrl}/item/public_token/exchange`,
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: jsonBody({
        client_id: plaidClientId,
        secret: plaidSecret,
        public_token: publicToken,
      }),
    })
    .result();

  const parsed = parseJsonResponse<{ access_token?: unknown }>(response, "Plaid exchange");
  if (typeof parsed.access_token !== "string") {
    throw new Error("Plaid exchange response missing access_token");
  }

  return parsed.access_token;
}

function fetchPlaidDataCRE(
  sendRequester: HTTPSendRequester,
  config: Config,
  plaidClientId: string,
  plaidSecret: string,
  accessToken: string,
): PlaidData {
  const now = new Date();
  const startDate = new Date(
    now.getTime() - config.transactionsLookbackDays * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  const balanceResponse = sendRequester
    .sendRequest({
      url: `${config.plaidBaseUrl}/accounts/balance/get`,
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: jsonBody({
        client_id: plaidClientId,
        secret: plaidSecret,
        access_token: accessToken,
      }),
    })
    .result();

  const transactionsResponse = sendRequester
    .sendRequest({
      url: `${config.plaidBaseUrl}/transactions/get`,
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: jsonBody({
        client_id: plaidClientId,
        secret: plaidSecret,
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: {
          count: 250,
        },
      }),
    })
    .result();

  return {
    balance: parseJsonResponse<PlaidBalanceResponse>(balanceResponse, "Plaid balances"),
    transactions: parseJsonResponse<PlaidTransactionsResponse>(
      transactionsResponse,
      "Plaid transactions",
    ),
  };
}

function callOpenAI(
  sendRequester: HTTPSendRequester,
  config: Config,
  openAiApiKey: string,
  prompt: object,
): AiAdjustment {
  const response = sendRequester
    .sendRequest({
      url: `${config.openAiBaseUrl}/chat/completions`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openAiApiKey}`,
      },
      body: jsonBody({
        model: config.openAiModel,
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
    })
    .result();

  if (!responseOk(response)) {
    return {
      adjustment: 0,
      reasonCodes: ["AI_UNAVAILABLE"],
      explanation: "AI calibration unavailable",
    };
  }

  return parseAiResponse(decodeBody(response));
}

function storeTokenCRE(
  sendRequester: HTTPSendRequester,
  config: Config,
  workerApiKey: string,
  walletAddress: string,
  encryptedToken: string,
  score: number,
): boolean {
  const response = sendRequester
    .sendRequest({
      url: `${trimTrailingSlash(config.workerBaseUrl)}/access-token`,
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-api-key": workerApiKey,
      },
      body: jsonBody({
        walletAddress,
        encryptedToken,
        lastScore: score,
      }),
    })
    .result();

  if (!responseOk(response)) {
    throw new Error(`Worker /access-token failed status=${response.statusCode}`);
  }

  return true;
}

function fetchNextQueueItemCRE(
  sendRequester: HTTPSendRequester,
  config: Config,
  workerApiKey: string,
): WorkerQueueItem | null {
  const response = sendRequester
    .sendRequest({
      url: `${trimTrailingSlash(config.workerBaseUrl)}/next-user`,
      method: "GET",
      headers: {
        "x-api-key": workerApiKey,
      },
    })
    .result();

  if (response.statusCode === 404) {
    return null;
  }

  const parsed = parseJsonResponse<Record<string, unknown>>(response, "Worker queue");

  const walletAddress = parsed.walletAddress;
  const encryptedToken = parsed.encryptedToken;
  if (typeof walletAddress !== "string" || typeof encryptedToken !== "string") {
    throw new Error("Worker /next-user response missing walletAddress or encryptedToken");
  }

  return {
    walletAddress,
    encryptedToken,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    lastScore: typeof parsed.lastScore === "number" ? parsed.lastScore : undefined,
  };
}

function writeScoreOnChain(
  runtime: Runtime<Config>,
  config: Config,
  walletAddress: string,
  scoreBps: number,
): void {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unsupported chain selector name: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const reportPayload = encodeAbiParameters(
    parseAbiParameters("address user, uint256 scoreBps"),
    [walletAddress as Address, BigInt(scoreBps)],
  );

  const report = runtime.report(prepareReportRequest(reportPayload)).result();
  evmClient
    .writeReport(runtime, {
      receiver: config.oracleContractAddress,
      report,
    })
    .result();

  runtime.log(
    `[workflow] wrote on-chain score wallet=${walletAddress} scoreBps=${scoreBps}`,
  );
}

function parseJsonResponse<T>(
  response: HttpResponse,
  context: string,
): T {
  if (!responseOk(response)) {
    throw new Error(`${context} failed status=${response.statusCode}`);
  }

  const parsed = safeJsonParse(decodeBody(response));
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${context} returned invalid JSON`);
  }

  return parsed as T;
}

function parsePlaidData(raw: string): PlaidData {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Plaid data consensus payload was invalid");
  }

  return parsed as PlaidData;
}

function jsonBody(payload: object): string {
  return hexToBase64(stringToHex(JSON.stringify(payload)));
}

function decodeBody(response: HttpResponse): string {
  return new TextDecoder().decode(response.body);
}

function responseOk(response: HttpResponse): boolean {
  return response.statusCode >= 200 && response.statusCode < 300;
}
