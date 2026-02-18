import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { getAddress, verifyMessage } from "viem";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type JsonObject = Record<string, unknown>;

interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface EnvBindings {
  PLAID_CLIENT_ID?: string;
  PLAID_SECRET?: string;
  PLAID_BASE_URL?: string;
  CRE_GATEWAY_URL?: string;
  CRE_WORKFLOW_ID?: string;
  CRE_WORKFLOW_METHOD?: string;
  CRE_WORKER_PRIVATE_KEY?: string;
  WORKER_API_KEY?: string;
  ACCESS_TOKEN_KV: KVStore;
}

interface TriggerScoringRequest {
  publicToken: string;
  walletAddress: string;
  signature: string;
}

interface AccessTokenRecord {
  walletAddress: string;
  encryptedToken: string;
  createdAt: string;
  updatedAt: string;
  lastScore?: number;
}

interface TriggerGatewayPayload {
  publicToken: string;
  walletAddress: string;
}

interface CreJwtClaims {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  digest: string;
}

const app = new Hono<{ Bindings: EnvBindings }>();

const TOKEN_PREFIX = "wallet-token:";
const QUEUE_KEY = "users:queue";
const DEFAULT_CORS_ORIGINS = ["*"];

app.use(
  "*",
  cors({
    origin: DEFAULT_CORS_ORIGINS,
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400,
  }),
);

app.get("/health", async (c) => {
  const queue = await readQueue(c.env.ACCESS_TOKEN_KV);
  return c.json({
    status: "ok",
    queueSize: queue.length,
  });
});

