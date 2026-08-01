"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { fetchLifiQuote } from "./lifi";
import {
  fetchSepoliaQuote,
  isSwapChainSupported,
  SEPOLIA_CHAIN_ID,
} from "./uniswapSepolia";

/**
 * Quote swap:
 * - Mainnet (Ethereum/BSC/Polygon/Arbitrum): LI.FI aggregator.
 * - Sepolia: gọi thẳng Uniswap V3 QuoterV2 on-chain.
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
  tokenIn: Address | null;
  tokenOut: Address | null;
  amountInWei: bigint;
  fromAddress: Address | undefined;
  slippageBps: number;
  enabled?: boolean;
}) {
  const publicClient = usePublicClient({ chainId });
  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  return useQuery({
    queryKey: [
      "swap-quote",
      chainId,
      tokenIn,
      tokenOut,
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
      tokenIn !== tokenOut &&
      amountInWei > 0n,
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: () =>
      isSepolia
        ? fetchSepoliaQuote(
            publicClient as PublicClient,
            tokenIn!,
            tokenOut!,
            amountInWei,
            fromAddress!,
            slippageBps,
          )
        : fetchLifiQuote(
            chainId,
            tokenIn!,
            tokenOut!,
            amountInWei,
            fromAddress!,
            slippageBps,
          ),
  });
}
