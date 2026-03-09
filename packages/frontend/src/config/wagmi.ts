import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { chainId, walletConnectProjectId } from "./addresses";
import { sepolia, tenderlySepoliaVirtualTestnet } from "./chains";

// Get enabled chains
const chains = [];
chains.push(sepolia);

// Tenderly is only enabled when RPC URL is configured
const tenderlyVirtualnetRpcUrl = import.meta.env.VITE_TENDERLY_VIRTUALNET_RPC_URL;
if (tenderlyVirtualnetRpcUrl) {
  chains.push(tenderlySepoliaVirtualTestnet);
}

// Configure transport for each chain
const transports: Record<number, ReturnType<typeof http>> = {
  [sepolia.id]: http(),
};

if (tenderlyVirtualnetRpcUrl) {
  transports[tenderlySepoliaVirtualTestnet.id] = http(tenderlyVirtualnetRpcUrl);
}

const chainById = new Map(chains.map((configuredChain) => [configuredChain.id, configuredChain]));

export const activeChain = chainById.get(chainId) ?? sepolia;

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "Link Credit",
    appDescription: "AI-powered privacy credit scoring for DeFi lending",
    appUrl: "https://link-credit.local",
    walletConnectProjectId,
    enableFamily: false,
    chains: chains as any,
    transports,
    ssr: false,
  })
);
