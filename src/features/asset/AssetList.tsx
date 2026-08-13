"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useChainId } from "wagmi";
import { useAssets } from "./useBalances";
import { usePrices } from "./usePrices";
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

  const llamaKeys = useMemo(() => {
    const keys = rows
      .map((r) => llamaKeyForAsset(chainId, r))
      .filter((k): k is string => !!k);
    return Array.from(new Set(keys)).sort();
  }, [rows, chainId]);

  const keyForRow = (r: (typeof rows)[number]) =>
    llamaKeyForAsset(chainId, r);

  const { data: prices } = usePrices(llamaKeys);

  const totalUsd = useMemo(() => {
    return rows.reduce((sum, r) => {
      const lk = llamaKeyForAsset(chainId, r);
      const price = lk ? (prices?.[lk]?.usd ?? 0) : 0;
      const amount = Number(formatBalanceRaw(r.balance, r.decimals));
      return sum + amount * price;
    }, 0);
  }, [rows, prices, chainId]);

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
    <Reveal className="space-y-4" watch={rows.length}>
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

      {/* Danh sách token */}
      <div className="space-y-2">
        {rows.map((r) => {
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
        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => setImporting(true)}>
            ＋ Import token
          </Button>
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
