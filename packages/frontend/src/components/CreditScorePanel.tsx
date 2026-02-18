import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { isDeployed } from "../config/addresses";
import { useCreditScore } from "../hooks/useCreditScore";
import { usePlaidLink } from "../hooks/usePlaidLink";

const BASE_LTV_PERCENT = 75;

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function buttonLabel(isAwaitingOnchain: boolean, isBusy: boolean): string {
  if (isAwaitingOnchain) return "Waiting on-chain...";
  if (isBusy) return "Evaluating...";
  return "Evaluate My Credit";
}

export function CreditScorePanel(): React.JSX.Element {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [pendingScoreBps, setPendingScoreBps] = useState<bigint | null>(null);
  const {
    score,
    scoreBps,
    ltvBoostPercent,
    hasScore,
    isLoading,
    isFetching,
  } = useCreditScore(address);
  const plaid = usePlaidLink(address, signMessageAsync, () => {
    setPendingScoreBps(scoreBps);
  });

  useEffect(() => {
    if (pendingScoreBps === null) {
      return;
    }
    if (scoreBps !== pendingScoreBps) {
      setPendingScoreBps(null);
    }
  }, [pendingScoreBps, scoreBps]);

  useEffect(() => {
    setPendingScoreBps(null);
  }, [address]);

  const boostedLtv = BASE_LTV_PERCENT + ltvBoostPercent;
  const scoreProgress = Math.max(0, Math.min(score, 100));
  const isAwaitingOnchainConfirmation = pendingScoreBps !== null;
  const isBusy =
    plaid.isPreparing || plaid.isEvaluating || isAwaitingOnchainConfirmation;
  const evaluateDisabled = !isConnected || isBusy;

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-cyan-900/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Credit score</h2>
          <p className="text-sm text-slate-300">
            From Plaid cashflow signal to on-chain collateral boost.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void plaid.launch()}
          disabled={evaluateDisabled}
          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel(isAwaitingOnchainConfirmation, isBusy)}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-sm text-slate-400">On-chain score (0-100)</span>
          <span className="text-3xl font-bold text-white">
            {hasScore ? score.toFixed(2) : "--"}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-lime-300 transition-all"
            style={{ width: `${scoreProgress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          scoreBps: {scoreBps.toString()} | refresh:{" "}
          {isLoading || isFetching ? "syncing" : "live"}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Base LTV</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {formatPercent(BASE_LTV_PERCENT)}
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-cyan-200">
            With credit boost
          </p>
          <p className="mt-2 text-2xl font-semibold text-cyan-100">
            {formatPercent(boostedLtv)}
          </p>
          <p className="text-xs text-cyan-200/80">
            +{formatPercent(ltvBoostPercent)} from CreditOracle
          </p>
        </div>
      </div>

      {isAwaitingOnchainConfirmation && (
        <p className="mt-4 text-sm text-cyan-200">
          Evaluation submitted, waiting for on-chain confirmation.
        </p>
      )}

      {!hasScore && !isAwaitingOnchainConfirmation && (
        <p className="mt-4 text-sm text-amber-200">
          No credit score yet. Run Plaid evaluation or call
          <span className="mx-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
            updateScore
          </span>
          as oracle owner.
        </p>
      )}

      {!isDeployed && (
        <p className="mt-4 text-sm text-amber-200">
          Demo mode: contracts are not configured in env vars.
        </p>
      )}

      {plaid.error && (
        <p className="mt-4 text-sm text-rose-300">{plaid.error}</p>
      )}
    </section>
  );
}
