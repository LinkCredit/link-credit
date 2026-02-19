import type { AccessTokenRecord, JsonObject, KVStore } from "./types";
import { pickNumber, pickString, safeParseJson } from "./utils";

const TOKEN_PREFIX = "wallet-token:";
const QUEUE_KEY = "users:queue";
const localStore = new Map<string, string>();
let localStoreWarningShown = false;

function readProcessEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function shouldUseLocalFallback(): boolean {
  const env = readProcessEnv();
  if (!env) {
    return false;
  }

  const explicitFlag = env.ALLOW_IN_MEMORY_KV_FALLBACK;
  if (typeof explicitFlag === "string" && explicitFlag.trim().length > 0) {
    return parseBoolean(explicitFlag);
  }

  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  return nodeEnv === "development" || nodeEnv === "test";
}

function getLocalKVStore(): KVStore {
  if (!localStoreWarningShown) {
    localStoreWarningShown = true;
    console.warn(
      "[api] ACCESS_TOKEN_KV is missing; using in-memory KV fallback for local development.",
    );
  }

  return {
    get(key: string) {
      return Promise.resolve(localStore.get(key) ?? null);
    },
    put(key: string, value: string) {
      localStore.set(key, value);
      return Promise.resolve();
    },
  };
}

export function resolveKVStore(kv?: KVStore): KVStore {
  if (kv) {
    return kv;
  }

  if (shouldUseLocalFallback()) {
    return getLocalKVStore();
  }

  throw new Error(
    "ACCESS_TOKEN_KV binding is required. Set ALLOW_IN_MEMORY_KV_FALLBACK=true for local development fallback.",
  );
}

export function tokenKey(walletAddress: string): string {
  return `${TOKEN_PREFIX}${walletAddress.toLowerCase()}`;
}

export async function readQueue(kv?: KVStore): Promise<string[]> {
  const raw = await resolveKVStore(kv).get(QUEUE_KEY);
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

export async function writeQueue(kv: KVStore, queue: string[]): Promise<void> {
  const deduped = Array.from(new Set(queue.map((entry) => entry.toLowerCase())));
  await kv.put(QUEUE_KEY, JSON.stringify(deduped));
}

export async function enqueueWallet(
  kv: KVStore | undefined,
  walletAddress: string,
): Promise<void> {
  const store = resolveKVStore(kv);
  const queue = await readQueue(store);
  const lower = walletAddress.toLowerCase();
  if (!queue.includes(lower)) {
    queue.push(lower);
    await writeQueue(store, queue);
  }
}

export function parseAccessTokenRecord(raw: string): AccessTokenRecord | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const obj = parsed as JsonObject;
  const walletAddress = pickString(obj, ["walletAddress"]);
  const encryptedToken = pickString(obj, ["encryptedToken"]);
  const createdAt = pickString(obj, ["createdAt"]);
  const updatedAt = pickString(obj, ["updatedAt"]);
  const lastScore = pickNumber(obj, ["lastScore"]);

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

export async function nextUserRecord(
  kv: KVStore | undefined,
): Promise<AccessTokenRecord | null> {
  const store = resolveKVStore(kv);
  const queue = await readQueue(store);
  if (queue.length === 0) {
    return null;
  }

  for (let i = 0; i < queue.length; i++) {
    const wallet = queue[i];
    const recordRaw = await store.get(tokenKey(wallet));
    const record = recordRaw ? parseAccessTokenRecord(recordRaw) : null;

    if (record) {
      const rotated = [...queue.slice(i + 1), ...queue.slice(0, i + 1)];
      await writeQueue(store, rotated);
      return record;
    }
  }

  await writeQueue(store, []);
  return null;
}
