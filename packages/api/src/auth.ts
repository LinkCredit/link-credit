import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Context } from "hono";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  CreJwtClaims,
  TriggerScoringRequest,
  TriggerWorldIdRequest,
} from "./types";
import {
  base64UrlEncodeBytes,
  base64UrlEncodeJson,
  normalizeAddress,
  normalizePrivateKey,
} from "./utils";

export function createWalletOwnershipMessage(
  publicToken: string,
  walletAddress: string,
): string {
  return [
    "Link Credit scoring authorization",
    `publicToken:${publicToken}`,
    `walletAddress:${walletAddress}`,
  ].join("\n");
}

export function createWorldIdOwnershipMessage(input: {
  walletAddress: string;
  merkleRoot: string;
  nullifierHash: string;
  verificationLevel: string;
}): string {
  return [
    "Link Credit World ID authorization",
    `walletAddress:${input.walletAddress}`,
    `merkleRoot:${input.merkleRoot}`,
    `nullifierHash:${input.nullifierHash}`,
    `verificationLevel:${input.verificationLevel}`,
  ].join("\n");
}

async function verifySignatureAgainstCandidates(input: {
  address: string;
  signature: string;
  messages: string[];
}): Promise<boolean> {
  for (const message of input.messages) {
    const verified = await verifyMessage({
      address: input.address as `0x${string}`,
      message,
      signature: input.signature as `0x${string}`,
    }).catch(() => false);

    if (verified) {
      return true;
    }
  }

  return false;
}

export async function verifyWalletSignature(
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

  return verifySignatureAgainstCandidates({
    address: normalizedWallet,
    signature: payload.signature,
    messages: candidates,
  });
}

export async function verifyWorldIdSignature(
  payload: TriggerWorldIdRequest,
): Promise<boolean> {
  const normalizedWallet = normalizeAddress(payload.walletAddress);
  if (!normalizedWallet) {
    return false;
  }

  const candidates = [
    createWorldIdOwnershipMessage({
      walletAddress: payload.walletAddress,
      merkleRoot: payload.merkle_root,
      nullifierHash: payload.nullifier_hash,
      verificationLevel: payload.verification_level,
    }),
    createWorldIdOwnershipMessage({
      walletAddress: normalizedWallet,
      merkleRoot: payload.merkle_root,
      nullifierHash: payload.nullifier_hash,
      verificationLevel: payload.verification_level,
    }),
  ];

  return verifySignatureAgainstCandidates({
    address: normalizedWallet,
    signature: payload.signature,
    messages: candidates,
  });
}

export function createCreJwt(input: {
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

export function hasValidApiKey(c: Context, expectedApiKey?: string): boolean {
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
