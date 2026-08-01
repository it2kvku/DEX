"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { defaultTokens, type TokenInfo } from "@/lib/tokens";

/**
 * Danh sách token = token mặc định của chain + token người dùng tự import.
 * Token tùy chỉnh lưu localStorage (chỉ metadata công khai — không nhạy cảm).
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

export function useTokenList(chainId: number) {
  const [custom, setCustom] = useState<TokenInfo[]>([]);

  useEffect(() => {
    setCustom(loadCustom(chainId));
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

  const tokens: TokenInfo[] = [...(defaultTokens[chainId] ?? []), ...custom];

  return { tokens, custom, addToken, removeToken };
}
