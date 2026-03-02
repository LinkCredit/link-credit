import { useCallback, useState } from "react";
import { parseUnits, type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi, poolAbi } from "../config/abi";
import { addresses, isDeployed } from "../config/addresses";

const INTEREST_RATE_MODE_VARIABLE = 2n;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split("\n")[0];
  }
  return "Transaction failed.";
}

export function useLending() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);

  const waitForReceipt = useCallback(
    async (hash: Hash) => {
      if (!publicClient) {
        throw new Error("No public client available.");
      }
      await publicClient.waitForTransactionReceipt({ hash });
    },
    [publicClient]
  );

  const resolveAmount = useCallback(
    async (asset: Address, rawAmount: string) => {
      if (!publicClient) {
        throw new Error("No public client available.");
      }

      const decimals = await publicClient.readContract({
        abi: erc20Abi,
        address: asset,
        functionName: "decimals",
      });

      const amount = parseUnits(rawAmount, decimals);
      if (amount <= 0n) {
        throw new Error("Amount must be greater than zero.");
      }
      return amount;
    },
    [publicClient]
  );

  const ensureAllowance = useCallback(
    async (asset: Address, amount: bigint) => {
      if (!address) {
        throw new Error("Connect wallet first.");
      }
      if (!publicClient) {
        throw new Error("No public client available.");
      }

      const allowance = (await publicClient.readContract({
        abi: erc20Abi,
        address: asset,
        functionName: "allowance",
        args: [address, addresses.pool],
      })) as bigint;

      if (allowance >= amount) {
        return;
      }

      setPendingAction("Approve token");
      const approveHash = await writeContractAsync({
        abi: erc20Abi,
        address: asset,
        functionName: "approve",
        args: [addresses.pool, amount],
      });
      setLastTxHash(approveHash);
      await waitForReceipt(approveHash);
    },
    [address, publicClient, waitForReceipt, writeContractAsync]
  );

  const supply = useCallback(
    async (asset: Address, rawAmount: string) => {
      setError(null);
      if (!address) {
        setError("Connect wallet first.");
        return;
      }
      if (!isDeployed) {
        setError("Contracts are not configured.");
        return;
      }

      try {
        const amount = await resolveAmount(asset, rawAmount);
        await ensureAllowance(asset, amount);

        setPendingAction("Supply");
        const hash = await writeContractAsync({
          abi: poolAbi,
          address: addresses.pool,
          functionName: "supply",
          args: [asset, amount, address, 0],
        });
        setLastTxHash(hash);
        await waitForReceipt(hash);
      } catch (txError) {
        setError(formatError(txError));
      } finally {
        setPendingAction(null);
      }
    },
    [address, ensureAllowance, resolveAmount, waitForReceipt, writeContractAsync]
  );

  const borrow = useCallback(
    async (asset: Address, rawAmount: string, maxAmountUnits?: bigint) => {
      setError(null);
      if (!address) {
        setError("Connect wallet first.");
        return;
      }
      if (!isDeployed) {
        setError("Contracts are not configured.");
        return;
      }

      try {
        const amount = await resolveAmount(asset, rawAmount);
        if (typeof maxAmountUnits === "bigint" && amount > maxAmountUnits) {
          setError("Borrow amount exceeds current maximum available.");
          return;
        }
        setPendingAction("Borrow");
        const hash = await writeContractAsync({
          abi: poolAbi,
          address: addresses.pool,
          functionName: "borrow",
          args: [asset, amount, INTEREST_RATE_MODE_VARIABLE, 0, address],
        });
        setLastTxHash(hash);
        await waitForReceipt(hash);
      } catch (txError) {
        setError(formatError(txError));
      } finally {
        setPendingAction(null);
      }
    },
    [address, resolveAmount, waitForReceipt, writeContractAsync]
  );

  return {
    supply,
    borrow,
    pendingAction,
    isPending: isPending || pendingAction !== null,
    error,
    clearError: () => setError(null),
    lastTxHash,
  };
}
