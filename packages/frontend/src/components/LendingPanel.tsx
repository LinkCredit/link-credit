import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits } from "viem";
import { useAccount } from "wagmi";
import {
  ZERO_ADDRESS,
  useDeployedAddresses,
  useIsDeployed,
} from "../config/addresses";
import { useAccountData } from "../hooks/useAccountData";
import { useLending } from "../hooks/useLending";
import { useReserveData } from "../hooks/useReserveData";
import { useUserReserveData } from "../hooks/useUserReserveData";
import { useWalletBalances } from "../hooks/useWalletBalances";

type AssetOption = {
  symbol: string;
  address: Address;
};

function buildAssets(addresses: {
  weth: Address;
  usdx: Address;
  wbtc: Address;
}): AssetOption[] {
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

function formatAmount(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.01) return "< 0.01";
  return num.toFixed(2);
}

function formatApy(apy: number): string {
  if (apy === 0) return "0%";
  if (apy < 0.01) return "< 0.01%";
  return `${apy.toFixed(2)}%`;
}

export function LendingPanel(): React.JSX.Element {
  const { address, isConnected } = useAccount();
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const lending = useLending();
  const accountData = useAccountData(address);
  const walletBalances = useWalletBalances(address);
  const assets = useMemo(() => buildAssets(addresses), [addresses]);

  const wethReserve = useReserveData(addresses.weth);
  const usdxReserve = useReserveData(addresses.usdx);
  const wbtcReserve = useReserveData(addresses.wbtc);

  const wethUser = useUserReserveData(addresses.weth, address);
  const usdxUser = useUserReserveData(addresses.usdx, address);
  const wbtcUser = useUserReserveData(addresses.wbtc, address);

  const [supplyAmount, setSupplyAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [supplyAsset, setSupplyAsset] = useState<Address>(
    assets[0]?.address ?? addresses.weth
  );
  const [borrowAsset, setBorrowAsset] = useState<Address>(
    assets[1]?.address ?? assets[0]?.address ?? addresses.usdx
  );
  const [withdrawAsset, setWithdrawAsset] = useState<Address | null>(null);
  const [repayAsset, setRepayAsset] = useState<Address | null>(null);

  useEffect(() => {
    const defaultSupplyAsset = assets[0]?.address ?? addresses.weth;
    const defaultBorrowAsset =
      assets[1]?.address ?? assets[0]?.address ?? addresses.usdx;

    if (!assets.some((asset) => asset.address === supplyAsset)) {
      setSupplyAsset(defaultSupplyAsset);
    }
    if (!assets.some((asset) => asset.address === borrowAsset)) {
      setBorrowAsset(defaultBorrowAsset);
    }
  }, [addresses.usdx, addresses.weth, assets, borrowAsset, supplyAsset]);

  const disabled =
    !isConnected || lending.isPending || !isDeployed || assets.length === 0;

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

      {/* YOUR SUPPLIES Section */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
          Your Supplies
        </h3>
        <div className="mt-3 space-y-2">
          {[
            { symbol: "WETH", address: addresses.weth, userData: wethUser, reserveData: wethReserve, decimals: 18 },
            { symbol: "USDX", address: addresses.usdx, userData: usdxUser, reserveData: usdxReserve, decimals: 6 },
            { symbol: "WBTC", address: addresses.wbtc, userData: wbtcUser, reserveData: wbtcReserve, decimals: 8 },
          ]
            .filter((asset) => asset.address !== ZERO_ADDRESS)
            .map((asset) => {
              const walletBalance = walletBalances.balances[asset.address];
              const supplied = asset.userData.currentATokenBalance;
              const hasSupplied = supplied > 0n;
              const isWithdrawing = withdrawAsset === asset.address;

              return (
                <div
                  key={asset.address}
                  className={`rounded-xl border border-white/10 bg-slate-950/40 p-3 ${
                    hasSupplied ? "bg-slate-950/60" : ""
                  }`}
                >
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Asset</p>
                      <p className="mt-1 font-semibold text-white">{asset.symbol}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Wallet</p>
                      <p className="mt-1 text-white">
                        {walletBalance ? walletBalance.formatted.slice(0, 8) : "0"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Supplied</p>
                      <p className="mt-1 font-semibold text-cyan-300">
                        {formatAmount(supplied, asset.decimals)}
                      </p>
                    </div>
                  </div>
                  {hasSupplied && (
                    <div className="mt-3">
                      {!isWithdrawing && (
                        <button
                          type="button"
                          onClick={() => {
                            lending.clearError();
                            setWithdrawAmount("");
                            setWithdrawAsset(asset.address);
                          }}
                          disabled={disabled}
                          className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Withdraw
                        </button>
                      )}
                      {isWithdrawing && (
                        <div className="space-y-2">
                          <input
                            value={withdrawAmount}
                            onChange={(event) => setWithdrawAmount(event.target.value)}
                            placeholder="0.00"
                            inputMode="decimal"
                            className="w-full rounded-lg border border-cyan-400/30 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void lending.withdraw(asset.address, withdrawAmount)}
                              disabled={disabled || withdrawAmount.length === 0}
                              className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                lending.clearError();
                                setWithdrawAmount("");
                                setWithdrawAsset(null);
                              }}
                              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* YOUR BORROWS Section */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
          Your Borrows
        </h3>
        <div className="mt-3 space-y-2">
          {[
            { symbol: "WETH", address: addresses.weth, userData: wethUser, reserveData: wethReserve, decimals: 18 },
            { symbol: "USDX", address: addresses.usdx, userData: usdxUser, reserveData: usdxReserve, decimals: 6 },
            { symbol: "WBTC", address: addresses.wbtc, userData: wbtcUser, reserveData: wbtcReserve, decimals: 8 },
          ]
            .filter((asset) => asset.address !== ZERO_ADDRESS && asset.userData.currentVariableDebt > 0n)
            .map((asset) => {
              const borrowed = asset.userData.currentVariableDebt;
              const isRepaying = repayAsset === asset.address;

              return (
                <div
                  key={asset.address}
                  className="rounded-xl border border-white/10 bg-slate-950/60 p-3"
                >
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Asset</p>
                      <p className="mt-1 font-semibold text-white">{asset.symbol}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Borrowed</p>
                      <p className="mt-1 font-semibold text-rose-300">
                        {formatAmount(borrowed, asset.decimals)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Borrow APY</p>
                      <p className="mt-1 text-amber-300">
                        {formatApy(asset.reserveData.variableBorrowRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Available</p>
                      <p className="mt-1 text-slate-300">
                        {formatUsd(accountData.availableBorrows)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    {!isRepaying && (
                      <button
                        type="button"
                        onClick={() => {
                          lending.clearError();
                          setRepayAmount("");
                          setRepayAsset(asset.address);
                        }}
                        disabled={disabled}
                        className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Repay
                      </button>
                    )}
                    {isRepaying && (
                      <div className="space-y-2">
                        <input
                          value={repayAmount}
                          onChange={(event) => setRepayAmount(event.target.value)}
                          placeholder="0.00"
                          inputMode="decimal"
                          className="w-full rounded-lg border border-emerald-400/30 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void lending.repay(asset.address, repayAmount)}
                            disabled={disabled || repayAmount.length === 0}
                            className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              lending.clearError();
                              setRepayAmount("");
                              setRepayAsset(null);
                            }}
                            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {[wethUser, usdxUser, wbtcUser].every((u) => u.currentVariableDebt === 0n) && (
            <p className="text-sm text-slate-400">No borrows yet</p>
          )}
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
      {assets.length === 0 && (
        <p className="mt-2 text-sm text-amber-200">
          No asset addresses available for this network.
        </p>
      )}
    </section>
  );
}
