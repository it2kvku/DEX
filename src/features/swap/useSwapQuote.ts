"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { fetchLifiQuote } from "./lifi";
import { NATIVE_TOKEN_ADDRESS } from "./types";
import type { SwapQuote } from "./types";
import {
  fetchUniswapV3Quote,
  isSwapChainSupported,
  SEPOLIA_CHAIN_ID,
} from "./uniswapV3";
import { isEngineChain, wrappedNativeOf } from "./routing/chains";
import { pickBestQuote } from "./quoteSource";
import type { RouteToken } from "./routing/path";

/**
 * Quote swap theo chain:
 * - Cross-chain (toChainId !== chainId): LI.FI bridge — engine nội bộ chỉ chạy
 *   cùng chain, và comparison hai nguồn không có nghĩa khi hai bên khác chain.
 * - Engine chain (Ethereum/Arbitrum/Polygon/Base/Sepolia), cùng chain: routing
 *   engine Uniswap V3 tự viết; trên mainnet/L2 còn gọi THÊM LI.FI để so sánh
 *   và chọn bên cho net output cao hơn (xem quoteSource.ts). Sepolia không có
 *   aggregator nên engine là nguồn duy nhất.
 * - Chain còn lại (BSC): LI.FI aggregator.
 *
 * staleTime 15s + tự refetch mỗi 20s vì quote là "estimated" —
 * blockchain luôn thay đổi, quote cũ dễ trượt khi execute.
 * Slippage nằm trong queryKey vì được áp ngay từ quote/calldata.
 */
export function useSwapQuote({
  chainId,
  toChainId,
  tokenIn,
  tokenOut,
  amountInWei,
  fromAddress,
  slippageBps,
  enabled = true,
}: {
  chainId: number;
  /** Chain đích — khác chainId = cross-chain bridge. Mặc định cùng chain. */
  toChainId?: number;
  /** null khi người dùng chưa chọn token. */
  tokenIn: RouteToken | null;
  tokenOut: RouteToken | null;
  amountInWei: bigint;
  fromAddress: `0x${string}` | undefined;
  slippageBps: number;
  enabled?: boolean;
}) {
  const publicClient = usePublicClient({ chainId });
  const destChainId = toChainId ?? chainId;
  const crossChain = destChainId !== chainId;

  const nativeIn = tokenIn?.address === NATIVE_TOKEN_ADDRESS;
  const nativeOut = tokenOut?.address === NATIVE_TOKEN_ADDRESS;

  // Native và wrapped là cùng một tài sản — không có pool, chặn trước khi gọi
  // RPC. Chỉ áp cho cùng chain (engine) và cùng token trên LI.FI; bridge sang
  // chain khác nhận wrapped là hợp lệ (LI.FI tự xử).
  const wrapped = wrappedNativeOf(chainId);
  const isWrapped = (t: RouteToken | null) =>
    !!wrapped && t?.address.toLowerCase() === wrapped.address.toLowerCase();
  const sameAsset =
    !crossChain &&
    !!tokenIn &&
    !!tokenOut &&
    (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase() ||
      (nativeIn && isWrapped(tokenOut)) ||
      (nativeOut && isWrapped(tokenIn)));

  const engine = isEngineChain(chainId) && !crossChain;

  return useQuery<SwapQuote>({
    queryKey: [
      "swap-quote",
      chainId,
      destChainId,
      tokenIn?.address,
      tokenOut?.address,
      amountInWei.toString(),
      fromAddress,
      slippageBps,
    ],
    enabled:
      enabled &&
      isSwapChainSupported(chainId) &&
      (crossChain ? isSwapChainSupported(destChainId) : true) &&
      (!engine || !!publicClient) &&
      !!tokenIn &&
      !!tokenOut &&
      !!fromAddress &&
      !sameAsset &&
      amountInWei > 0n,
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      // Cross-chain: chỉ LI.FI — không engine (chỉ cùng chain), không so sánh.
      if (crossChain) {
        return fetchLifiQuote(
          chainId,
          tokenIn!.address,
          tokenOut!.address,
          amountInWei,
          fromAddress!,
          slippageBps,
          destChainId,
        );
      }

      if (engine && tokenIn && tokenOut && fromAddress) {
        // Mainnet/L2: hai nguồn chạy song song rồi chọn bên tốt hơn; một bên
        // chết (rate-limit, không route) thì dùng bên còn lại — allSettled.
        const lifiToo = chainId !== SEPOLIA_CHAIN_ID;
        const [engineRes, lifiRes] = await Promise.allSettled([
          fetchUniswapV3Quote({
            chainId,
            client: publicClient as PublicClient,
            tokenIn,
            tokenOut,
            nativeIn,
            nativeOut,
            amountInWei,
            fromAddress,
            slippageBps,
          }),
          lifiToo
            ? fetchLifiQuote(
                chainId,
                tokenIn.address,
                tokenOut.address,
                amountInWei,
                fromAddress,
                slippageBps,
              )
            : Promise.reject(new Error("no-aggregator-on-testnet")),
        ]);

        const engineQuote =
          engineRes.status === "fulfilled" ? engineRes.value : null;
        const lifiQuote =
          lifiRes.status === "fulfilled" ? lifiRes.value : null;

        return pickBestQuote(engineQuote, lifiQuote);
      }

      return fetchLifiQuote(
        chainId,
        tokenIn!.address,
        tokenOut!.address,
        amountInWei,
        fromAddress!,
        slippageBps,
      );
    },
  });
}
