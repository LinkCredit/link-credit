import type { Context } from "hono";
import { getAddress } from "viem";
import { createCreJwt, hasValidApiKey, verifyWalletSignature } from "./auth";
import {
  enqueueWallet,
  nextUserRecord,
  parseAccessTokenRecord,
  readQueue,
  resolveKVStore,
  tokenKey,
} from "./store";
import type {
  AccessTokenRecord,
  EnvBindings,
  JsonObject,
  TriggerGatewayPayload,
  TriggerScoringRequest,
} from "./types";
import {
  normalizeAddress,
  parseBody,
  pickNumber,
  pickString,
  readRuntimeEnv,
  safeParseJson,
} from "./utils";

type ApiContext = Context<{ Bindings: EnvBindings }>;

function parseTriggerScoringRequest(
  body: JsonObject,
): { ok: true; value: TriggerScoringRequest } | { ok: false; error: string } {
  const publicToken = pickString(body, ["publicToken"]);
  const walletAddress = pickString(body, ["walletAddress"]);
  const signature = pickString(body, ["signature"]);

  if (!publicToken || !walletAddress || !signature) {
    return {
      ok: false,
      error: "publicToken, walletAddress, and signature are required",
    };
  }

  return {
    ok: true,
    value: {
      publicToken,
      walletAddress,
      signature,
    },
  };
}

export async function healthHandler(c: ApiContext) {
  const queue = await readQueue(c.env.ACCESS_TOKEN_KV);
  return c.json({
    status: "ok",
    queueSize: queue.length,
  });
}

export async function createLinkTokenHandler(c: ApiContext) {
  const body = await parseBody(c);
  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const userId = pickString(body, ["walletAddress", "userId"]);
  if (!userId) {
    return c.json({ error: "walletAddress or userId is required" }, 400);
  }

  const plaidClientId = readRuntimeEnv(c.env, "PLAID_CLIENT_ID");
  const plaidSecret = readRuntimeEnv(c.env, "PLAID_SECRET");
  if (!plaidClientId || !plaidSecret) {
    return c.json({ error: "Plaid secrets are not configured" }, 500);
  }

  const plaidBaseUrl =
    readRuntimeEnv(c.env, "PLAID_BASE_URL") ?? "https://sandbox.plaid.com";
  const plaidPayload = {
    client_id: plaidClientId,
    secret: plaidSecret,
    user: {
      client_user_id: userId,
    },
    client_name: "Link Credit",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
  };

  const response = await fetch(`${plaidBaseUrl}/link/token/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plaidPayload),
  });

  const raw = await response.text();
  if (!response.ok) {
    return c.json(
      {
        error: "Failed to create Plaid link token",
        plaidStatus: response.status,
        plaidBody: safeParseJson(raw) ?? raw,
      },
      502,
    );
  }

  const parsed = safeParseJson(raw);
  if (!parsed) {
    return c.json({ error: "Plaid returned a non-JSON response" }, 502);
  }

  return c.json(parsed);
}

export async function triggerScoringHandler(c: ApiContext) {
  const body = await parseBody(c);
  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseTriggerScoringRequest(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }

  const signatureMatches = await verifyWalletSignature(parsed.value);
  if (!signatureMatches) {
    return c.json({ error: "Signature verification failed" }, 401);
  }

  const workflowId = readRuntimeEnv(c.env, "CRE_WORKFLOW_ID");
  const privateKey = readRuntimeEnv(c.env, "CRE_WORKER_PRIVATE_KEY");
  if (!workflowId || !privateKey) {
    return c.json({ error: "CRE workflow configuration is missing" }, 500);
  }

  const gatewayUrl =
    readRuntimeEnv(c.env, "CRE_GATEWAY_URL") ??
    "https://gateway.chain.link/v1/workflows/execute";
  const gatewayMethod =
    readRuntimeEnv(c.env, "CRE_WORKFLOW_METHOD") ?? "workflow_execute";

  const triggerPayload: TriggerGatewayPayload = {
    publicToken: parsed.value.publicToken,
    walletAddress: getAddress(parsed.value.walletAddress),
  };

  // DO NOT DELETE - Debug log for manual workflow testing
  // Copy this output to packages/workflow/payload.json for local debugging
  console.log('=== TRIGGER PAYLOAD FOR WORKFLOW DEBUG ===');
  console.log(JSON.stringify(triggerPayload, null, 2));
  console.log('==========================================');

  const requestBody = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: gatewayMethod,
    params: {
      workflowId,
      payload: triggerPayload,
    },
  };

  const bodyText = JSON.stringify(requestBody);
  const jwt = createCreJwt({
    workflowId,
    privateKey,
    bodyText,
  });

  const gatewayResponse = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: bodyText,
  });

  const responseBody = await gatewayResponse.text();
  if (!gatewayResponse.ok) {
    return c.json(
      {
        error: "CRE gateway rejected trigger request",
        gatewayStatus: gatewayResponse.status,
        gatewayBody: safeParseJson(responseBody) ?? responseBody,
      },
      502,
    );
  }

  return c.json({
    accepted: true,
    walletAddress: triggerPayload.walletAddress,
    gateway: safeParseJson(responseBody) ?? { raw: responseBody },
  });
}

export async function accessTokenHandler(c: ApiContext) {
  if (!hasValidApiKey(c, readRuntimeEnv(c.env, "WORKER_API_KEY"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await parseBody(c);
  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const walletAddress = pickString(body, ["walletAddress"]);
  const encryptedToken = pickString(body, ["encryptedToken", "encrypted_token"]);
  const lastScore = pickNumber(body, ["lastScore", "score"]);

  if (!walletAddress || !encryptedToken) {
    return c.json({ error: "walletAddress and encryptedToken are required" }, 400);
  }

  const normalizedWallet = normalizeAddress(walletAddress);
  if (!normalizedWallet) {
    return c.json({ error: "Invalid walletAddress" }, 400);
  }

  const kv = resolveKVStore(c.env.ACCESS_TOKEN_KV);
  const key = tokenKey(normalizedWallet);
  const existingRaw = await kv.get(key);
  const existing = existingRaw ? parseAccessTokenRecord(existingRaw) : null;
  const now = new Date().toISOString();

  const nextRecord: AccessTokenRecord = {
    walletAddress: normalizedWallet,
    encryptedToken,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastScore,
  };

  await kv.put(key, JSON.stringify(nextRecord));
  await enqueueWallet(kv, normalizedWallet);

  return c.json({ ok: true, walletAddress: normalizedWallet });
}

export async function nextUserHandler(c: ApiContext) {
  if (!hasValidApiKey(c, readRuntimeEnv(c.env, "WORKER_API_KEY"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await nextUserRecord(c.env.ACCESS_TOKEN_KV);
  if (!record) {
    return c.json({ error: "Queue empty" }, 404);
  }

  return c.json({
    walletAddress: record.walletAddress,
    encryptedToken: record.encryptedToken,
    updatedAt: record.updatedAt,
    lastScore: record.lastScore,
  });
}
