import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { localhost, sepolia } from "wagmi/chains";
import { chainId, walletConnectProjectId } from "./addresses";

const chains = [localhost, sepolia] as const;

export const activeChain = chainId === localhost.id ? localhost : sepolia;

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "Link Credit",
    appDescription: "AI-powered privacy credit scoring for DeFi lending",
    appUrl: "https://link-credit.local",
    walletConnectProjectId,
    enableFamily: false,
    chains,
    transports: {
      [localhost.id]: http("http://127.0.0.1:8545"),
      [sepolia.id]: http(),
    },
    ssr: false,
  })
);
