import { useChainId } from "wagmi";
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

function normalizeAddresses(source: Record<string, string | undefined>) {
  return {
    creditOracle: parseAddress(source.creditOracle),
    worldIdRegistry: parseAddress(source.worldIdRegistry),
    pool: parseAddress(source.poolProxy),
    protocolDataProvider: parseAddress(source.protocolDataProvider),
    weth: parseAddress(source.weth),
    usdx: parseAddress(source.usdx),
    wbtc: parseAddress(source.wbtc),
    wethPriceFeed: parseAddress(source.wethPriceFeed),
    usdxPriceFeed: parseAddress(source.usdxPriceFeed),
    wbtcPriceFeed: parseAddress(source.wbtcPriceFeed),
  } as const;
}

function isConfigured(input: ReturnType<typeof normalizeAddresses>): boolean {
  return (
    input.creditOracle !== ZERO_ADDRESS &&
    input.pool !== ZERO_ADDRESS &&
    input.weth !== ZERO_ADDRESS &&
    input.usdx !== ZERO_ADDRESS
  );
}

const chainAliases: Record<string, number> = {
  local: 31337,
  localhost: 31337,
  sepolia: 11155111,
};

function resolveDefaultChainId(): number {
  const directChainId = Number(import.meta.env.VITE_CHAIN_ID);
  if (Number.isInteger(directChainId) && directChainId > 0) {
    return directChainId;
  }

  const alias = import.meta.env.VITE_CHAIN?.toLowerCase() || "";
  return chainAliases[alias] ?? 11155111;
}

const sepoliaAddresses = normalizeAddresses(deployed as Record<string, string | undefined>);

export function getDeployedAddresses(currentChainId: number) {
  void currentChainId;
  return sepoliaAddresses;
}

export function getIsDeployed(currentChainId: number): boolean {
  return isConfigured(getDeployedAddresses(currentChainId));
}

export const chainId = resolveDefaultChainId();

export function useDeployedAddresses() {
  const currentChainId = useChainId();
  return getDeployedAddresses(currentChainId || chainId);
}

export function useIsDeployed() {
  const currentChainId = useChainId();
  return getIsDeployed(currentChainId || chainId);
}

export const addresses = getDeployedAddresses(chainId);
export const isDeployed = isConfigured(addresses);

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
export const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo";
