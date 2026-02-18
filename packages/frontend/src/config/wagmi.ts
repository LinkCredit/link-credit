import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { localhost, sepolia } from "wagmi/chains";
import { chainId, rpcUrl, walletConnectProjectId } from "./addresses";

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
      [localhost.id]: http(
        chainId === localhost.id ? rpcUrl : "http://127.0.0.1:8545"
      ),
      [sepolia.id]: http(
        chainId === sepolia.id ? rpcUrl : sepolia.rpcUrls.default.http[0]
      ),
    },
    ssr: false,
  })
);
