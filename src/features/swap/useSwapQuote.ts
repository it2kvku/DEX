"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { fetchLifiQuote } from "./lifi";
import { NATIVE_TOKEN_ADDRESS } from "./types";
import type { SwapQuote } from "./types";
import {
  fetchSepoliaQuote,
  isSwapChainSupported,
  SEPOLIA_CHAIN_ID,
  WETH_SEPOLIA,
} from "./uniswapSepolia";
import type { RouteToken } from "./routing/path";

/**
 * Quote swap:
 * - Mainnet (Ethereum/BSC/Polygon/Arbitrum): LI.FI aggregator.
 * - Sepolia: routing engine Uniswap V3 tự viết (multi-hop + best execution).
 * Cả hai trả về cùng shape SwapQuote nên UI không cần phân nhánh.
 *
 * staleTime 15s + tự refetch mỗi 20s vì quote là "estimated" —
 * blockchain luôn thay đổi, quote cũ dễ trượt khi execute.
 * Slippage nằm trong queryKey vì được áp ngay từ quote/calldata.
 */
export function useSwapQuote({
  chainId,
  tokenIn,
  tokenOut,
  amountInWei,
  fromAddress,
  slippageBps,
  enabled = true,
}: {
  chainId: number;
  /** null khi người dùng chưa chọn token. */
  tokenIn: RouteToken | null;
  tokenOut: RouteToken | null;
  amountInWei: bigint;
  fromAddress: `0x${string}` | undefined;
  slippageBps: number;
  enabled?: boolean;
}) {
  const publicClient = usePublicClient({ chainId });
  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  const nativeIn = tokenIn?.address === NATIVE_TOKEN_ADDRESS;
  const nativeOut = tokenOut?.address === NATIVE_TOKEN_ADDRESS;

  // ETH và WETH là cùng tài sản — không có pool, chặn trước khi gọi RPC.
  const sameAsset =
    !!tokenIn &&
    !!tokenOut &&
    (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase() ||
      (isSepolia &&
        ((nativeIn && tokenOut.address.toLowerCase() === WETH_SEPOLIA.toLowerCase()) ||
          (nativeOut && tokenIn.address.toLowerCase() === WETH_SEPOLIA.toLowerCase()))));

  return useQuery<SwapQuote>({
    queryKey: [
      "swap-quote",
      chainId,
      tokenIn?.address,
      tokenOut?.address,
      amountInWei.toString(),
      fromAddress,
      slippageBps,
    ],
    enabled:
      enabled &&
      isSwapChainSupported(chainId) &&
      (!isSepolia || !!publicClient) &&
      !!tokenIn &&
      !!tokenOut &&
      !!fromAddress &&
      !sameAsset &&
      amountInWei > 0n,
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: () =>
      isSepolia
        ? fetchSepoliaQuote({
            client: publicClient as PublicClient,
            tokenIn: tokenIn!,
            tokenOut: tokenOut!,
            nativeIn,
            nativeOut,
            amountInWei,
            fromAddress: fromAddress!,
            slippageBps,
          })
        : fetchLifiQuote(
            chainId,
            tokenIn!.address,
            tokenOut!.address,
            amountInWei,
            fromAddress!,
            slippageBps,
          ),
  });
}
