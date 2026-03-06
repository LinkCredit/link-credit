import { type Address, formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "../config/abi";
import { ZERO_ADDRESS, useDeployedAddresses, useIsDeployed } from "../config/addresses";

type AssetBalance = {
  balance: bigint;
  formatted: string;
  decimals: number;
  symbol: string;
};

export function useWalletBalances(userAddress?: Address) {
  const addresses = useDeployedAddresses();
  const isDeployed = useIsDeployed();
  const enabled = Boolean(userAddress) && userAddress !== ZERO_ADDRESS && isDeployed;

  const assets = [
    { address: addresses.weth, symbol: "WETH", decimals: 18 },
    { address: addresses.usdx, symbol: "USDX", decimals: 18 },
    { address: addresses.wbtc, symbol: "WBTC", decimals: 8 },
  ].filter((asset) => asset.address !== ZERO_ADDRESS);

  const contracts = assets.flatMap((asset) => [
    {
      abi: erc20Abi,
      address: asset.address,
      functionName: "balanceOf" as const,
      args: userAddress ? [userAddress] : undefined,
    },
    {
      abi: erc20Abi,
      address: asset.address,
      functionName: "decimals" as const,
    },
  ]);

  const query = useReadContracts({
    contracts,
    query: { enabled, refetchInterval: 10_000 },
  });

  const balances: Record<Address, AssetBalance> = {};

  if (query.data) {
    assets.forEach((asset, index) => {
      const balanceResult = query.data[index * 2];
      const decimalsResult = query.data[index * 2 + 1];

      const balance = balanceResult?.status === "success" ? balanceResult.result : 0n;
      const decimals = decimalsResult?.status === "success" ? decimalsResult.result : asset.decimals;

      balances[asset.address] = {
        balance,
        formatted: formatUnits(balance, decimals),
        decimals,
        symbol: asset.symbol,
      };
    });
  }

  return {
    balances,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
