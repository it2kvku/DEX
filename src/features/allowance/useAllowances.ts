"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import { useTokenList } from "../asset/useTokenList";
import { discoverApprovals, type DiscoveryStatus } from "./discover";
import { describeSpender, PROBE_SPENDERS } from "./spenders";

/**
 * Allowance manager: liệt kê mọi quyền chi tiêu token mà ví đang cấp cho
 * contract khác, để có thể thu hồi.
 *
 * Bài toán khó ở chỗ `allowance` là một `mapping` — không enumerate được từ
 * ngoài. Cách giải ở đây gồm hai nguồn ứng viên, hợp lại rồi mới đọc giá trị
 * thật:
 *
 *   1. Quét log `Approval` của ví (xem `discover.ts`). Cho biết ví đã từng
 *      approve cho ai, kể cả spender lạ mà app không biết trước.
 *   2. Dò thẳng danh sách spender đã biết trên các token trong danh mục ví.
 *      Cần thiết vì (a) BSC không cho quét log ở free tier, (b) log có thể bị
 *      cắt bớt khi ví approve quá nhiều lần.
 *
 * Log chỉ nói "đã từng approve", KHÔNG nói còn lại bao nhiêu: allowance có thể
 * đã bị tiêu hết hoặc đã revoke sau đó. Nên bước cuối luôn là đọc lại
 * `allowance()` on-chain qua multicall, và chỉ giữ những cặp còn > 0.
 */

/** Trên ngưỡng này coi là "không giới hạn" (approve kiểu `type(uint256).max`). */
const UNLIMITED_THRESHOLD = 2n ** 255n;

export interface AllowanceRow {
  key: string;
  token: Address;
  symbol: string;
  decimals: number;
  spender: Address;
  /** Tên contract nếu nhận diện được, null = spender lạ. */
  label: string | null;
  kind: "dex" | "permit2" | "bridge" | null;
  amount: bigint;
  unlimited: boolean;
  /** Thời điểm approve gần nhất; null nếu cặp này đến từ bước dò, không từ log. */
  lastTimestamp: number | null;
}

