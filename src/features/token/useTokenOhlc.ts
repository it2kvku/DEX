"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChartRange } from "@/lib/marketData";
import { fetchOhlcv } from "@/lib/geckoterminal";

/**
 * Nến OHLC theo khung thời gian — dữ liệu theo POOL chính của token
 * (GeckoTerminal), chỉ có khi token có pool (stats.topPoolAddress từ
 * useTokenExplore). 1Y/ALL giới hạn 365/730 nến ngày.
 */
export function useTokenOhlc(
  chainId: number,
  topPoolAddress: string | null,
  range: ChartRange,
) {
  // Khung nến theo range; pool chính là nguồn giá thực thi thật (cả buy/sell).
  const timeframe: "day" | "hour" | "minute" =
    range === "1H" ? "minute" : range === "1D" ? "hour" : "day";
  const limit = range === "1H" ? 60 : range === "1D" ? 24 : range === "1W" ? 168 : range === "1M" ? 30 : range === "1Y" ? 365 : 730;

  return useQuery({
    queryKey: ["token-ohlc", chainId, topPoolAddress, range],
    enabled: !!topPoolAddress,
    staleTime: 60_000,
    retry: 0,
    queryFn: () => fetchOhlcv(chainId, topPoolAddress!, timeframe, limit),
  });
}
