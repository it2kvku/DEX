"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchMarketChart,
  type ChartRange,
  type MarketChart,
} from "@/lib/marketData";

export function useTokenChart(llamaKey: string | null, range: ChartRange) {
  return useQuery<MarketChart>({
    queryKey: ["token-chart", llamaKey, range],
    enabled: !!llamaKey,
    staleTime: range === "1H" || range === "1D" ? 60_000 : 5 * 60_000,
    refetchInterval: range === "1H" || range === "1D" ? 60_000 : undefined,
    retry: 1,
    queryFn: () => fetchMarketChart(llamaKey!, range),
  });
}
