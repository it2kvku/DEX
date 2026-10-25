"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import {
  poolFeeGrowthAbi,
  poolSlot0Abi,
  uniswapV3NpmAbi,
} from "@/lib/abi/uniswapV3Npm";
import { unclaimedFees } from "@/lib/lp/fees";
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
export const NPM_BY_CHAIN: Partial<Record<number, Address>> = {
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
  /** Phí LP chưa thu hồi (raw units) — null khi chưa đọc đủ. */
  fees0: bigint | null;
  fees1: bigint | null;
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
          feeGrowthInside0LastX128,
          feeGrowthInside1LastX128,
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
          feeGrowthInside0LastX128,
          feeGrowthInside1LastX128,
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

  // ---- Bước 4: fee growth (global + ticks hai mép) để tính phí chưa thu hồi ----
  const uniquePairs = useMemo(
    () =>
      Array.from(
        new Map(
          positions.map((p) => [
            `${p.tickLower}:${p.tickUpper}:${p.poolAddress}`,
            { pool: p.poolAddress, tickLower: p.tickLower, tickUpper: p.tickUpper },
          ]),
        ).values(),
      ),
    [positions],
  );
  const feeGrowths = useReadContracts({
    allowFailure: true,
    contracts: uniquePairs.flatMap(({ pool, tickLower, tickUpper }) => [
      { address: pool, abi: poolFeeGrowthAbi, functionName: "feeGrowthGlobal0X128" as const },
      { address: pool, abi: poolFeeGrowthAbi, functionName: "feeGrowthGlobal1X128" as const },
      { address: pool, abi: poolFeeGrowthAbi, functionName: "ticks" as const, args: [tickLower] },
      { address: pool, abi: poolFeeGrowthAbi, functionName: "ticks" as const, args: [tickUpper] },
    ]),
    query: { enabled: uniquePairs.length > 0 },
  });

  const currentTicks = useMemo(() => {
    const out: Record<string, number | null> = {};
    uniquePools.forEach((pool, i) => {
      const s = slot0s.data?.[i];
      out[pool.toLowerCase()] = s?.status === "success" ? Number(s.result[1]) : null;
    });
    return out;
  }, [slot0s.data, uniquePools]);

  const result = useMemo<LpPosition[]>(() => {
    if (positions.length === 0) return [];
    const symbolOf = (t: Address) =>
      String(symbols.data?.[uniqueTokens.indexOf(t)]?.result ?? "???");
    const decimalsOf = (t: Address) =>
      Number(decimals.data?.[uniqueTokens.indexOf(t)]?.result ?? 18);

    return positions.map((p) => {
      const dec0 = decimalsOf(p.token0);
      const dec1 = decimalsOf(p.token1);
      const currentTick = currentTicks[p.poolAddress.toLowerCase()] ?? null;

      // Phí chưa thu hồi — thiếu read nào thì null (UI hiện "—").
      let fees0: bigint | null = null;
      let fees1: bigint | null = null;
      if (currentTick !== null && feeGrowths.data) {
        const idx = uniquePairs.findIndex(
          (u) =>
            u.pool === p.poolAddress &&
            u.tickLower === p.tickLower &&
            u.tickUpper === p.tickUpper,
        );
        const g0 = feeGrowths.data[idx * 4];
        const g1 = feeGrowths.data[idx * 4 + 1];
        const tl = feeGrowths.data[idx * 4 + 2];
        const tu = feeGrowths.data[idx * 4 + 3];
        if (
          g0?.status === "success" &&
          g1?.status === "success" &&
          tl?.status === "success" &&
          tu?.status === "success"
        ) {
          try {
            // Contracts array trộn 2 shape (uint256 và tuple) — TS union,
            // cast đúng shape theo thứ tự đã gửi.
            const fees = unclaimedFees(
              {
                feeGrowthGlobal0X128: g0.result as bigint,
                feeGrowthGlobal1X128: g1.result as bigint,
                feeGrowthOutsideLower0X128: (tl.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean])[2],
                feeGrowthOutsideLower1X128: (tl.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean])[3],
                feeGrowthOutsideUpper0X128: (tu.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean])[2],
                feeGrowthOutsideUpper1X128: (tu.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean])[3],
              },
              {
                tickLower: p.tickLower,
                tickUpper: p.tickUpper,
                liquidity: p.liquidity,
                feeGrowthInside0LastX128: p.feeGrowthInside0LastX128,
                feeGrowthInside1LastX128: p.feeGrowthInside1LastX128,
              },
              currentTick,
            );
            fees0 = fees.fees0;
            fees1 = fees.fees1;
          } catch {
            /* ticks() revert (mép range chưa init) — để null */
          }
        }
      }

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
        fees0,
        fees1,
      };
    });
  }, [positions, symbols.data, decimals.data, currentTicks, feeGrowths.data, raw.data, uniquePairs]);

  const refetch = () => {
    balance.refetch();
    tokenIds.refetch();
    raw.refetch();
    symbols.refetch();
    decimals.refetch();
    slot0s.refetch();
    feeGrowths.refetch();
  };

  return {
    refetch,
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
