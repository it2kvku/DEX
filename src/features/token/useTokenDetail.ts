"use client";

import { useMemo } from "react";
import { useChainId } from "wagmi";
import type { Address } from "viem";
import { defaultTokens, type TokenInfo } from "@/lib/tokens";
import { isReferenceChart, toLlamaKey } from "@/lib/marketData";
import { usePrices } from "@/features/asset/usePrices";
import { useTokenList } from "@/features/asset/useTokenList";
import { supportedChains } from "@/lib/chains";

export interface TokenDetail {
  kind: "native" | "erc20";
  address?: Address;
  symbol: string;
  name: string;
  decimals: number;
  llamaKey: string | null;
  isReferenceChart: boolean;
  chainName: string;
}

function findToken(
  chainId: number,
  addressParam: string,
  tokens: TokenInfo[],
): TokenDetail | null {
  const chain = supportedChains.find((c) => c.id === chainId);
  const chainName = chain?.name ?? `Chain ${chainId}`;

  if (addressParam === "native") {
    const symbol =
      chain?.nativeCurrency.symbol ??
      supportedChains[0].nativeCurrency.symbol;
    return {
      kind: "native",
      symbol,
      name: chain?.nativeCurrency.name ?? symbol,
      decimals: chain?.nativeCurrency.decimals ?? 18,
      llamaKey: toLlamaKey(chainId, "native"),
      isReferenceChart: isReferenceChart(chainId),
      chainName,
    };
  }

  const addr = addressParam.toLowerCase() as Address;
  const token = tokens.find((t) => t.address.toLowerCase() === addr);
  if (!token) return null;

  return {
    kind: "erc20",
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    llamaKey: toLlamaKey(chainId, "erc20", token.address),
    isReferenceChart: isReferenceChart(chainId),
    chainName,
  };
}

export function useTokenDetail(addressParam: string) {
  const chainId = useChainId();
  const { tokens } = useTokenList(chainId);

  const detail = useMemo(
    () => findToken(chainId, addressParam, tokens),
    [chainId, addressParam, tokens],
  );

  const prices = usePrices(detail?.llamaKey ? [detail.llamaKey] : []);
  const priceInfo = detail?.llamaKey
    ? prices.data?.[detail.llamaKey]
    : undefined;

  return {
    detail,
    priceUsd: priceInfo?.usd ?? null,
    change24h: priceInfo?.change24h,
    pricesLoading: prices.isLoading,
    notFound: !detail,
    chartAvailable: !!detail?.llamaKey,
  };
}

export function getDefaultToken(
  chainId: number,
  address: Address,
): TokenInfo | undefined {
  return (defaultTokens[chainId] ?? []).find(
    (t) => t.address.toLowerCase() === address.toLowerCase(),
  );
}
