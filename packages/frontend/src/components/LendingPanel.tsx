import { useMemo, useState } from "react";
import { type Address } from "viem";
import { useAccount } from "wagmi";
import { ZERO_ADDRESS, isDeployed, addresses } from "../config/addresses";
import { useAccountData } from "../hooks/useAccountData";
import { useLending } from "../hooks/useLending";

type AssetOption = {
  symbol: string;
  address: Address;
};

function buildAssets(): AssetOption[] {
  const candidates: AssetOption[] = [
    { symbol: "WETH", address: addresses.weth },
    { symbol: "USDX", address: addresses.usdx },
    { symbol: "WBTC", address: addresses.wbtc },
  ];
  return candidates.filter((asset) => asset.address !== ZERO_ADDRESS);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function healthFactorColor(value: number): string {
  if (value === 0) return "text-slate-300";
  if (value < 1.2) return "text-rose-300";
  return "text-emerald-300";
}

export function LendingPanel(): React.JSX.Element {
  const { address, isConnected } = useAccount();
  const lending = useLending();
  const accountData = useAccountData(address);
  const assets = useMemo(buildAssets, []);

  const [supplyAmount, setSupplyAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [supplyAsset, setSupplyAsset] = useState<Address>(
    assets[0]?.address ?? addresses.weth
  );
  const [borrowAsset, setBorrowAsset] = useState<Address>(
    assets[1]?.address ?? assets[0]?.address ?? addresses.usdx
  );

  const disabled = !isConnected || lending.isPending || !isDeployed;

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-emerald-900/20">
      <h2 className="text-xl font-semibold text-white">Lending actions</h2>
      <p className="mt-1 text-sm text-slate-300">
        Supply collateral and borrow with dynamic LTV from your credit score.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Collateral
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatUsd(accountData.totalCollateral)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Debt</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatUsd(accountData.totalDebt)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Borrowable
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatUsd(accountData.availableBorrows)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Health factor
          </p>
          <p
            className={`mt-2 text-lg font-semibold ${healthFactorColor(accountData.healthFactorValue)}`}
          >
            {accountData.healthFactorValue === 0
              ? "--"
              : accountData.healthFactorValue.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <form
          className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void lending.supply(supplyAsset, supplyAmount);
          }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
            Supply
          </h3>
          <div className="mt-3 flex gap-2">
            <select
              value={supplyAsset}
              onChange={(event) => setSupplyAsset(event.target.value as Address)}
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {assets.map((asset) => (
                <option key={asset.address} value={asset.address}>
                  {asset.symbol}
                </option>
              ))}
            </select>
            <input
              value={supplyAmount}
              onChange={(event) => setSupplyAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={disabled}
            className="mt-3 w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Supply now
          </button>
        </form>

        <form
          className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void lending.borrow(borrowAsset, borrowAmount);
          }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
            Borrow
          </h3>
          <div className="mt-3 flex gap-2">
            <select
              value={borrowAsset}
              onChange={(event) => setBorrowAsset(event.target.value as Address)}
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {assets.map((asset) => (
                <option key={asset.address} value={asset.address}>
                  {asset.symbol}
                </option>
              ))}
            </select>
            <input
              value={borrowAmount}
              onChange={(event) => setBorrowAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={disabled}
            className="mt-3 w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Borrow now
          </button>
        </form>
      </div>

      {lending.pendingAction && (
        <p className="mt-4 text-sm text-slate-300">
          Pending action: {lending.pendingAction}
        </p>
      )}
      {lending.lastTxHash && (
        <p className="mt-2 break-all text-xs text-slate-400">
          Last tx: {lending.lastTxHash}
        </p>
      )}
      {lending.error && (
        <p className="mt-2 text-sm text-rose-300">{lending.error}</p>
      )}
      {accountData.error && (
        <p className="mt-2 text-sm text-rose-300">
          Failed to read account data.
        </p>
      )}
      {!isConnected && (
        <p className="mt-2 text-sm text-amber-200">
          Connect wallet to use lending actions.
        </p>
      )}
      {!isDeployed && (
        <p className="mt-2 text-sm text-amber-200">
          Configure contract addresses to enable lending.
        </p>
      )}
    </section>
  );
}
