"use client";

import { useEffect, useState } from "react";
import { Icon, addCollection } from "@iconify/react";
import { TokenAvatar } from "./TokenAvatar";

/**
 * Bộ icon cryptocurrency-color (~483 icon, ~250kB) được nạp bằng dynamic
 * import: Next tách thành chunk async riêng, KHÔNG phình bundle chính.
 * Trong lúc chờ nạp (lần đầu, rất ngắn) hiển thị avatar chữ làm placeholder.
 * Icon bundle offline — không gọi API Iconify lúc runtime (an toàn CSP).
 */
let loadPromise: Promise<Set<string>> | null = null;
let loadedSlugs: Set<string> | null = null;

function loadCollection(): Promise<Set<string>> {
  if (!loadPromise) {
    loadPromise = import("@iconify-json/cryptocurrency-color").then((mod) => {
      addCollection(mod.icons);
      const slugs = new Set<string>([
        ...Object.keys(mod.icons.icons),
        ...Object.keys(mod.icons.aliases ?? {}),
      ]);
      loadedSlugs = slugs;
      return slugs;
    });
  }
  return loadPromise;
}

function useCryptoIcons(): Set<string> | null {
  const [slugs, setSlugs] = useState<Set<string> | null>(loadedSlugs);
  useEffect(() => {
    if (slugs) return;
    let alive = true;
    loadCollection().then((s) => {
      if (alive) setSlugs(s);
    });
    return () => {
      alive = false;
    };
  }, [slugs]);
  return slugs;
}

/** Map symbol/chain đặc biệt -> slug icon. */
const symbolOverrides: Record<string, string> = {
  // Sepolia là testnet của Ethereum — dùng icon ETH.
  sepoliaeth: "eth",
  weth: "eth",
};

/**
 * Icon token/chain màu từ bộ `cryptocurrency-color` (icons0.dev).
 * Symbol không có trong bộ (vd ARB, token tự import) tự fallback
 * sang avatar chữ cái gradient.
 */
export function CryptoIcon({
  symbol,
  size = 38,
}: {
  symbol: string;
  size?: number;
}) {
  const slugs = useCryptoIcons();
  const slug = symbolOverrides[symbol.toLowerCase()] ?? symbol.toLowerCase();

  if (!slugs || !slugs.has(slug)) {
    return <TokenAvatar symbol={symbol} size={size} />;
  }

  return (
    <Icon
      icon={`cryptocurrency-color:${slug}`}
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}

/** Icon theo chainId (dùng cho Network Selector). */
const chainSymbol: Record<number, string> = {
  1: "eth",
  56: "bnb",
  137: "matic",
  42161: "arb", // chưa có trong bộ -> fallback avatar chữ
  11155111: "eth",
};

export function ChainIcon({
  chainId,
  size = 20,
}: {
  chainId: number;
  size?: number;
}) {
  const symbol = chainSymbol[chainId] ?? String(chainId);
  return <CryptoIcon symbol={symbol} size={size} />;
}
