import { type Address } from "viem";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { creditOracleAbi } from "../config/abi";
import { ZERO_ADDRESS, addresses, isDeployed } from "../config/addresses";

export function useCreditScore(userAddress?: Address) {
  const target = userAddress ?? ZERO_ADDRESS;
  const enabled = Boolean(userAddress) && isDeployed;

  const scoreQuery = useReadContract({
    abi: creditOracleAbi,
    address: addresses.creditOracle,
    functionName: "creditScores",
    args: [target],
    query: { enabled },
  });

  const boostQuery = useReadContract({
    abi: creditOracleAbi,
    address: addresses.creditOracle,
    functionName: "getLtvBoost",
    args: [target],
    query: { enabled },
  });

  async function refetch(): Promise<void> {
    await Promise.all([scoreQuery.refetch(), boostQuery.refetch()]);
  }

  useWatchContractEvent({
    abi: creditOracleAbi,
    address: addresses.creditOracle,
    eventName: "ScoreUpdated",
    enabled,
    onLogs: () => {
      void refetch();
    },
  });

  const scoreBps = scoreQuery.data ?? 0n;
  const ltvBoostBps = boostQuery.data ?? 0n;

  return {
    scoreBps,
    score: Number(scoreBps) / 100,
    ltvBoostBps,
    ltvBoostPercent: Number(ltvBoostBps) / 100,
    hasScore: scoreBps > 0n,
    isLoading: scoreQuery.isLoading || boostQuery.isLoading,
    isFetching: scoreQuery.isFetching || boostQuery.isFetching,
    error: scoreQuery.error ?? boostQuery.error,
    refetch,
  };
}
