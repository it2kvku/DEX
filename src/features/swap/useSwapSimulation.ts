"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { NATIVE_TOKEN_ADDRESS } from "./types";
import type { SwapQuote } from "./types";
import { simulateSwap, type SimulationResult } from "./simulate";

/**
 * Chạy preflight simulation cho quote hiện tại.
 *
 * Chạy tự động (không chờ bấm nút) nhưng chỉ khi đã có quote — nếu lệnh sẽ
 * revert thì người dùng biết trước khi ký. Không refetch định kỳ: quote đã tự
 * refetch mỗi 20s, và mỗi quote mới sinh queryKey mới nên simulation chạy lại.
 */
export function useSwapSimulation({
  chainId,
  quote,
  tokenInAddress,
  fromAddress,
  amountInWei,
  overrideAllowance,
  enabled = true,
}: {
  chainId: number;
  quote: SwapQuote | undefined;
  /** Địa chỉ token bán (NATIVE_TOKEN_ADDRESS nếu bán native). */
  tokenInAddress: Address | undefined;
  fromAddress: Address | undefined;
  amountInWei: bigint;
  /** Allowance chưa chắc đủ -> simulation phải override slot allowance. */
  overrideAllowance: boolean;
  enabled?: boolean;
}) {
  const publicClient = usePublicClient({ chainId });
  const isNativeIn = tokenInAddress === NATIVE_TOKEN_ADDRESS;

  return useQuery<SimulationResult>({
    queryKey: [
      "swap-simulation",
      chainId,
      fromAddress,
      quote?.txRequest.data,
      quote?.txRequest.value.toString(),
      overrideAllowance,
    ],
    enabled:
      enabled && !!publicClient && !!quote && !!fromAddress && amountInWei > 0n,
    // Kết quả gắn với calldata cụ thể (đã chứa deadline + amountOutMin) nên
    // không bao giờ "cũ" trong phạm vi một quote.
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    queryFn: () =>
      simulateSwap({
        client: publicClient as PublicClient,
        from: fromAddress!,
        to: quote!.txRequest.to,
        data: quote!.txRequest.data,
        value: quote!.txRequest.value,
        tokenIn: isNativeIn ? undefined : tokenInAddress,
        spender: quote!.approvalAddress,
        amountIn: amountInWei,
        needsAllowance: !isNativeIn && overrideAllowance,
      }),
  });
}
