import { ConnectKitButton } from "connectkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { activeChain } from "../config/wagmi";

const NETWORK_NAMES: Record<number, string> = {
  11155111: "Sepolia",
};

function resolveNetworkName(
  chainId: number,
  chains: ReturnType<typeof useSwitchChain>["chains"]
): string {
  return (
    NETWORK_NAMES[chainId] ||
    chains.find((chain) => chain.id === chainId)?.name ||
    `Chain ${chainId}`
  );
}

export function Header(): React.JSX.Element {
  const { isConnected } = useAccount();
  const activeChainId = useChainId() || activeChain.id;
  const { chains, switchChain } = useSwitchChain();
  const networkName = resolveNetworkName(activeChainId, chains);

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
            Link Credit
          </p>
          <h1 className="text-lg font-semibold text-white md:text-2xl">
            Credit-boosted lending
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={activeChainId}
            onChange={(event) => {
              switchChain({ chainId: Number(event.target.value) });
            }}
            disabled={!isConnected}
            className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200"
          >
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {NETWORK_NAMES[chain.id] || chain.name}
              </option>
            ))}
          </select>
          <span className="hidden rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200 md:inline-block">
            {networkName}
          </span>
          <ConnectKitButton />
          {!isConnected && (
            <span className="hidden text-xs text-slate-400 md:block">
              Connect wallet to continue
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
