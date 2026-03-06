import { type Address } from "viem";
import { useDeployedAddresses, ZERO_ADDRESS } from "../config/addresses";
import { useReserveData } from "./useReserveData";

type ReserveInfo = {
  asset: Address;
  symbol: string;
  liquidityRate: number;
  variableBorrowRate: number;
  aTokenAddress: Address;
  lastUpdateTimestamp: number;
};

export function useAllReserves() {
  const addresses = useDeployedAddresses();

  const assets = [
    { address: addresses.weth, symbol: "WETH" },
    { address: addresses.usdx, symbol: "USDX" },
    { address: addresses.wbtc, symbol: "WBTC" },
  ].filter((asset) => asset.address !== ZERO_ADDRESS);

  const wethData = useReserveData(addresses.weth);
  const usdxData = useReserveData(addresses.usdx);
  const wbtcData = useReserveData(addresses.wbtc);

  const reserveDataArray = [
    { asset: addresses.weth, symbol: "WETH", data: wethData },
    { asset: addresses.usdx, symbol: "USDX", data: usdxData },
    { asset: addresses.wbtc, symbol: "WBTC", data: wbtcData },
  ].filter((item) => item.asset !== ZERO_ADDRESS);

  const reserves: ReserveInfo[] = reserveDataArray.map((item) => ({
    asset: item.asset,
    symbol: item.symbol,
    liquidityRate: item.data.liquidityRate,
    variableBorrowRate: item.data.variableBorrowRate,
    aTokenAddress: item.data.aTokenAddress,
    lastUpdateTimestamp: item.data.lastUpdateTimestamp,
  }));

  const isLoading = reserveDataArray.some((item) => item.data.isLoading);
  const isFetching = reserveDataArray.some((item) => item.data.isFetching);
  const error = reserveDataArray.find((item) => item.data.error)?.data.error ?? null;

  return {
    reserves,
    isLoading,
    isFetching,
    error,
  };
}
