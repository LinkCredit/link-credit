import { defineChain } from "viem";

const defaultTenderlyExplorerUrl = "https://dashboard.tenderly.co";

function resolveExplorerUrl(rpcUrl: string): string {
  const forkId = rpcUrl.split("/").filter(Boolean).pop();
  if (!forkId) {
    return defaultTenderlyExplorerUrl;
  }
  return `https://dashboard.tenderly.co/fork/${forkId}`;
}

export function createTenderlySepoliaFork(rpcUrl: string) {
  return defineChain({
    id: 11155111,
    name: "Tenderly Sepolia Fork",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
    blockExplorers: {
      default: {
        name: "Tenderly Explorer",
        url: resolveExplorerUrl(rpcUrl),
      },
    },
    testnet: true,
  });
}
