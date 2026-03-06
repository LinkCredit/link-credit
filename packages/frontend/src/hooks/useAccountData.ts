import { type Address } from "viem";
import { useReadContract } from "wagmi";
import { poolAbi } from "../config/abi";
import {
  ZERO_ADDRESS,
  useDeployedAddresses,
  useIsDeployed,
} from "../config/addresses";

// Aave v3 uses 8 decimals for base currency (USD)
// But the actual value returned includes asset decimals
// For proper conversion, we need to divide by 1e8 (price decimals) + asset decimals
// Since most assets use 8 decimals (WBTC) or 18 decimals (WETH),
// and prices are in 8 decimals, the total is typically 16 decimals for WBTC
const BASE_CURRENCY_DECIMALS = 1e8;

function toBase(value: bigint): number {
  // Aave returns values in base currency with 8 decimals
  // But for display, we need to account for the actual decimals used
  return Number(value) / BASE_CURRENCY_DECIMALS;
}

export function useAccountData(userAddress?: Address) {
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const target = userAddress ?? ZERO_ADDRESS;
  const enabled = Boolean(userAddress) && isDeployed;

  const query = useReadContract({
    abi: poolAbi,
    address: addresses.pool,
    functionName: "getUserAccountData",
    args: [target],
    query: { enabled, refetchInterval: 10_000 },
  });

  const [
    totalCollateralBase = 0n,
    totalDebtBase = 0n,
    availableBorrowsBase = 0n,
    currentLiquidationThreshold = 0n,
    ltv = 0n,
    healthFactor = 0n,
  ] = query.data ?? [];

  return {
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    currentLiquidationThreshold,
    ltv,
    healthFactor,
    totalCollateral: toBase(totalCollateralBase),
    totalDebt: toBase(totalDebtBase),
    availableBorrows: toBase(availableBorrowsBase),
    ltvPercent: Number(ltv) / 100,
    liquidationThresholdPercent: Number(currentLiquidationThreshold) / 100,
    healthFactorValue: Number(healthFactor) / 1e18,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
