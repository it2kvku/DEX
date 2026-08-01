"use client";

import { useAccount, useBalance, useChainId, useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abi/erc20";
import { nativeCoingeckoId } from "@/lib/tokens";
import { useTokenList } from "./useTokenList";
import type { Address } from "viem";

export interface AssetRow {
  kind: "native" | "erc20";
  address?: Address; // chỉ có với erc20
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  coingeckoId: string | null;
  isCustom?: boolean;
}

/**
 * Tổng hợp số dư native + toàn bộ token ERC-20 (mặc định + tự import)
 * của chain hiện tại. Trả về mảng AssetRow sẵn sàng để render.
 */
export function useAssets() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { tokens, custom, addToken, removeToken } = useTokenList(chainId);

  // Số dư token bản địa (ETH/BNB/MATIC...).
  const native = useBalance({ address });

  // Đọc song song balanceOf của tất cả token ERC-20 trong 1 multicall.
  const erc20 = useReadContracts({
    allowFailure: true,
    contracts: tokens.map((t) => ({
      address: t.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: !!address && tokens.length > 0 },
  });

  const customSet = new Set(custom.map((t) => t.address.toLowerCase()));
  const rows: AssetRow[] = [];

  if (native.data) {
    rows.push({
      kind: "native",
      symbol: native.data.symbol,
      name: native.data.symbol,
      decimals: native.data.decimals,
      balance: native.data.value,
      coingeckoId: nativeCoingeckoId[chainId] ?? null,
    });
  }

  tokens.forEach((t, i) => {
    const result = erc20.data?.[i];
    const balance =
      result && result.status === "success" ? (result.result as bigint) : 0n;
    rows.push({
      kind: "erc20",
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      balance,
      coingeckoId: t.coingeckoId,
      isCustom: customSet.has(t.address.toLowerCase()),
    });
  });

  return {
    rows,
    tokens,
    addToken,
    removeToken,
    isLoading: native.isLoading || erc20.isLoading,
    isError: native.isError || erc20.isError,
    refetch: () => {
      native.refetch();
      erc20.refetch();
    },
  };
}