export interface UseAllowancesResult {
  rows: AllowanceRow[];
  /** Cho UI nói rõ danh sách đầy đủ tới đâu. */
  discoveryStatus: DiscoveryStatus | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAllowances(): UseAllowancesResult {
  const { address } = useAccount();
  const chainId = useChainId();
  const { tokens } = useTokenList(chainId);
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? "";

  // Prefix "allowances" nằm trong REFETCH_KEYS của Transaction Center: sau khi
  // tx revoke vào block, danh sách tự làm mới.
  const discovery = useQuery({
    queryKey: ["allowances", "discover", chainId, address],
    enabled: !!address,
    // Log lịch sử đổi chậm; giá trị hiện tại đã do multicall bên dưới lo.
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => discoverApprovals(chainId, address as Address, apiKey),
  });

  /** Hợp hai nguồn ứng viên, khử trùng theo cặp (token, spender). */
  const pairs = useMemo(() => {
    const map = new Map<
      string,
      { token: Address; spender: Address; lastTimestamp: number | null }
    >();
    for (const c of discovery.data?.candidates ?? []) {
      map.set(`${c.token.toLowerCase()}:${c.spender.toLowerCase()}`, {
        token: c.token,
        spender: c.spender,
        lastTimestamp: c.lastTimestamp,
      });
    }
    for (const t of tokens) {
      for (const s of PROBE_SPENDERS) {
        const key = `${t.address.toLowerCase()}:${s.toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, { token: t.address, spender: s, lastTimestamp: null });
        }
      }
    }
    return [...map.values()];
  }, [discovery.data, tokens]);

  /** Metadata có sẵn từ token list — khỏi phải đọc lại symbol/decimals. */
  const localMeta = useMemo(() => {
    const m = new Map<string, { symbol: string; decimals: number }>();
    for (const t of tokens) {
      m.set(t.address.toLowerCase(), {
        symbol: t.symbol,
        decimals: t.decimals,
      });
    }
    return m;
  }, [tokens]);

  /** Token lạ (từ log) cần đọc symbol/decimals. */
  const unknownTokens = useMemo(() => {
    const set = new Map<string, Address>();
    for (const p of pairs) {
      const lower = p.token.toLowerCase();
      if (!localMeta.has(lower)) set.set(lower, p.token);
    }
    return [...set.values()];
  }, [pairs, localMeta]);

  const allowanceReads = useReadContracts({
    allowFailure: true,
    contracts: pairs.map((p) => ({
      address: p.token,
      abi: erc20Abi,
      functionName: "allowance" as const,
      args: [address as Address, p.spender] as const,
    })),
    query: { enabled: !!address && pairs.length > 0 },
  });

  const metaReads = useReadContracts({
    allowFailure: true,
    contracts: unknownTokens.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: "symbol" as const },
      { address: t, abi: erc20Abi, functionName: "decimals" as const },
    ]),
    query: { enabled: unknownTokens.length > 0 },
  });

  const rows = useMemo<AllowanceRow[]>(() => {
    if (!allowanceReads.data) return [];

    /** Metadata đọc thêm, ghép theo thứ tự [symbol, decimals] của từng token. */
    const fetchedMeta = new Map<string, { symbol: string; decimals: number }>();
    unknownTokens.forEach((t, i) => {
      const sym = metaReads.data?.[i * 2];
      const dec = metaReads.data?.[i * 2 + 1];
      fetchedMeta.set(t.toLowerCase(), {
        symbol:
          sym?.status === "success" ? (sym.result as string) : shortToken(t),
        decimals: dec?.status === "success" ? Number(dec.result) : 18,
      });
    });

    const out: AllowanceRow[] = [];
    pairs.forEach((p, i) => {
      const read = allowanceReads.data?.[i];
      if (!read || read.status !== "success") return;
      const amount = read.result as bigint;
      // Đây là bước lọc quan trọng: log chỉ nói "đã từng approve".
      if (amount === 0n) return;

      const lower = p.token.toLowerCase();
      const meta =
        localMeta.get(lower) ??
        fetchedMeta.get(lower) ?? { symbol: shortToken(p.token), decimals: 18 };
      const info = describeSpender(p.spender);

      out.push({
        key: `${lower}:${p.spender.toLowerCase()}`,
        token: p.token,
        symbol: meta.symbol,
        decimals: meta.decimals,
        spender: p.spender,
        label: info?.label ?? null,
        kind: info?.kind ?? null,
        amount,
        unlimited: amount >= UNLIMITED_THRESHOLD,
        lastTimestamp: p.lastTimestamp,
      });
    });

    // Xếp theo mức đáng lo: spender lạ trước, rồi allowance vô hạn, rồi mới
    // tới thời điểm approve. Người dùng nhìn từ trên xuống là thấy việc cần làm.
    return out.sort((a, b) => {
      const risk = (r: AllowanceRow) => (r.label ? 0 : 2) + (r.unlimited ? 1 : 0);
      const d = risk(b) - risk(a);
      if (d !== 0) return d;
      return (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0);
    });
  }, [allowanceReads.data, metaReads.data, pairs, unknownTokens, localMeta]);

  return {
    rows,
    discoveryStatus: discovery.data?.status ?? null,
    isLoading: discovery.isLoading || allowanceReads.isLoading,
    // Log scan lỗi không phải lỗi chí tử: phần dò spender đã biết vẫn chạy.
    isError: allowanceReads.isError,
    error: (discovery.error as Error | null) ?? null,
    refetch: () => {
      void discovery.refetch();
      void allowanceReads.refetch();
    },
  };
}

/** Nhãn tạm khi không đọc được symbol (token không chuẩn). */
function shortToken(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
