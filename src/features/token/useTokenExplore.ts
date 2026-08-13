"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchMarketChart } from "@/lib/marketData";
import {
  fetchCoinAbout,
  fetchGeckoPools,
  fetchGeckoTokenStats,
  fetchGeckoTrades,
  geckoTokenAddress,
  GECKO_NETWORK,
} from "@/lib/geckoterminal";
import type { TokenDetail } from "./useTokenDetail";

export function useTokenExplore(
  chainId: number,
  detail: TokenDetail | null,
  llamaKey: string | null,
) {
  const enabled = !!detail && !!GECKO_NETWORK[chainId];

  const statsQuery = useQuery({
    queryKey: [
      "token-stats",
      chainId,
      detail?.kind,
      detail?.address,
      llamaKey,
    ],
    enabled: enabled && !!detail,
    staleTime: 120_000,
    queryFn: async () => {
      let yearPrices: number[] = [];
      if (llamaKey) {
        try {
          const chart = await fetchMarketChart(llamaKey, "1Y");
          yearPrices = chart.points.map((p) => p.price);
        } catch {
          /* 52W optional */
        }
      }
      return fetchGeckoTokenStats(
        chainId,
        detail!.kind,
        detail!.address,
        yearPrices,
      );
    },
  });

  const poolsQuery = useQuery({
    queryKey: ["token-pools", chainId, detail?.kind, detail?.address],
    enabled: enabled && !!detail,
    staleTime: 120_000,
    queryFn: () =>
      fetchGeckoPools(chainId, detail!.kind, detail!.address),
  });

  const tokenAddr =
    detail &&
    geckoTokenAddress(chainId, detail.kind, detail.address as Address);

  const tradesQuery = useQuery({
    queryKey: [
      "token-trades",
      chainId,
      statsQuery.data?.topPoolAddress,
      tokenAddr,
    ],
    enabled:
      enabled && !!statsQuery.data?.topPoolAddress && !!tokenAddr,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: () =>
      fetchGeckoTrades(
        chainId,
        statsQuery.data!.topPoolAddress!,
        tokenAddr!,
      ),
  });

  const aboutQuery = useQuery({
    queryKey: ["token-about", statsQuery.data?.coingeckoId],
    enabled: !!statsQuery.data?.coingeckoId,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 0,
    queryFn: () => fetchCoinAbout(statsQuery.data!.coingeckoId!),
  });

  return {
    stats: statsQuery.data,
    statsLoading: statsQuery.isLoading,
    pools: poolsQuery.data ?? [],
    poolsLoading: poolsQuery.isLoading,
    trades: tradesQuery.data ?? [],
    tradesLoading: tradesQuery.isLoading,
    about: aboutQuery.data,
    aboutLoading: aboutQuery.isLoading,
    supported: enabled,
  };
}
