import { CreditScorePanel } from "./components/CreditScorePanel";
import { Header } from "./components/Header";
import { LendingPanel } from "./components/LendingPanel";
import { WorldIDVerification } from "./components/WorldIDVerification";
import { isDeployed } from "./config/addresses";

export default function App() {
  return (
    <div className="min-h-screen text-slate-100">
      <Header />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        {!isDeployed ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Contract addresses are missing. Add frontend env vars or run
            <span className="mx-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
              bun run dev:local
            </span>
            from repo root.
          </div>
        ) : null}
        <WorldIDVerification />
        <div className="grid gap-6 lg:grid-cols-2">
          <CreditScorePanel />
          <LendingPanel />
        </div>
      </main>
    </div>
  );
}
