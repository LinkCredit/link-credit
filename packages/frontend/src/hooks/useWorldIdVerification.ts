import { type Address } from "viem";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { worldIdRegistryAbi } from "../config/abi";
import {
  ZERO_ADDRESS,
  useDeployedAddresses,
  useIsDeployed,
} from "../config/addresses";

export function useWorldIdVerification(userAddress?: Address) {
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const target = userAddress ?? ZERO_ADDRESS;
  const enabled =
    Boolean(userAddress) &&
    isDeployed &&
    addresses.worldIdRegistry !== ZERO_ADDRESS;

  const isVerifiedQuery = useReadContract({
    abi: worldIdRegistryAbi,
    address: addresses.worldIdRegistry,
    functionName: "isVerified",
    args: [target],
    query: { enabled },
  });

  const verificationBoostQuery = useReadContract({
    abi: worldIdRegistryAbi,
    address: addresses.worldIdRegistry,
    functionName: "getVerificationBoost",
    args: [target],
    query: { enabled },
  });

  async function refetch(): Promise<void> {
    await Promise.all([isVerifiedQuery.refetch(), verificationBoostQuery.refetch()]);
  }

  useWatchContractEvent({
    abi: worldIdRegistryAbi,
    address: addresses.worldIdRegistry,
    eventName: "VerificationUpdated",
    enabled,
    onLogs: () => {
      void refetch();
    },
  });

  const verificationBoostBps = verificationBoostQuery.data ?? 0n;
  const isVerified = isVerifiedQuery.data ?? false;

  return {
    isVerified,
    verificationBoostBps,
    verificationBoostPercent: Number(verificationBoostBps) / 100,
    isLoading: isVerifiedQuery.isLoading || verificationBoostQuery.isLoading,
    isFetching: isVerifiedQuery.isFetching || verificationBoostQuery.isFetching,
    error: isVerifiedQuery.error ?? verificationBoostQuery.error,
    refetch,
  };
}
