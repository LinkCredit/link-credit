import { type Address } from "viem";
import { useReadContract } from "wagmi";
import { protocolDataProviderAbi } from "../config/abi";
import { ZERO_ADDRESS, useDeployedAddresses, useIsDeployed } from "../config/addresses";

export function useUserReserveData(asset?: Address, userAddress?: Address) {
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const enabled =
    Boolean(asset) &&
    asset !== ZERO_ADDRESS &&
    Boolean(userAddress) &&
    userAddress !== ZERO_ADDRESS &&
    isDeployed;

  const query = useReadContract({
    abi: protocolDataProviderAbi,
    address: addresses.protocolDataProvider,
    functionName: "getUserReserveData",
    args: asset && userAddress ? [asset, userAddress] : undefined,
    query: { enabled, refetchInterval: 10_000 },
  });

  const [
    currentATokenBalance = 0n,
    currentStableDebt = 0n,
    currentVariableDebt = 0n,
    principalStableDebt = 0n,
    scaledVariableDebt = 0n,
    stableBorrowRate = 0n,
    liquidityRate = 0n,
    stableRateLastUpdated = 0,
    usageAsCollateralEnabled = false,
  ] = query.data ?? [];

  return {
    currentATokenBalance,
    currentStableDebt,
    currentVariableDebt,
    principalStableDebt,
    scaledVariableDebt,
    stableBorrowRate,
    liquidityRate,
    stableRateLastUpdated,
    usageAsCollateralEnabled,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
