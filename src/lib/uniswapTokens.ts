import type { Address } from "viem";
import { getAddress } from "viem";
import type { TokenInfo } from "./tokens";

/**
 * Danh sách token chuẩn của Uniswap (https://tokens.uniswap.org — token list
 * schema), tải lúc runtime và cache localStorage theo chain.
 *
 * Vì sao runtime thay vì bundle sẵn: list cập nhật thường (thêm token mới),
 * bundle cứng thì mỗi lần cập nhật phải deploy lại app; còn ~400 token
 * mainnet cũng đáng kể kích thước bundle. Cache 24h nên người dùng không tải
 * lại mỗi phiên, và khi offline vẫn dùng được bản cache.
 *
 * Module-level promise: useTokenList được gọi từ nhiều component cùng lúc
 * (AssetList, TokenPage, ImportToken) — memo đảm bảo chỉ MỘT request ra mạng
 * cho tới khi xong.
 */

const LIST_URL = "https://tokens.uniswap.org";
const CACHE_PREFIX = "uniswap-list";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  ts: number;
  tokens: TokenInfo[];
}

interface UniswapListToken {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

function cacheKey(chainId: number) {
  return `${CACHE_PREFIX}:${chainId}`;
}

function readCache(chainId: number): TokenInfo[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(chainId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.tokens;
  } catch {
    return null;
  }
}

function writeCache(chainId: number, tokens: TokenInfo[]) {
  try {
    localStorage.setItem(
      cacheKey(chainId),
      JSON.stringify({ ts: Date.now(), tokens } satisfies CacheEntry),
    );
  } catch {
    // Quota đầy (list lớn) — bỏ cache, lần sau fetch lại.
  }
}

const inflight = new Map<number, Promise<TokenInfo[]>>();

export function fetchUniswapTokens(chainId: number): Promise<TokenInfo[]> {
  const cached = readCache(chainId);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(chainId);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch(LIST_URL);
    if (!res.ok) throw new Error(`Uniswap list trả về ${res.status}`);
    const json = (await res.json()) as { tokens?: UniswapListToken[] };

    const tokens = (json.tokens ?? [])
      .filter((t) => t.chainId === chainId)
      .map((t): TokenInfo | null => {
        let address: Address;
        try {
          address = getAddress(t.address);
        } catch {
          return null;
        }
        return {
          address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          // List Uniswap không có coingecko id — giá lấy theo địa chỉ
          // (llamaKeyForAsset ưu tiên key `chain:address` trước).
          coingeckoId: null,
          logoUri: t.logoURI,
        };
      })
      .filter((t): t is TokenInfo => t !== null);

    writeCache(chainId, tokens);
    return tokens;
  })().catch(async () => {
    // Mạng lỗi: dùng cache quá hạn còn hơn không — người dùng vẫn thấy danh
    // sách quen thuộc thay vì rơi về vài token mặc định.
    try {
      const raw = localStorage.getItem(cacheKey(chainId));
      if (raw) return (JSON.parse(raw) as CacheEntry).tokens;
    } catch {
      /* ignore */
    }
    return [];
  });

  inflight.set(chainId, p);
  p.finally(() => inflight.delete(chainId));
  return p;
}
