import { type Address } from "viem";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { creditOracleAbi, poolAbi } from "../config/abi";
import {
  ZERO_ADDRESS,
  useDeployedAddresses,
  useIsDeployed,
} from "../config/addresses";
import { useWorldIdVerification } from "./useWorldIdVerification";

function resolveBaseLtvBps(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value & 0xffffn;
  }

  if (Array.isArray(value) && typeof value[0] === "bigint") {
    return value[0] & 0xffffn;
  }

  if (typeof value === "object" && value !== null && "data" in value) {
    const raw = (value as { data?: unknown }).data;
    if (typeof raw === "bigint") {
      return raw & 0xffffn;
    }
  }

  return 0n;
}

export function useCreditScore(userAddress?: Address) {
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const worldIdVerification = useWorldIdVerification(userAddress);
  const target = userAddress ?? ZERO_ADDRESS;
  const enabled = Boolean(userAddress) && isDeployed;
  const baseLtvAsset =
    addresses.weth !== ZERO_ADDRESS
      ? addresses.weth
      : addresses.usdx !== ZERO_ADDRESS
        ? addresses.usdx
        : addresses.wbtc;

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

  const baseLtvQuery = useReadContract({
    abi: poolAbi,
    address: addresses.pool,
    functionName: "getConfiguration",
    args: [baseLtvAsset],
    query: { enabled: isDeployed && baseLtvAsset !== ZERO_ADDRESS },
  });

  async function refetch(): Promise<void> {
    await Promise.all([
      scoreQuery.refetch(),
      boostQuery.refetch(),
      baseLtvQuery.refetch(),
      worldIdVerification.refetch(),
    ]);
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
  const baseLtvBps = resolveBaseLtvBps(baseLtvQuery.data);
  const worldIdBoostBps = worldIdVerification.verificationBoostBps;
  const plaidBoostBps =
    ltvBoostBps > worldIdBoostBps ? ltvBoostBps - worldIdBoostBps : 0n;

  return {
    scoreBps,
    score: Number(scoreBps) / 100,
    baseLtvBps,
    baseLtvPercent: Number(baseLtvBps) / 100,
    hasBaseLtv: baseLtvQuery.data !== undefined,
    ltvBoostBps,
    ltvBoostPercent: Number(ltvBoostBps) / 100,
    plaidBoostBps,
    plaidBoostPercent: Number(plaidBoostBps) / 100,
    worldIdBoostBps,
    worldIdBoostPercent: Number(worldIdBoostBps) / 100,
    isWorldIdVerified: worldIdVerification.isVerified,
    hasScore: scoreBps > 0n,
    isLoading:
      scoreQuery.isLoading ||
      boostQuery.isLoading ||
      baseLtvQuery.isLoading ||
      worldIdVerification.isLoading,
    isFetching:
      scoreQuery.isFetching ||
      boostQuery.isFetching ||
      baseLtvQuery.isFetching ||
      worldIdVerification.isFetching,
    error:
      scoreQuery.error ??
      boostQuery.error ??
      baseLtvQuery.error ??
      worldIdVerification.error,
    refetch,
  };
}
