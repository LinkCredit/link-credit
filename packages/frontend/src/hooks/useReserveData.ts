import { type Address } from "viem";
import { useReadContract } from "wagmi";
import { poolAbi } from "../config/abi";
import { ZERO_ADDRESS, useDeployedAddresses, useIsDeployed } from "../config/addresses";

const RAY = 1e27;

function rayToPercent(ray: bigint): number {
  return (Number(ray) / RAY) * 100;
}

export function useReserveData(asset?: Address) {
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const enabled = Boolean(asset) && asset !== ZERO_ADDRESS && isDeployed;

  const query = useReadContract({
    abi: poolAbi,
    address: addresses.pool,
    functionName: "getReserveData",
    args: asset ? [asset] : undefined,
    query: { enabled, refetchInterval: 30_000 },
  });

  const data = query.data;

  return {
    liquidityRate: data ? rayToPercent(data.currentLiquidityRate) : 0,
    variableBorrowRate: data ? rayToPercent(data.currentVariableBorrowRate) : 0,
    aTokenAddress: data?.aTokenAddress ?? ZERO_ADDRESS,
    lastUpdateTimestamp: data ? Number(data.lastUpdateTimestamp) : 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
