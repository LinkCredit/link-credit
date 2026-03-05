import { describe, expect, test } from "bun:test";
import { createWalletOwnershipMessage, createWorldIdOwnershipMessage } from "./auth";
import {
  enqueueWallet,
  nextUserRecord,
  readQueue,
  resolveKVStore,
  tokenKey,
  writeQueue,
} from "./store";
import { readRuntimeEnv } from "./utils";

describe("createWalletOwnershipMessage", () => {
  test("includes token and wallet in deterministic format", () => {
    const message = createWalletOwnershipMessage("public-123", "0xabc");

    expect(message).toContain("Link Credit scoring authorization");
    expect(message).toContain("publicToken:public-123");
    expect(message).toContain("walletAddress:0xabc");
  });
});

describe("createWorldIdOwnershipMessage", () => {
  test("includes world id fields in deterministic format", () => {
    const message = createWorldIdOwnershipMessage({
      walletAddress: "0xabc",
      merkleRoot: "root",
      nullifierHash: "nullifier",
      verificationLevel: "device",
    });

    expect(message).toContain("Link Credit World ID authorization");
    expect(message).toContain("walletAddress:0xabc");
    expect(message).toContain("merkleRoot:root");
    expect(message).toContain("nullifierHash:nullifier");
    expect(message).toContain("verificationLevel:device");
  });
});

describe("local KV fallback", () => {
  test("stores queue and tokens without ACCESS_TOKEN_KV binding", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFlag = process.env.ALLOW_IN_MEMORY_KV_FALLBACK;
    try {
      process.env.NODE_ENV = "test";
      delete process.env.ALLOW_IN_MEMORY_KV_FALLBACK;

      const walletAddress = "0x0000000000000000000000000000000000000001";
      const record = {
        walletAddress,
        encryptedToken: "enc-token",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastScore: 77,
      };
      const kv = resolveKVStore(undefined);

      await writeQueue(kv, []);
      await kv.put(tokenKey(walletAddress), JSON.stringify(record));
      await enqueueWallet(undefined, walletAddress);

      const queue = await readQueue(undefined);
      expect(queue).toContain(walletAddress.toLowerCase());

      const next = await nextUserRecord(undefined);
      expect(next?.walletAddress).toBe(walletAddress);
      expect(next?.encryptedToken).toBe("enc-token");
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousFlag === undefined) {
        delete process.env.ALLOW_IN_MEMORY_KV_FALLBACK;
      } else {
        process.env.ALLOW_IN_MEMORY_KV_FALLBACK = previousFlag;
      }
    }
  });

  test("throws without binding when fallback is disabled", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFlag = process.env.ALLOW_IN_MEMORY_KV_FALLBACK;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_IN_MEMORY_KV_FALLBACK;

      expect(() => resolveKVStore(undefined)).toThrow(
        "ACCESS_TOKEN_KV binding is required",
      );
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousFlag === undefined) {
        delete process.env.ALLOW_IN_MEMORY_KV_FALLBACK;
      } else {
        process.env.ALLOW_IN_MEMORY_KV_FALLBACK = previousFlag;
      }
    }
  });
});

describe("readRuntimeEnv", () => {
  test("falls back to process.env when binding is missing", () => {
    const prev = process.env.PLAID_CLIENT_ID;
    process.env.PLAID_CLIENT_ID = "from-process";

    const value = readRuntimeEnv({}, "PLAID_CLIENT_ID");
    expect(value).toBe("from-process");

    if (prev === undefined) {
      delete process.env.PLAID_CLIENT_ID;
    } else {
      process.env.PLAID_CLIENT_ID = prev;
    }
  });
});
