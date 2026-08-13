"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchCurrentPrices,
  type PriceInfo,
} from "@/lib/marketData";

export type { PriceInfo };

/**
 * Giá USD + biến động 24h qua DefiLlama (không cần API key, giới hạn thoải mái).
 * `keys` là danh sách key DefiLlama, vd `coingecko:ethereum`, `ethereum:0x…`.
 */
export function usePrices(llamaKeys: string[]) {
  const keys = Array.from(new Set(llamaKeys.filter(Boolean))).sort();

  return useQuery({
    queryKey: ["prices", keys],
    enabled: keys.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: () => fetchCurrentPrices(keys),
  });
}
