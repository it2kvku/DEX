import type { Address } from "viem";
import { getAddress } from "viem";
import { mainnet, bsc, polygon, arbitrum, sepolia } from "wagmi/chains";
import { SEPOLIA_LLAMA_FALLBACK } from "@/lib/marketData";

const BASE = "https://api.geckoterminal.com/api/v2";

/** Slug network GeckoTerminal. */
export const GECKO_NETWORK: Partial<Record<number, string>> = {
  [mainnet.id]: "eth",
  [bsc.id]: "bsc",
  [polygon.id]: "polygon_pos",
  [arbitrum.id]: "arbitrum",
  [sepolia.id]: "eth",
};

const NATIVE_GECKO = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface TokenStats {
  tvlUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  high52w: number | null;
  low52w: number | null;
  coingeckoId: string | null;
  imageUrl: string | null;
  topPoolAddress: string | null;
}

export interface TokenPoolRow {
  address: string;
  name: string;
  dex: string;
  reserveUsd: number | null;
  volume24hUsd: number | null;
  url: string | null;
}

export interface TokenTradeRow {
  id: string;
  time: string;
  kind: "buy" | "sell";
  tokenAmount: number;
  counterAmount: number;
  counterSymbol: string;
  usd: number;
  wallet: string;
  txHash: string;
}

function geckoNetwork(chainId: number): string | null {
  return GECKO_NETWORK[chainId] ?? null;
}

/** Địa chỉ token tra cứu trên GeckoTerminal (Sepolia → mainnet). */
export function geckoTokenAddress(
  chainId: number,
  kind: "native" | "erc20",
  address?: Address,
): string | null {
  if (kind === "native") return NATIVE_GECKO;

  if (!address) return null;
  const lower = address.toLowerCase();

  if (chainId === sepolia.id) {
    const fb = SEPOLIA_LLAMA_FALLBACK[lower];
    if (fb?.includes(":")) {
      return fb.split(":")[1]!;
    }
  }

  if (!geckoNetwork(chainId)) return null;
  try {
    return getAddress(address);
  } catch {
    return lower;
  }
}

async function geckoFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GeckoTerminal trả về ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface GeckoTokenResp {
  data: {
    attributes: {
      total_reserve_in_usd?: string;
      market_cap_usd?: string | null;
      fdv_usd?: string;
      volume_usd?: { h24?: string };
      coingecko_coin_id?: string | null;
      image_url?: string | null;
    };
    relationships?: {
      top_pools?: { data?: { id: string }[] };
    };
  };
}

interface GeckoPoolsResp {
  data: Array<{
    attributes: {
      address: string;
      name: string;
      reserve_in_usd?: string;
      volume_usd?: { h24?: string };
    };
    relationships?: {
      dex?: { data?: { id?: string } };
    };
  }>;
}

interface GeckoTradesResp {
  data: Array<{
    id: string;
    attributes: {
      block_timestamp: string;
      kind: "buy" | "sell";
      from_token_amount: string;
      to_token_amount: string;
      from_token_address: string;
      to_token_address: string;
      volume_in_usd: string;
      tx_from_address: string;
      tx_hash: string;
    };
  }>;
}

const COUNTER_SYMBOL: Record<string, string> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ETH",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
};

function counterSymbol(addr: string): string {
  return COUNTER_SYMBOL[addr.toLowerCase()] ?? shortenAddr(addr);
}

function shortenAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export async function fetchGeckoTokenStats(
  chainId: number,
  kind: "native" | "erc20",
  address: Address | undefined,
  yearPrices: number[],
): Promise<TokenStats | null> {
  const network = geckoNetwork(chainId);
  const tokenAddr = geckoTokenAddress(chainId, kind, address);
  if (!network || !tokenAddr) return null;

  const json = await geckoFetch<GeckoTokenResp>(
    `/networks/${network}/tokens/${tokenAddr}`,
  );
  const a = json.data.attributes;
  const topPool = json.data.relationships?.top_pools?.data?.[0]?.id;
  const topPoolAddress = topPool?.match(/(0x[a-fA-F0-9]+)$/)?.[1] ?? null;

  let high52w: number | null = null;
  let low52w: number | null = null;
  if (yearPrices.length > 0) {
    high52w = Math.max(...yearPrices);
    low52w = Math.min(...yearPrices);
  }

  return {
    tvlUsd: num(a.total_reserve_in_usd),
    marketCapUsd: a.market_cap_usd ? num(a.market_cap_usd) : null,
    fdvUsd: num(a.fdv_usd),
    volume24hUsd: num(a.volume_usd?.h24),
    high52w,
    low52w,
    coingeckoId: a.coingecko_coin_id ?? null,
    imageUrl: a.image_url ?? null,
    topPoolAddress,
  };
}

export async function fetchGeckoPools(
  chainId: number,
  kind: "native" | "erc20",
  address: Address | undefined,
): Promise<TokenPoolRow[]> {
  const network = geckoNetwork(chainId);
  const tokenAddr = geckoTokenAddress(chainId, kind, address);
  if (!network || !tokenAddr) return [];

  const json = await geckoFetch<GeckoPoolsResp>(
    `/networks/${network}/tokens/${tokenAddr}/pools?page=1`,
  );

  return json.data.slice(0, 8).map((p) => {
    const addr = p.attributes.address;
    return {
      address: addr,
      name: p.attributes.name,
      dex: p.relationships?.dex?.data?.id ?? "DEX",
      reserveUsd: num(p.attributes.reserve_in_usd),
      volume24hUsd: num(p.attributes.volume_usd?.h24),
      url: `https://www.geckoterminal.com/${network}/pools/${addr}`,
    };
  });
}

export async function fetchGeckoTrades(
  chainId: number,
  poolAddress: string,
  tokenAddress: string,
  limit = 15,
): Promise<TokenTradeRow[]> {
  const network = geckoNetwork(chainId);
  if (!network) return [];

  const json = await geckoFetch<GeckoTradesResp>(
    `/networks/${network}/pools/${poolAddress}/trades?limit=${limit}`,
  );

  const tokenLower = tokenAddress.toLowerCase();

  return json.data.map((t) => {
    const a = t.attributes;
    const fromLower = a.from_token_address.toLowerCase();
    const toLower = a.to_token_address.toLowerCase();
    const isTokenFrom = fromLower === tokenLower;
    const isTokenTo = toLower === tokenLower;

    const kind: "buy" | "sell" =
      a.kind === "buy" && isTokenTo
        ? "buy"
        : a.kind === "sell" && isTokenFrom
          ? "sell"
          : isTokenTo
            ? "buy"
            : "sell";

    const tokenAmount = Number(
      isTokenTo ? a.to_token_amount : a.from_token_amount,
    );
    const counterAmount = Number(
      isTokenTo ? a.from_token_amount : a.to_token_amount,
    );
    const counterAddr = isTokenTo ? a.from_token_address : a.to_token_address;

    return {
      id: t.id,
      time: a.block_timestamp,
      kind,
      tokenAmount,
      counterAmount,
      counterSymbol: counterSymbol(counterAddr),
      usd: Number(a.volume_in_usd),
      wallet: a.tx_from_address,
      txHash: a.tx_hash,
    };
  });
}

export async function fetchCoinAbout(coinId: string): Promise<{
  description: string | null;
  website: string | null;
  twitter: string | null;
}> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${coinId}` +
    "?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false&sparkline=false";
  const res = await fetch(url);
  if (!res.ok) {
    return { description: null, website: null, twitter: null };
  }
  const data = (await res.json()) as {
    description?: { en?: string };
    links?: { homepage?: string[]; twitter_screen_name?: string };
  };
  return {
    description: data.description?.en ?? null,
    website: data.links?.homepage?.[0] ?? null,
    twitter: data.links?.twitter_screen_name
      ? `https://twitter.com/${data.links.twitter_screen_name}`
      : null,
  };
}

function num(v: string | undefined | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
