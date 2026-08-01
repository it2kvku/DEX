"use client";

import { useQuery } from "@tanstack/react-query";

export interface PriceInfo {
  usd: number;
  /** Biến động giá 24h (%), có thể âm. */
  change24h: number;
}

/**
 * Lấy giá USD + biến động 24h theo danh sách id CoinGecko.
 * Dùng endpoint công khai (không cần API key). Kết quả cache 60s.
 */
export function usePrices(coingeckoIds: string[]) {
  // Loại trùng + bỏ rỗng để query key ổn định.
  const ids = Array.from(new Set(coingeckoIds.filter(Boolean))).sort();

  return useQuery({
    queryKey: ["prices", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, PriceInfo>> => {
      const url =
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}` +
        `&vs_currencies=usd&include_24hr_change=true`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`CoinGecko trả về ${res.status}`);
      }
      const data = (await res.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;
      const prices: Record<string, PriceInfo> = {};
      for (const id of ids) {
        prices[id] = {
          usd: data[id]?.usd ?? 0,
          change24h: data[id]?.usd_24h_change ?? 0,
        };
      }
      return prices;
    },
  });
}
