"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { defaultTokens, type TokenInfo } from "@/lib/tokens";
import { fetchUniswapTokens } from "@/lib/uniswapTokens";

/**
 * Danh sách token = token mặc định của chain + danh sách chuẩn Uniswap
 * (fetch runtime, cache localStorage 24h — xem lib/uniswapTokens.ts) + token
 * người dùng tự import. Token tùy chỉnh lưu localStorage (chỉ metadata công
 * khai — không nhạy cảm).
 *
 * Token trùng địa chỉ: mặc định > Uniswap > custom (mặc định đã kiểm chứng
 * symbol/decimals theo tay, giữ quyền ưu tiên).
 */
const storageKey = (chainId: number) => `custom-tokens:${chainId}`;

function loadCustom(chainId: number): TokenInfo[] {
  try {
    const raw = localStorage.getItem(storageKey(chainId));
    return raw ? (JSON.parse(raw) as TokenInfo[]) : [];
  } catch {
    return [];
  }
}

function mergeTokens(chainId: number, remote: TokenInfo[], custom: TokenInfo[]) {
  const byAddress = new Map<string, TokenInfo>();
  for (const t of (defaultTokens[chainId] ?? []) ?? []) {
    byAddress.set(t.address.toLowerCase(), t);
  }
  for (const t of remote) {
    const key = t.address.toLowerCase();
    if (!byAddress.has(key)) byAddress.set(key, t);
  }
  for (const t of custom) {
    const key = t.address.toLowerCase();
    if (!byAddress.has(key)) byAddress.set(key, t);
  }
  return [...byAddress.values()];
}

export function useTokenList(chainId: number) {
  const [custom, setCustom] = useState<TokenInfo[]>([]);
  const [remote, setRemote] = useState<TokenInfo[]>([]);

  useEffect(() => {
    setCustom(loadCustom(chainId));
    // Danh sách Uniswap không có token testnet — fetch về rỗng, vô hại.
    let alive = true;
    fetchUniswapTokens(chainId)
      .then((tokens) => {
        if (alive) setRemote(tokens);
      })
      .catch(() => {
        /* remote là phần cộng thêm — lỗi thì dùng mặc định + custom */
      });
    return () => {
      alive = false;
    };
  }, [chainId]);

  const addToken = useCallback(
    (token: TokenInfo) => {
      setCustom((prev) => {
        const exists =
          prev.some(
            (t) => t.address.toLowerCase() === token.address.toLowerCase(),
          ) ||
          (defaultTokens[chainId] ?? []).some(
            (t) => t.address.toLowerCase() === token.address.toLowerCase(),
          );
        if (exists) return prev;
        const next = [...prev, token];
        localStorage.setItem(storageKey(chainId), JSON.stringify(next));
        return next;
      });
    },
    [chainId],
  );

  const removeToken = useCallback(
    (address: Address) => {
      setCustom((prev) => {
        const next = prev.filter(
          (t) => t.address.toLowerCase() !== address.toLowerCase(),
        );
        localStorage.setItem(storageKey(chainId), JSON.stringify(next));
        return next;
      });
    },
    [chainId],
  );

  const tokens = mergeTokens(chainId, remote, custom);

  return { tokens, custom, addToken, removeToken };
}
