import { gcm } from "@noble/ciphers/aes.js";
import {
  bytesToHex,
  bytesToUtf8,
  hexToBytes,
  managedNonce,
  utf8ToBytes,
} from "@noble/ciphers/utils.js";

import type { WorkflowSecretsProvider } from "./types";
import { strip0x } from "./utils";

export function encryptAccessToken(accessToken: string, keySecret: string): string {
  const key = parseEncryptionKey(keySecret);
  const cipher = managedNonce(gcm)(key);
  const encrypted = cipher.encrypt(utf8ToBytes(accessToken));
  return bytesToHex(encrypted);
}

export function decryptAccessToken(encryptedToken: string, keySecret: string): string {
  const key = parseEncryptionKey(keySecret);
  const cipher = managedNonce(gcm)(key);
  const decrypted = cipher.decrypt(hexToBytes(strip0x(encryptedToken)));
  return bytesToUtf8(decrypted);
}

export function parseEncryptionKey(keySecret: string): Uint8Array {
  const normalized = strip0x(keySecret.trim());

  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return hexToBytes(normalized);
  }

  const bytes = utf8ToBytes(keySecret);
  if (bytes.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte hex or utf8 string");
  }

  return bytes;
}

export function createInMemorySecrets(
  entries: Record<string, string>,
): WorkflowSecretsProvider {
  return {
    async getSecret(name: string): Promise<string> {
      const value = entries[name];
      if (!value) {
        throw new Error(`Missing secret: ${name}`);
      }
      return value;
    },
  };
}
