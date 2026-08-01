"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useChainId } from "wagmi";
import {
  encodeFunctionData,
  parseUnits,
  type Address,
  isAddress,
} from "viem";
import { erc20Abi } from "@/lib/abi/erc20";

export interface SendParams {
  from?: Address;
  to: string;
  amount: string; // dạng chuỗi người dùng nhập
  decimals: number;
  /** undefined = gửi native; có địa chỉ = gửi ERC-20. */
  tokenAddress?: Address;
}

export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** tổng phí tối đa (wei) = gasLimit * maxFeePerGas. */
  totalFeeWei: bigint;
}

/**
 * Ước tính phí gas theo chuẩn EIP-1559.
 * Chỉ chạy khi các tham số hợp lệ (địa chỉ đúng, số lượng > 0).
 */
export function useGasEstimate(params: SendParams) {
  const client = usePublicClient();
  const chainId = useChainId();

  const valid =
    !!params.from &&
    isAddress(params.to) &&
    !!params.amount &&
    Number(params.amount) > 0;

  return useQuery({
    queryKey: [
      "gas",
      chainId,
      params.from,
      params.to,
      params.amount,
      params.tokenAddress ?? "native",
    ],
    enabled: valid && !!client,
    staleTime: 15_000,
    queryFn: async (): Promise<GasEstimate> => {
      if (!client || !params.from) throw new Error("Chưa sẵn sàng");

      const value = parseUnits(params.amount, params.decimals);

      // Ước tính gasLimit tuỳ loại giao dịch.
      let gasLimit: bigint;
      if (params.tokenAddress) {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [params.to as Address, value],
        });
        gasLimit = await client.estimateGas({
          account: params.from,
          to: params.tokenAddress,
          data,
        });
      } else {
        gasLimit = await client.estimateGas({
          account: params.from,
          to: params.to as Address,
          value,
        });
      }

      // Lấy phí EIP-1559 từ mạng.
      const fees = await client.estimateFeesPerGas();
      const maxFeePerGas = fees.maxFeePerGas ?? 0n;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n;

      // Cộng thêm 15% buffer cho gasLimit để tránh out-of-gas.
      const bufferedGasLimit = (gasLimit * 115n) / 100n;

      return {
        gasLimit: bufferedGasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        totalFeeWei: bufferedGasLimit * maxFeePerGas,
      };
    },
  });
}
