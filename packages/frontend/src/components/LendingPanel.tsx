import { useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { aggregatorV3Abi, erc20Abi } from "../config/abi";
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

function getPriceFeedAddress(asset: Address): Address {
  if (asset === addresses.weth) return addresses.wethPriceFeed;
  if (asset === addresses.usdx) return addresses.usdxPriceFeed;
  if (asset === addresses.wbtc) return addresses.wbtcPriceFeed;
  return ZERO_ADDRESS;
}

function formatTokenAmount(units: bigint, decimals: number, fixed: number = 6): string {
  const asNumber = Number(formatUnits(units, decimals));
  if (!Number.isFinite(asNumber)) {
    return "0";
  }
  return asNumber.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fixed,
  });
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

function shortenHash(hash: string): string {
  if (hash.length <= 14) {
    return hash;
  }
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function LendingPanel(): React.JSX.Element {
  const { address, isConnected } = useAccount();
  const lending = useLending();
  const accountData = useAccountData(address);
  const assets = useMemo(buildAssets, []);

  const [supplyAmount, setSupplyAmount] = useState("");
  const [supplyAsset, setSupplyAsset] = useState<Address>(
    assets[0]?.address ?? addresses.weth
  );
  const [borrowAsset, setBorrowAsset] = useState<Address>(
    assets[1]?.address ?? assets[0]?.address ?? addresses.usdx
  );
  const [borrowPercent, setBorrowPercent] = useState(0);

  const borrowFeedAddress = getPriceFeedAddress(borrowAsset);
  const borrowTokenDecimalsQuery = useReadContract({
    abi: erc20Abi,
    address: borrowAsset,
    functionName: "decimals",
    query: { enabled: isConnected && borrowAsset !== ZERO_ADDRESS && isDeployed },
  });
  const borrowFeedDecimalsQuery = useReadContract({
    abi: aggregatorV3Abi,
    address: borrowFeedAddress,
    functionName: "decimals",
    query: { enabled: isConnected && borrowFeedAddress !== ZERO_ADDRESS && isDeployed },
  });
  const borrowFeedRoundQuery = useReadContract({
    abi: aggregatorV3Abi,
    address: borrowFeedAddress,
    functionName: "latestRoundData",
    query: { enabled: isConnected && borrowFeedAddress !== ZERO_ADDRESS && isDeployed },
  });
  const borrowFeedAnswerQuery = useReadContract({
    abi: aggregatorV3Abi,
    address: borrowFeedAddress,
    functionName: "latestAnswer",
    query: { enabled: isConnected && borrowFeedAddress !== ZERO_ADDRESS && isDeployed },
  });

  const borrowTokenDecimals = Number(borrowTokenDecimalsQuery.data ?? 18);
  const borrowFeedDecimals = Number(borrowFeedDecimalsQuery.data ?? 8);
  const borrowPriceRound = borrowFeedRoundQuery.data?.[1];
  const borrowPriceAnswer = borrowFeedAnswerQuery.data;
  const borrowPriceRaw =
    typeof borrowPriceRound === "bigint"
      ? borrowPriceRound
      : typeof borrowPriceAnswer === "bigint"
        ? borrowPriceAnswer
        : 0n;
  const borrowPrice = borrowPriceRaw > 0n ? borrowPriceRaw : 0n;
  const priceScale = 10n ** BigInt(borrowFeedDecimals);

  const maxBorrowUnitsRaw =
    borrowPrice > 0n
      ? (accountData.availableBorrowsBase * 10n ** BigInt(borrowTokenDecimals)) /
        borrowPrice
      : 0n;
  // Keep a small headroom to reduce edge-case reverts from state drift.
  const maxBorrowUnits = (maxBorrowUnitsRaw * 995n) / 1000n;
  const selectedBorrowUnits = (maxBorrowUnits * BigInt(borrowPercent)) / 100n;
  const selectedBorrowAmount = Number(formatUnits(selectedBorrowUnits, borrowTokenDecimals));
  const selectedBorrowUsd = selectedBorrowAmount * (Number(borrowPrice) / Number(priceScale));
  const selectedBorrowAssetSymbol =
    assets.find((asset) => asset.address === borrowAsset)?.symbol ?? "ASSET";

  const disabled = !isConnected || lending.isPending || !isDeployed;
  const borrowDisabled = disabled || maxBorrowUnits <= 0n;
  const borrowSubmitDisabled = borrowDisabled || selectedBorrowUnits <= 0n;

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
            void lending.borrow(
              borrowAsset,
              formatUnits(selectedBorrowUnits, borrowTokenDecimals),
              maxBorrowUnits
            );
          }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
            Borrow
          </h3>
          <div className="mt-3 flex gap-2">
            <select
              value={borrowAsset}
              onChange={(event) => {
                setBorrowAsset(event.target.value as Address);
                setBorrowPercent(0);
              }}
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {assets.map((asset) => (
                <option key={asset.address} value={asset.address}>
                  {asset.symbol}
                </option>
              ))}
            </select>
            <input
              value={formatTokenAmount(selectedBorrowUnits, borrowTokenDecimals)}
              readOnly
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
              <span>
                {borrowPercent}% of max (
                {formatTokenAmount(maxBorrowUnits, borrowTokenDecimals)} {selectedBorrowAssetSymbol}
                )
              </span>
              <button
                type="button"
                disabled={borrowDisabled}
                onClick={() => setBorrowPercent(100)}
                className="rounded-md border border-emerald-300/40 px-2 py-0.5 text-emerald-200 disabled:opacity-40"
              >
                Max
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={borrowPercent}
              onChange={(event) => setBorrowPercent(Number(event.target.value))}
              disabled={borrowDisabled}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-2 text-xs text-slate-400">
              Borrowing ~{formatUsd(selectedBorrowUsd)} worth of {selectedBorrowAssetSymbol}
            </div>
          </div>
          <button
            type="submit"
            disabled={borrowSubmitDisabled}
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
        <p className="mt-2 text-xs text-slate-400">
          Last tx:{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${lending.lastTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="break-all text-cyan-300 underline decoration-cyan-400/60 underline-offset-2 hover:text-cyan-200"
          >
            {shortenHash(lending.lastTxHash)}
          </a>
        </p>
      )}
      {lending.error && (
        <p className="mt-2 text-sm text-rose-300">{lending.error}</p>
      )}
      {borrowFeedAddress === ZERO_ADDRESS && (
        <p className="mt-2 text-sm text-amber-200">
          Missing price feed for selected borrow asset.
        </p>
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
