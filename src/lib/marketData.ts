import type { Address } from "viem";
import { getAddress } from "viem";
import { mainnet, bsc, polygon, arbitrum, sepolia } from "wagmi/chains";
import { nativeCoingeckoId } from "@/lib/tokens";

/** Chain slug dùng trong key DefiLlama (`ethereum:0x…`). */
export const LLAMA_CHAIN: Partial<Record<number, string>> = {
  [mainnet.id]: "ethereum",
  [bsc.id]: "bsc",
  [polygon.id]: "polygon",
  [arbitrum.id]: "arbitrum",
};

/** Native asset — prefix `coingecko:` vì DefiLlama index theo id CoinGecko. */
export const NATIVE_LLAMA_KEY: Record<number, string> = {
  [mainnet.id]: "coingecko:ethereum",
  [bsc.id]: "coingecko:binancecoin",
  [polygon.id]: "coingecko:matic-network",
  [arbitrum.id]: "coingecko:ethereum",
  [sepolia.id]: "coingecko:ethereum",
};

/** Sepolia testnet → key mainnet để chart/giá tham khảo. */
export const SEPOLIA_LLAMA_FALLBACK: Record<string, string> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": "coingecko:ethereum",
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238":
    "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984":
    "ethereum:0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
};

export type ChartRange = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

export interface ChartPoint {
  time: number;
  price: number;
}

export interface MarketChart {
  points: ChartPoint[];
  openPrice: number;
  closePrice: number;
}

export interface PriceInfo {
  usd: number;
  change24h: number;
}

const RANGE_CONFIG: Record<
  ChartRange,
  { span: number; period: "1h" | "1d" }
> = {
  "1H": { span: 24, period: "1h" },
  "1D": { span: 24, period: "1h" },
  "1W": { span: 168, period: "1h" },
  "1M": { span: 30, period: "1d" },
  "1Y": { span: 365, period: "1d" },
  ALL: { span: 730, period: "1d" },
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DefiLlama trả về ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Sepolia dùng giá tham khảo mainnet. */
export function isReferenceChart(chainId: number): boolean {
  return chainId === sepolia.id;
}

/** Tạo key DefiLlama cho native hoặc ERC-20. */
export function toLlamaKey(
  chainId: number,
  kind: "native" | "erc20",
  address?: Address,
): string | null {
  if (kind === "native") {
    return NATIVE_LLAMA_KEY[chainId] ?? null;
  }
  if (!address) return null;

  const lower = address.toLowerCase();
  const sepoliaFb = SEPOLIA_LLAMA_FALLBACK[lower];
  if (sepoliaFb) return sepoliaFb;

  const chain = LLAMA_CHAIN[chainId];
  if (!chain) return null;

  try {
    return `${chain}:${getAddress(address)}`;
  } catch {
    return `${chain}:${lower}`;
  }
}

/** Key từ coingeckoId (dùng ở AssetList cho token đã map sẵn). */
export function coingeckoIdToLlamaKey(id: string): string {
  return id.startsWith("coingecko:") ? id : `coingecko:${id}`;
}

/** Key cho một dòng tài sản. */
export function llamaKeyForAsset(
  chainId: number,
  row: {
    kind: "native" | "erc20";
    address?: Address;
    coingeckoId: string | null;
  },
): string | null {
  if (row.kind === "native") {
    return toLlamaKey(chainId, "native");
  }
  if (row.address) {
    const fromAddr = toLlamaKey(chainId, "erc20", row.address);
    if (fromAddr) return fromAddr;
  }
  if (row.coingeckoId) {
    return coingeckoIdToLlamaKey(row.coingeckoId);
  }
  return null;
}

function filterLastHour(points: ChartPoint[]): ChartPoint[] {
  if (points.length === 0) return points;
  const cutoff = points[points.length - 1].time - 60 * 60 * 1000;
  const sliced = points.filter((p) => p.time >= cutoff);
  return sliced.length >= 2 ? sliced : points.slice(-12);
}

/** Giá hiện tại + biến động 24h (batch, không giới hạn như CoinGecko free). */
export async function fetchCurrentPrices(
  keys: string[],
): Promise<Record<string, PriceInfo>> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  if (unique.length === 0) return {};

  const currentUrl =
    `https://coins.llama.fi/prices/current/${encodeURIComponent(unique.join(","))}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const dayAgoSec = nowSec - 86_400;
  const histUrl =
    `https://coins.llama.fi/prices/historical/${dayAgoSec}/` +
    encodeURIComponent(unique.join(","));

  const [current, historical] = await Promise.all([
    fetchJson<{
      coins: Record<string, { price?: number }>;
    }>(currentUrl),
    fetchJson<{
      coins: Record<string, { price?: number }>;
    }>(histUrl).catch(() => ({ coins: {} as Record<string, { price?: number }> })),
  ]);

  const out: Record<string, PriceInfo> = {};
  for (const key of unique) {
    const usd = current.coins[key]?.price ?? 0;
    const prev = historical.coins[key]?.price;
    let change24h = 0;
    if (prev && prev > 0 && usd > 0) {
      change24h = ((usd - prev) / prev) * 100;
    }
    out[key] = { usd, change24h };
  }
  return out;
}

/** Lịch sử giá cho biểu đồ. */
export async function fetchMarketChart(
  llamaKey: string,
  range: ChartRange,
): Promise<MarketChart> {
  const { span, period } = RANGE_CONFIG[range];
  const url =
    `https://coins.llama.fi/chart/${encodeURIComponent(llamaKey)}` +
    `?span=${span}&period=${period}`;

  const data = await fetchJson<{
    coins: Record<
      string,
      { prices?: { timestamp: number; price: number }[] }
    >;
  }>(url);

  const raw = data.coins[llamaKey]?.prices ?? [];
  let points: ChartPoint[] = raw.map((p) => ({
    time: p.timestamp * 1000,
    price: p.price,
  }));

  if (range === "1H") {
    points = filterLastHour(points);
  }

  if (points.length === 0) {
    return { points: [], openPrice: 0, closePrice: 0 };
  }

  return {
    points,
    openPrice: points[0].price,
    closePrice: points[points.length - 1].price,
  };
}

/** Legacy helper — map coingecko id sang llama key. */
export function nativeLlamaKey(chainId: number): string | null {
  return NATIVE_LLAMA_KEY[chainId] ?? nativeCoingeckoId[chainId]
    ? coingeckoIdToLlamaKey(nativeCoingeckoId[chainId]!)
    : null;
}
