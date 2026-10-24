"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useChainId } from "wagmi";
import { useAssets } from "./useBalances";
import { usePrices } from "./usePrices";
import { visibleAssetRows } from "./assetFilter";
import { llamaKeyForAsset } from "@/lib/marketData";
import { ImportToken } from "./ImportToken";
import { formatBalance, formatUsd } from "@/lib/format";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui";
import { CountUp } from "@/components/anim/CountUp";
import { Reveal } from "@/components/anim/Reveal";
import { TokenLogo } from "@/components/TokenLogo";

export function AssetList() {
  const chainId = useChainId();
  const { rows, isLoading, isError, refetch, addToken, removeToken } =
    useAssets();
  const [importing, setImporting] = useState(false);
  // Tìm trong TOÀN BỘ danh sách token chuẩn (kể cả số dư 0) — xem assetFilter.
  const [search, setSearch] = useState("");

  const visible = useMemo(
    () => visibleAssetRows(rows, search),
    [rows, search],
  );

  // Danh sách ĐANG SỞ HỮU (bộ lọc khi không search) — dùng cho "Tổng tài
  // sản": tổng phải theo ví, không được nhảy theo ô tìm kiếm.
  const holdings = useMemo(() => visibleAssetRows(rows, ""), [rows]);

  // Giá cho cả danh sách đang hiển thị lẫn danh sách sở hữu (union) — tổng
  // luôn có đủ giá kể cả khi đang search token khác.
  const llamaKeys = useMemo(() => {
    const keys = [...holdings, ...visible]
      .map((r) => llamaKeyForAsset(chainId, r))
      .filter((k): k is string => !!k);
    return Array.from(new Set(keys)).sort();
  }, [holdings, visible, chainId]);

  const keyForRow = (r: (typeof rows)[number]) =>
    llamaKeyForAsset(chainId, r);

  const { data: prices } = usePrices(llamaKeys);

  const totalUsd = useMemo(() => {
    return holdings.reduce((sum, r) => {
      const lk = llamaKeyForAsset(chainId, r);
      const price = lk ? (prices?.[lk]?.usd ?? 0) : 0;
      const amount = Number(formatBalanceRaw(r.balance, r.decimals));
      return sum + amount * price;
    }, 0);
  }, [holdings, prices, chainId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card highlight>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-9 w-48" />
        </Card>
        {[0, 1].map((i) => (
          <Card key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="space-y-3">
        <Alert variant="error">
          Không tải được số dư. RPC có thể đang nghẽn — thử lại.
        </Alert>
        <Button variant="secondary" onClick={refetch}>
          Thử lại
        </Button>
      </Card>
    );
  }

  return (
    <Reveal className="space-y-4" watch={visible.length}>
      {/* Hero tổng tài sản */}
      <Card highlight className="relative overflow-hidden">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Tổng tài sản
        </p>
        <p className="mt-2 font-display text-4xl font-bold tracking-tight">
          <CountUp value={totalUsd} format={formatUsd} />
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Ước tính theo giá DefiLlama · cập nhật mỗi 60s
        </p>
      </Card>

      {/* Tìm kiếm toàn bộ danh sách token chuẩn + danh sách token hiển thị */}
      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm token (tên, mã, địa chỉ)…"
          className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-accent1/50"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Xóa tìm kiếm"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs text-neutral-500 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Danh sách token */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500">
            {search
              ? "Không tìm thấy token nào khớp từ khoá."
              : "Chưa có token nào có số dư — bấm Khám phá hoặc Import token."}
          </p>
        )}
        {visible.map((r) => {
          const lk = keyForRow(r);
          const info = lk ? prices?.[lk] : undefined;
          const price = info?.usd ?? 0;
          const change = info?.change24h;
          const amount = Number(formatBalanceRaw(r.balance, r.decimals));
          const usd = amount * price;
          const href =
            r.kind === "native"
              ? "/app/token/native"
              : `/app/token/${r.address}`;
          return (
            <Card
              key={`${r.kind}-${r.address ?? "native"}`}
              className="flex items-center gap-3 transition-colors hover:bg-white/[0.06]"
            >
              <Link
                href={href}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
              >
                <TokenLogo
                  chainId={chainId}
                  address={r.kind === "erc20" ? r.address : undefined}
                  symbol={r.symbol}
                  logoUri={r.logoUri}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.symbol}</span>
                    {r.kind === "native" && (
                      <Badge tone="indigo">native</Badge>
                    )}
                    {r.isCustom && <Badge>custom</Badge>}
                  </div>
                  <span className="block truncate text-xs text-neutral-500">
                    {r.name}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">
                    {formatBalance(r.balance, r.decimals)}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 text-xs text-neutral-500">
                    {price > 0 ? formatUsd(usd) : "—"}
                    {change !== undefined && price > 0 && (
                      <span
                        className={
                          change >= 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              {r.isCustom && r.address && (
                <Button
                  variant="ghost"
                  onClick={() => removeToken(r.address!)}
                  className="!px-2 text-xs"
                >
                  ✕
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {importing ? (
        <ImportToken onAdd={addToken} onClose={() => setImporting(false)} />
      ) : (
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              ＋ Import token
            </Button>
            <Link
              href="/app/explore"
              className="inline-flex items-center rounded-2xl px-3.5 py-2.5 text-sm font-medium text-accent1 transition-colors hover:brightness-125"
            >
              🔥 Khám phá
            </Link>
          </div>
          <Button variant="ghost" onClick={refetch}>
            Làm mới
          </Button>
        </div>
      )}
    </Reveal>
  );
}

// formatUnits thô để tính toán (không rút gọn hiển thị).
function formatBalanceRaw(value: bigint, decimals: number): string {
  if (value === 0n) return "0";
  const s = value.toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals);
  const fracPart = s.slice(s.length - decimals);
  return `${intPart}.${fracPart}`;
}
