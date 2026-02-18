import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { renderToStaticMarkup } from "react-dom/server";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { activeChain, wagmiConfig } from "./config/wagmi";

describe("App", () => {
  test("renders project title", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider
            mode="dark"
            options={{ initialChainId: activeChain.id }}
          >
            <App />
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    );

    expect(html).toContain("Link Credit");
    expect(html).toContain("Credit-boosted lending");
  });
});
