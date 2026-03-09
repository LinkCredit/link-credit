import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { chainId, walletConnectProjectId } from "./addresses";
import { createTenderlySepoliaVirtualNet } from "./chains/tenderly";

const tenderlyVirtualnetRpcUrl = import.meta.env.VITE_TENDERLY_VIRTUALNET_RPC_URL;
const sepoliaLikeChain = tenderlyVirtualnetRpcUrl
  ? createTenderlySepoliaVirtualNet(tenderlyVirtualnetRpcUrl)
  : sepolia;
const chains = [sepoliaLikeChain] as const;

const chainById = new Map(chains.map((configuredChain) => [configuredChain.id, configuredChain]));

export const activeChain = chainById.get(chainId) ?? sepolia;

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "Link Credit",
    appDescription: "AI-powered privacy credit scoring for DeFi lending",
    appUrl: "https://link-credit.local",
    walletConnectProjectId,
    enableFamily: false,
    chains,
    transports: {
      [sepoliaLikeChain.id]: tenderlyVirtualnetRpcUrl
        ? http(tenderlyVirtualnetRpcUrl)
        : http(),
    },
    ssr: false,
  })
);
