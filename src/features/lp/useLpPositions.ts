"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import {
  poolSlot0Abi,
  uniswapV3NpmAbi,
} from "@/lib/abi/uniswapV3Npm";
import { rangeStatus, priceAtTick } from "@/lib/lp/range";
import { computePoolAddress } from "@/features/swap/routing/pools";
import { getV3ChainConfig } from "@/features/swap/routing/chains";

/**
 * Đọc LP positions Uniswap V3 của ví qua NonfungiblePositionManager.
 *
 * MỌI địa chỉ NPM đều đã verify on-chain bằng eth_call factory() đối chiếu
 * factory của chain (mainnet/Polygon/Arbitrum dùng địa chỉ canonical chung,
 * Base deploy riêng) — sai địa chỉ ở đây là đọc nhầm position người khác.
 * Sepolia không bật: NPM Sepolia cũ không expose factory() để verify.
 */

const NPM_MAINNET = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as Address;

/** NPM theo chain — đã verify factory() khớp factory V3 của chain đó. */
const NPM_BY_CHAIN: Partial<Record<number, Address>> = {
  1: NPM_MAINNET,
  137: NPM_MAINNET,
  42161: NPM_MAINNET,
  8453: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
};

/** Số position tối đa đọc — chống ví sưu tầm hàng trăm NFT làm sập batch. */
const MAX_POSITIONS = 50;

export interface LpPosition {
  tokenId: bigint;
  /** Chuẩn hoá lowercase để so/khớp. */
  token0: Address;
  token1: Address;
  symbol0: string;
  symbol1: string;
  decimals0: number;
  decimals1: number;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  /** Giá human (token1 trên 1 token0) tại 2 mép range. */
  priceLower: number;
  priceUpper: number;
  status: "in-range" | "below" | "above";
  poolAddress: Address;
}

export function useLpPositions() {
  const { address } = useAccount();
  const chainId = useChainId();
  const npm = NPM_BY_CHAIN[chainId];
  const v3 = getV3ChainConfig(chainId);
  const enabled = !!address && !!npm && !!v3;

  // ---- Bước 1: số position + tokenId của từng cái ----
  const balance = useReadContracts({
    allowFailure: false,
    contracts: enabled
      ? [{ address: npm, abi: uniswapV3NpmAbi, functionName: "balanceOf" as const, args: [address] }]
      : [],
    query: { enabled },
  });

  const count = balance.data?.[0] ?? 0n;
  const capped = count > BigInt(MAX_POSITIONS);

  const tokenIds = useReadContracts({
    allowFailure: false,
    contracts: enabled
      ? Array.from({ length: Number(capped ? BigInt(MAX_POSITIONS) : count) }, (_, i) => ({
          address: npm!,
          abi: uniswapV3NpmAbi,
          functionName: "tokenOfOwnerByIndex" as const,
          args: [address!, BigInt(i)],
        }))
      : [],
    query: { enabled: enabled && count > 0n },
  });

  // ---- Bước 2: struct positions(tokenId) ----
  const raw = useReadContracts({
    allowFailure: true,
    contracts: (tokenIds.data ?? []).map((tokenId) => ({
      address: npm!,
      abi: uniswapV3NpmAbi,
      functionName: "positions" as const,
      args: [tokenId],
    })),
    query: { enabled: (tokenIds.data ?? []).length > 0 },
  });

  // ---- Bước 3: metadata token + slot0 pool (in-range) ----
  const positions = useMemo(() => {
    if (!raw.data || !v3) return [];
    return raw.data
      .map((r, i) => {
        if (r.status !== "success") return null;
        const [
          ,
          ,
          token0,
          token1,
          fee,
          tickLower,
          tickUpper,
          liquidity,
        ] = r.result;
        const tokenId = tokenIds.data![i];
        const poolAddress = computePoolAddress(
          token0,
          token1,
          fee,
          v3.factory,
        );
        return {
          tokenId,
          token0: token0.toLowerCase() as Address,
          token1: token1.toLowerCase() as Address,
          fee,
          tickLower,
          tickUpper,
          liquidity,
          poolAddress,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [raw.data, tokenIds.data, v3]);

  const uniqueTokens = useMemo(
    () =>
      Array.from(
        new Map(positions.flatMap((p) => [p.token0, p.token1]).map((t) => [t, t])).values(),
      ),
    [positions],
  );
  const uniquePools = useMemo(
    () => Array.from(new Map(positions.map((p) => [p.poolAddress, p.poolAddress])).values()),
    [positions],
  );

  const symbols = useReadContracts({
    allowFailure: true,
    contracts: uniqueTokens.map((t) => ({
      address: t,
      abi: erc20Abi,
      functionName: "symbol" as const,
    })),
    query: { enabled: uniqueTokens.length > 0 },
  });

  const decimals = useReadContracts({
    allowFailure: true,
    contracts: uniqueTokens.map((t) => ({
      address: t,
      abi: erc20Abi,
      functionName: "decimals" as const,
    })),
    query: { enabled: uniqueTokens.length > 0 },
  });

  const slot0s = useReadContracts({
    allowFailure: true,
    contracts: uniquePools.map((pool) => ({
      address: pool,
      abi: poolSlot0Abi,
      functionName: "slot0" as const,
    })),
    query: { enabled: uniquePools.length > 0 },
  });

  const result = useMemo<LpPosition[]>(() => {
    if (positions.length === 0) return [];
    const symbolOf = (t: Address) =>
      String(symbols.data?.[uniqueTokens.indexOf(t)]?.result ?? "???");
    const decimalsOf = (t: Address) =>
      Number(decimals.data?.[uniqueTokens.indexOf(t)]?.result ?? 18);
    const tickOf = (pool: Address) => {
      const s = slot0s.data?.[uniquePools.indexOf(pool)];
      return s?.status === "success" ? Number(s.result[1]) : null;
    };

    return positions.map((p) => {
      const dec0 = decimalsOf(p.token0);
      const dec1 = decimalsOf(p.token1);
      const currentTick = tickOf(p.poolAddress);
      return {
        ...p,
        symbol0: symbolOf(p.token0),
        symbol1: symbolOf(p.token1),
        decimals0: dec0,
        decimals1: dec1,
        priceLower: priceAtTick(p.tickLower, dec0, dec1),
        priceUpper: priceAtTick(p.tickUpper, dec0, dec1),
        status:
          currentTick === null
            ? "in-range" // không đọc được slot0 — hiển thị trung tính
            : rangeStatus(p.tickLower, p.tickUpper, currentTick),
      };
    });
  }, [positions, symbols.data, decimals.data, slot0s.data, uniqueTokens, uniquePools]);

  return {
    positions: result,
    total: Number(count),
    capped,
    isLoading:
      balance.isLoading ||
      (count > 0n && tokenIds.isLoading) ||
      ((tokenIds.data ?? []).length > 0 && raw.isLoading),
    isError: balance.isError,
    supported: !!npm && !!v3,
  };
}
