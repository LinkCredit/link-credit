import type { Context } from "hono";
import { type Address, getAddress } from "viem";
import type { EnvBindings, JsonObject } from "./types";

export async function parseBody(c: Context): Promise<JsonObject | null> {
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

export function pickString(obj: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function pickNumber(obj: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function normalizeAddress(walletAddress: string): Address | null {
  try {
    return getAddress(walletAddress);
  } catch {
    return null;
  }
}

export function normalizePrivateKey(key: string): `0x${string}` {
  const value = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("CRE_WORKER_PRIVATE_KEY must be a 32-byte hex string");
  }
  return value as `0x${string}`;
}

export function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeText(JSON.stringify(value));
}

function base64UrlEncodeText(input: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(input));
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
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

export function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readRuntimeEnv(
  bindings: EnvBindings,
  key: keyof EnvBindings,
): string | undefined {
  const bindingValue = bindings[key];
  if (typeof bindingValue === "string" && bindingValue.trim().length > 0) {
    return bindingValue.trim();
  }

  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const processValue = processEnv?.[key as string];
  if (typeof processValue === "string" && processValue.trim().length > 0) {
    return processValue.trim();
  }

  return undefined;
}
