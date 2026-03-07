import { useCallback, useState } from "react";
import { parseUnits, type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi, poolAbi } from "../config/abi";
import { useDeployedAddresses, useIsDeployed } from "../config/addresses";

const INTEREST_RATE_MODE_VARIABLE = 2n;
const RECEIPT_TIMEOUT_MS = 120_000;
const RECEIPT_FALLBACK_POLL_MS = 120_000;
const RECEIPT_POLL_INTERVAL_MS = 3_000;
const ALLOWANCE_POLL_TIMEOUT_MS = 120_000;
const ALLOWANCE_POLL_INTERVAL_MS = 2_000;

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Timed out while waiting for transaction receipt.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);

  const waitForReceipt = useCallback(
    async (hash: Hash) => {
      if (!publicClient) {
        throw new Error("No public client available.");
      }
      try {
        await Promise.race([
          publicClient.waitForTransactionReceipt({ hash }),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("Timed out while waiting for transaction receipt.")),
              RECEIPT_TIMEOUT_MS
            );
          }),
        ]);
      } catch (error) {
        if (!isTimeoutError(error)) {
          throw error;
        }

        const deadline = Date.now() + RECEIPT_FALLBACK_POLL_MS;
        while (Date.now() < deadline) {
          const receipt = await publicClient
            .getTransactionReceipt({ hash })
            .catch(() => null);
          if (receipt) {
            return;
          }
          await sleep(RECEIPT_POLL_INTERVAL_MS);
        }

        throw new Error(
          "Transaction was sent, but receipt confirmation is delayed. Please check Last tx in Etherscan and refresh."
        );
      }
    },
    [publicClient]
  );

  const readAllowance = useCallback(
    async (asset: Address): Promise<bigint> => {
      if (!address) {
        throw new Error("Connect wallet first.");
      }
      if (!publicClient) {
        throw new Error("No public client available.");
      }
      return (await publicClient.readContract({
        abi: erc20Abi,
        address: asset,
        functionName: "allowance",
        args: [address, addresses.pool],
      })) as bigint;
    },
    [address, addresses.pool, publicClient]
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

  const waitForAllowance = useCallback(
    async (asset: Address, requiredAmount: bigint) => {
      const deadline = Date.now() + ALLOWANCE_POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const allowance = await readAllowance(asset);
        if (allowance >= requiredAmount) {
          return;
        }
        await sleep(ALLOWANCE_POLL_INTERVAL_MS);
      }
      throw new Error(
        "Approve was submitted, but allowance is not updated yet. Please wait for confirmation and try again."
      );
    },
    [readAllowance]
  );

  const ensureAllowance = useCallback(
    async (asset: Address, amount: bigint) => {
      if (!address) {
        throw new Error("Connect wallet first.");
      }
      if (!publicClient) {
        throw new Error("No public client available.");
      }

      const allowance = await readAllowance(asset);

      if (allowance >= amount) {
        return;
      }

      try {
        setPendingAction("Approve token");
        const approveHash = await writeContractAsync({
          abi: erc20Abi,
          address: asset,
          functionName: "approve",
          args: [addresses.pool, amount],
        });
        setLastTxHash(approveHash);
        await waitForAllowance(asset, amount);
      } finally {
        setPendingAction(null);
      }
    },
    [
      address,
      addresses.pool,
      publicClient,
      readAllowance,
      waitForAllowance,
      writeContractAsync,
    ]
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
    [
      address,
      addresses.pool,
      ensureAllowance,
      isDeployed,
      resolveAmount,
      waitForReceipt,
      writeContractAsync,
    ]
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
    [address, addresses.pool, isDeployed, resolveAmount, waitForReceipt, writeContractAsync]
  );

  const withdraw = useCallback(
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
        setPendingAction("Withdraw");
        const hash = await writeContractAsync({
          abi: poolAbi,
          address: addresses.pool,
          functionName: "withdraw",
          args: [asset, amount, address],
        });
        setLastTxHash(hash);
        await waitForReceipt(hash);
      } catch (txError) {
        setError(formatError(txError));
      } finally {
        setPendingAction(null);
      }
    },
    [address, addresses.pool, isDeployed, resolveAmount, waitForReceipt, writeContractAsync]
  );

  const repay = useCallback(
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

        setPendingAction("Repay");
        const hash = await writeContractAsync({
          abi: poolAbi,
          address: addresses.pool,
          functionName: "repay",
          args: [asset, amount, INTEREST_RATE_MODE_VARIABLE, address],
        });
        setLastTxHash(hash);
        await waitForReceipt(hash);
      } catch (txError) {
        setError(formatError(txError));
      } finally {
        setPendingAction(null);
      }
    },
    [
      address,
      addresses.pool,
      ensureAllowance,
      isDeployed,
      resolveAmount,
      waitForReceipt,
      writeContractAsync,
    ]
  );

  return {
    supply,
    borrow,
    withdraw,
    repay,
    pendingAction,
    isPending: isPending || pendingAction !== null,
    error,
    clearError: () => setError(null),
    lastTxHash,
  };
}
