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

export interface TriggerWorldIdRequest {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
  protocol_version?: string;
  nonce?: string;
  action?: string;
  walletAddress: string;
  signature: string;
}

export interface TriggerWorldIdGatewayPayload {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
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
