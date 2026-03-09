import { defineChain } from "viem";

const rpcUrl = import.meta.env.VITE_TENDERLY_VIRTUALNET_RPC_URL || '';

function extractForkId(url: string): string {
  // Extract fork ID from RPC URL
  const match = url.match(/\/([^/]+)$/);
  return match ? match[1] : '';
}

export const tenderlySepoliaVirtualTestnet = defineChain({
  id: 99911155111, // Custom chain ID
  name: 'Tenderly Sepolia Virtual TestNet',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: 'Tenderly',
      url: `https://dashboard.tenderly.co/fork/${extractForkId(rpcUrl)}`,
    },
  },
  testnet: true,
})
