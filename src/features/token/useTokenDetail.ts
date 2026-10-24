"use client";

import { useMemo } from "react";
import { useChainId, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
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

const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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

/**
 * Chi tiết token cho trang /app/token/{address|native}.
 *
 * Token không có trong danh sách (vd link từ trang Khám phá tới token meme
 * chưa ai import) vẫn mở được: đọc symbol/name/decimals trực tiếp on-chain
 * qua multicall — đúng metadata của contract, không cần tin nguồn nào.
 */
export function useTokenDetail(addressParam: string) {
  const chainId = useChainId();
  const { tokens } = useTokenList(chainId);

  const listed = useMemo(
    () => findToken(chainId, addressParam, tokens),
    [chainId, addressParam, tokens],
  );

  const isUnknownErc20 =
    !listed && addressParam !== "native" && HEX_ADDRESS_RE.test(addressParam);

  const onchain = useReadContracts({
    allowFailure: true,
    contracts: isUnknownErc20
      ? (["symbol", "name", "decimals"] as const).map((functionName) => ({
          address: addressParam as Address,
          abi: erc20Abi,
          functionName,
        }))
      : [],
    query: { enabled: isUnknownErc20, retry: 1 },
  });

  const detail = useMemo<TokenDetail | null>(() => {
    if (listed) return listed;
    if (!isUnknownErc20 || !onchain.data) return null;

    const [symbolRes, nameRes, decimalsRes] = onchain.data;
    if (symbolRes.status !== "success" || decimalsRes.status !== "success") {
      return null; // Không phải ERC-20 (hoặc proxy trả lỗi) -> notFound.
    }
    const address = addressParam as Address;
    return {
      kind: "erc20",
      address,
      symbol: String(symbolRes.result),
      name:
        nameRes.status === "success" ? String(nameRes.result) : String(symbolRes.result),
      decimals: Number(decimalsRes.result),
      llamaKey: toLlamaKey(chainId, "erc20", address),
      isReferenceChart: isReferenceChart(chainId),
      chainName:
        supportedChains.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`,
    };
  }, [listed, isUnknownErc20, onchain.data, addressParam, chainId]);

  const prices = usePrices(detail?.llamaKey ? [detail.llamaKey] : []);
  const priceInfo = detail?.llamaKey
    ? prices.data?.[detail.llamaKey]
    : undefined;

  return {
    detail,
    priceUsd: priceInfo?.usd ?? null,
    change24h: priceInfo?.change24h,
    pricesLoading: prices.isLoading,
    // Đang resolve on-chain thì chưa kết luận "không tìm thấy".
    notFound: !detail && !isUnknownErc20 && !(isUnknownErc20 && onchain.isLoading),
    resolving: isUnknownErc20 && onchain.isLoading,
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
