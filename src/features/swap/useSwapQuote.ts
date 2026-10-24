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
 * - Engine chain (Ethereum/Arbitrum/Polygon/Sepolia): routing engine Uniswap V3
 *   tự viết; trên mainnet và L2 còn gọi THÊM LI.FI để so sánh và chọn bên cho
 *   net output cao hơn (xem quoteSource.ts). Sepolia không có aggregator nên
 *   engine là nguồn duy nhất.
 * - Chain còn lại (BSC): LI.FI aggregator.
 * Mọi nguồn trả về cùng shape SwapQuote nên UI không cần phân nhánh.
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

  const nativeIn = tokenIn?.address === NATIVE_TOKEN_ADDRESS;
  const nativeOut = tokenOut?.address === NATIVE_TOKEN_ADDRESS;

  // Native và wrapped là cùng một tài sản — không có pool, chặn trước khi gọi
  // RPC. Chỉ áp cho engine chain vì LI.FI tự xử wrap/unwrap theo cách riêng.
  const wrapped = wrappedNativeOf(chainId);
  const isWrapped = (t: RouteToken | null) =>
    !!wrapped && t?.address.toLowerCase() === wrapped.address.toLowerCase();
  const sameAsset =
    !!tokenIn &&
    !!tokenOut &&
    (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase() ||
      (nativeIn && isWrapped(tokenOut)) ||
      (nativeOut && isWrapped(tokenIn)));

  const engine = isEngineChain(chainId);

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
