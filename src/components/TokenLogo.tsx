"use client";

import { useState } from "react";
import { tokenLogoUrl } from "@/lib/tokenLogo";
import { CryptoIcon } from "@/components/CryptoIcon";
import type { Address } from "viem";

/**
 * Logo token: Trust Wallet CDN trước, logo từ danh sách chuẩn (vd Uniswap
 * list) làm phương án 2, cuối cùng fallback avatar/icon màu.
 */
export function TokenLogo({
  chainId,
  address,
  symbol,
  size = 38,
  logoUri,
  className = "",
}: {
  chainId: number;
  address?: Address;
  symbol: string;
  size?: number;
  /** Logo URI từ token list — dùng khi CDN Trust Wallet không có token này. */
  logoUri?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = logoUri ?? tokenLogoUrl(chainId, address);

  if (!url || failed) {
    return (
      <CryptoIcon symbol={symbol} size={size} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
