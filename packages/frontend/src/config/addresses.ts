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
  creditOracle: parseAddress(deployed.creditOracle),
  pool: parseAddress(deployed.poolProxy),
  weth: parseAddress(deployed.weth),
  usdx: parseAddress(deployed.usdx),
  wbtc: parseAddress(deployed.wbtc),
} as const;

export const chainId = 11155111; // Sepolia
export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
export const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo";

export const isDeployed =
  addresses.creditOracle !== ZERO_ADDRESS &&
  addresses.pool !== ZERO_ADDRESS &&
  addresses.weth !== ZERO_ADDRESS &&
  addresses.usdx !== ZERO_ADDRESS;
