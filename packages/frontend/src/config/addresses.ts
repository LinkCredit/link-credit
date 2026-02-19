import { type Address, getAddress, isAddress } from "viem";
import deployed from "../../../contracts/deployed-addresses.json";

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

function parseAddress(value: string | undefined): Address {
  if (!value || !isAddress(value)) {
    return ZERO_ADDRESS;
  }
  return getAddress(value);
}

export const addresses = {
  creditOracle: parseAddress(import.meta.env.VITE_CREDIT_ORACLE_ADDRESS || deployed.creditOracle),
  pool: parseAddress(import.meta.env.VITE_POOL_ADDRESS || deployed.poolProxy),
  weth: parseAddress(import.meta.env.VITE_WETH_ADDRESS || deployed.weth),
  usdx: parseAddress(import.meta.env.VITE_USDX_ADDRESS || deployed.usdx),
  wbtc: parseAddress(import.meta.env.VITE_WBTC_ADDRESS || deployed.wbtc),
} as const;

export const chainId = Number(import.meta.env.VITE_CHAIN_ID || "11155111");
export const rpcUrl = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
export const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo";

export const isDeployed =
  addresses.creditOracle !== ZERO_ADDRESS &&
  addresses.pool !== ZERO_ADDRESS &&
  addresses.weth !== ZERO_ADDRESS &&
  addresses.usdx !== ZERO_ADDRESS;
