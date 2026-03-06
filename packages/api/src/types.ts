export type JsonObject = Record<string, unknown>;

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface EnvBindings {
  PLAID_CLIENT_ID?: string;
  PLAID_SECRET?: string;
  PLAID_BASE_URL?: string;
  CRE_GATEWAY_URL?: string;
  CRE_WORKFLOW_ID?: string;
  CRE_WORLDID_WORKFLOW_ID?: string;
  CRE_WORKFLOW_METHOD?: string;
  CRE_WORKER_PRIVATE_KEY?: string;
  WORLDCOIN_APP_ID?: string;
  WORLDCOIN_RP_ID?: string;
  WORLDCOIN_RP_SIGNING_KEY?: string;
  WORKER_API_KEY?: string;
  ACCESS_TOKEN_KV?: KVStore;
}

export interface TriggerScoringRequest {
  publicToken: string;
  walletAddress: string;
  signature: string;
}

export interface AccessTokenRecord {
  walletAddress: string;
  encryptedToken: string;
  createdAt: string;
  updatedAt: string;
  lastScore?: number;
}

export interface TriggerGatewayPayload {
  publicToken: string;
  walletAddress: string;
}

export interface WorldIdProofResponse {
  nullifier: string;
  identifier?: string;
  verification_level?: string;
  [key: string]: unknown;
}

export interface WorldIdProofPayload {
  protocol_version: string;
  responses: WorldIdProofResponse[];
  [key: string]: unknown;
}

export interface TriggerWorldIdRequest {
  worldIdProof: WorldIdProofPayload;
  walletAddress: string;
  signature: string;
}

export interface TriggerWorldIdGatewayPayload {
  worldIdProof: WorldIdProofPayload;
  walletAddress: string;
}

export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export interface CreJwtClaims {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  digest: string;
}
