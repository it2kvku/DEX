"use client";

import { useState } from "react";
import { tokenLogoUrl } from "@/lib/tokenLogo";
import { CryptoIcon } from "@/components/CryptoIcon";
import type { Address } from "viem";

/**
 * Logo token: Trust Wallet CDN trước, fallback avatar/icon màu.
 */
export function TokenLogo({
  chainId,
  address,
  symbol,
  size = 38,
  className = "",
}: {
  chainId: number;
  address?: Address;
  symbol: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = tokenLogoUrl(chainId, address);

  if (!url || failed) {
    return (
      <CryptoIcon symbol={symbol} size={size} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