async function createLinkTokenHandler(c: Context<{ Bindings: EnvBindings }>) {
  const body = await parseBody(c);
  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const userId = pickString(body, ["walletAddress", "userId"]);
  if (!userId) {
    return c.json({ error: "walletAddress or userId is required" }, 400);
  }

  const plaidClientId = c.env.PLAID_CLIENT_ID;
  const plaidSecret = c.env.PLAID_SECRET;
  if (!plaidClientId || !plaidSecret) {
    return c.json({ error: "Plaid secrets are not configured" }, 500);
  }

  const plaidBaseUrl = c.env.PLAID_BASE_URL ?? "https://sandbox.plaid.com";
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

app.post("/api/plaid/create-link-token", createLinkTokenHandler);

app.post("/link-token", createLinkTokenHandler);

app.post("/plaid/link-token", createLinkTokenHandler);

app.post("/trigger-scoring", async (c) => {
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

  const workflowId = c.env.CRE_WORKFLOW_ID;
  const privateKey = c.env.CRE_WORKER_PRIVATE_KEY;
  if (!workflowId || !privateKey) {
    return c.json({ error: "CRE workflow configuration is missing" }, 500);
  }

  const gatewayUrl =
    c.env.CRE_GATEWAY_URL ?? "https://gateway.chain.link/v1/workflows/execute";
  const gatewayMethod = c.env.CRE_WORKFLOW_METHOD ?? "workflow_execute";

  const triggerPayload: TriggerGatewayPayload = {
    publicToken: parsed.value.publicToken,
    walletAddress: getAddress(parsed.value.walletAddress),
  };

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
});

app.put("/access-token", async (c) => {
  if (!hasValidApiKey(c, c.env.WORKER_API_KEY)) {
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

  const key = tokenKey(normalizedWallet);
  const existingRaw = await c.env.ACCESS_TOKEN_KV.get(key);
  const existing = existingRaw ? parseAccessTokenRecord(existingRaw) : null;
  const now = new Date().toISOString();

  const nextRecord: AccessTokenRecord = {
    walletAddress: normalizedWallet,
    encryptedToken,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastScore,
  };

  await c.env.ACCESS_TOKEN_KV.put(key, JSON.stringify(nextRecord));
  await enqueueWallet(c.env.ACCESS_TOKEN_KV, normalizedWallet);

  return c.json({ ok: true, walletAddress: normalizedWallet });
});

app.get("/next-user", async (c) => {
  if (!hasValidApiKey(c, c.env.WORKER_API_KEY)) {
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
});

function createWalletOwnershipMessage(
  publicToken: string,
  walletAddress: string,
): string {
  return [
    "Link Credit scoring authorization",
    `publicToken:${publicToken}`,
    `walletAddress:${walletAddress}`,
  ].join("\n");
}

async function verifyWalletSignature(
  payload: TriggerScoringRequest,
): Promise<boolean> {
  const normalizedWallet = normalizeAddress(payload.walletAddress);
  if (!normalizedWallet) {
    return false;
  }

  const candidates = [
    createWalletOwnershipMessage(payload.publicToken, payload.walletAddress),
    createWalletOwnershipMessage(payload.publicToken, normalizedWallet),
  ];

  for (const message of candidates) {
    const verified = await verifyMessage({
      address: normalizedWallet,
      message,
      signature: payload.signature as `0x${string}`,
    }).catch(() => false);

    if (verified) {
      return true;
    }
  }

  return false;
}

function createCreJwt(input: {
  workflowId: string;
  privateKey: string;
  bodyText: string;
}): string {
  const privateKey = normalizePrivateKey(input.privateKey);
  const account = privateKeyToAccount(privateKey);

  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: CreJwtClaims = {
    iss: account.address,
    sub: input.workflowId,
    iat: issuedAt,
    exp: issuedAt + 300,
    digest: `0x${bytesToHex(sha256(new TextEncoder().encode(input.bodyText)))}`,
  };

  const header = {
    alg: "ES256K",
    typ: "JWT",
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedClaims = base64UrlEncodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const signatureDigest = sha256(new TextEncoder().encode(signingInput));
  const signature = secp256k1.sign(signatureDigest, hexToBytes(privateKey.slice(2)), {
    lowS: true,
  });

  const encodedSignature = base64UrlEncodeBytes(signature.toCompactRawBytes());
  return `${signingInput}.${encodedSignature}`;
}

function parseTriggerScoringRequest(body: JsonObject):
  | { ok: true; value: TriggerScoringRequest }
  | { ok: false; error: string } {
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

function normalizePrivateKey(key: string): `0x${string}` {
  const value = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("CRE_WORKER_PRIVATE_KEY must be a 32-byte hex string");
  }
  return value as `0x${string}`;
}

function tokenKey(walletAddress: string): string {
  return `${TOKEN_PREFIX}${walletAddress.toLowerCase()}`;
}

function normalizeAddress(walletAddress: string): Address | null {
  try {
    return getAddress(walletAddress);
  } catch {
    return null;
  }
}

async function parseBody(c: Context): Promise<JsonObject | null> {
  try {
    const json = await c.req.json<unknown>();
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return null;
    }
    return json as JsonObject;
  } catch {
    return null;
  }
}

function pickString(obj: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNumber(obj: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function hasValidApiKey(c: Context, expectedApiKey?: string): boolean {
  if (!expectedApiKey) {
    return false;
  }

  const xApiKey = c.req.header("x-api-key");
  const authHeader = c.req.header("authorization");
  const bearer =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : undefined;

  return xApiKey === expectedApiKey || bearer === expectedApiKey;
}

async function readQueue(kv: KVStore): Promise<string[]> {
  const raw = await kv.get(QUEUE_KEY);
  if (!raw) {
    return [];
  }

  const parsed = safeParseJson(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.toLowerCase());
}

async function writeQueue(kv: KVStore, queue: string[]): Promise<void> {
  const deduped = Array.from(new Set(queue.map((entry) => entry.toLowerCase())));
  await kv.put(QUEUE_KEY, JSON.stringify(deduped));
}

async function enqueueWallet(kv: KVStore, walletAddress: string): Promise<void> {
  const queue = await readQueue(kv);
  const lower = walletAddress.toLowerCase();
  if (!queue.includes(lower)) {
    queue.push(lower);
    await writeQueue(kv, queue);
  }
}

function parseAccessTokenRecord(raw: string): AccessTokenRecord | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const walletAddress = pickString(parsed as JsonObject, ["walletAddress"]);
  const encryptedToken = pickString(parsed as JsonObject, ["encryptedToken"]);
  const createdAt = pickString(parsed as JsonObject, ["createdAt"]);
  const updatedAt = pickString(parsed as JsonObject, ["updatedAt"]);
  const lastScore = pickNumber(parsed as JsonObject, ["lastScore"]);

  if (!walletAddress || !encryptedToken || !createdAt || !updatedAt) {
    return null;
  }

  return {
    walletAddress,
    encryptedToken,
    createdAt,
    updatedAt,
    lastScore,
  };
}

async function nextUserRecord(kv: KVStore): Promise<AccessTokenRecord | null> {
  const queue = await readQueue(kv);
  if (queue.length === 0) {
    return null;
  }

  for (let i = 0; i < queue.length; i++) {
    const wallet = queue[i];
    const recordRaw = await kv.get(tokenKey(wallet));
    const record = recordRaw ? parseAccessTokenRecord(recordRaw) : null;

    if (record) {
      // Rotate: move processed entries to the back
      const rotated = [...queue.slice(i + 1), ...queue.slice(0, i + 1)];
      await writeQueue(kv, rotated);
      return record;
    }
  }

  await writeQueue(kv, []);
  return null;
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeText(JSON.stringify(value));
}

function base64UrlEncodeText(input: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(input));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  if (typeof btoa !== "function") {
    throw new Error("btoa is unavailable in this runtime");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default {
  port: 3001,
  fetch: app.fetch,
};

export {
  createCreJwt,
  createWalletOwnershipMessage,
  nextUserRecord,
  readQueue,
  verifyWalletSignature,
  writeQueue,
};
