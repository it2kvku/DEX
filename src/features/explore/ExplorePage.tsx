"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChainId } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flame } from "lucide-react";
import { fetchTrendingPools, GECKO_NETWORK } from "@/lib/geckoterminal";
import { formatCompactUsd, shortenAddress } from "@/lib/format";
import { supportedChains } from "@/lib/chains";
import { BoxesBackground } from "@/components/BoxesBackground";
import { BrandLogo } from "@/components/BrandLogo";
import { NetworkSelector } from "@/components/NetworkSelector";
import { WalletButton } from "@/components/WalletButton";
import { TokenLogo } from "@/components/TokenLogo";
import { Alert, Card, Skeleton } from "@/components/ui";

/**
 * Trang Khám phá: pool đang có hoạt động cao nhất trên chain đang chọn
 * (GeckoTerminal trending_pools). Click một pool sang trang chi tiết token
 * gốc — token không cần có sẵn trong danh sách, trang chi tiết tự đọc
 * metadata on-chain.
 */

type Duration = "5m" | "1h" | "6h" | "24h";

const DURATIONS: { id: Duration; label: string }[] = [
  { id: "5m", label: "5 phút" },
  { id: "1h", label: "1 giờ" },
  { id: "6h", label: "6 giờ" },
  { id: "24h", label: "24 giờ" },
];

export function ExplorePage() {
  const router = useRouter();
  const chainId = useChainId();
  const [duration, setDuration] = useState<Duration>("24h");

  const chain = supportedChains.find((c) => c.id === chainId);
  const supported = !!GECKO_NETWORK[chainId];

  const trending = useQuery({
    queryKey: ["trending-pools", chainId, duration],
    enabled: supported,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: () => fetchTrendingPools(chainId, duration),
  });

  return (
    <main className="pointer-events-none relative min-h-screen">
      <BoxesBackground />

      <header className="pointer-events-auto fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#0a0a10]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/app" className="flex shrink-0 items-center gap-2.5">
            <BrandLogo height={30} priority />
            <span className="hidden font-display text-sm font-bold tracking-tight text-white sm:inline">
              Web3 Wallet
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <NetworkSelector />
            <WalletButton />
          </div>
        </div>
      </header>

      <div className="pointer-events-auto relative mx-auto w-full max-w-3xl px-4 pb-16 pt-24 sm:px-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại
        </button>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-white">
            <Flame className="h-5 w-5 text-accent1" />
            Khám phá — {chain?.name ?? `Chain ${chainId}`}
          </h1>
          <div className="flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
            {DURATIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDuration(d.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  duration === d.id
                    ? "bg-accent1 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {!supported ? (
          <Alert variant="info">
            Chưa có dữ liệu khám phá cho mạng này — chọn mạng khác ở góc trên
            bên phải.
          </Alert>
        ) : trending.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : trending.isError ? (
          <Card className="space-y-3">
            <Alert variant="error">
              Không tải được danh sách pool (GeckoTerminal có thể đang giới hạn
              tần suất).
            </Alert>
            <button
              onClick={() => trending.refetch()}
              className="text-sm text-accent1 hover:brightness-125"
            >
              Thử lại
            </button>
          </Card>
        ) : (trending.data ?? []).length === 0 ? (
          <Alert variant="info">Chưa có pool nào nổi bật trên mạng này.</Alert>
        ) : (
          <div className="space-y-2">
            {(trending.data ?? []).map((p, i) => {
              const [baseSym, quoteSym] = p.name.split("/");
              const change = p.change24hPct;
              const changeTone =
                change === null
                  ? "text-neutral-500"
                  : change >= 0
                    ? "text-emerald-400"
                    : "text-rose-400";
              return (
                <Link
                  key={p.id}
                  href={`/app/token/${p.baseTokenAddress}`}
                  className="block"
                >
                  <Card className="flex items-center gap-3 transition-colors hover:bg-white/[0.06]">
                    <span className="w-6 shrink-0 text-center font-display text-sm font-bold text-neutral-600">
                      {i + 1}
                    </span>
                    <TokenLogo
                      chainId={chainId}
                      address={p.baseTokenAddress}
                      symbol={baseSym ?? p.name}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {p.name}
                        </span>
                        <span className="hidden truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-neutral-400 sm:inline">
                          {p.dex.replaceAll("_", " ")}
                        </span>
                      </div>
                      <span className="block truncate text-xs text-neutral-500">
                        {shortenAddress(p.baseTokenAddress)} ·{" "}
                        {p.tx24h !== null
                          ? `${p.tx24h.toLocaleString("en-US")} giao dịch`
                          : quoteSym ?? ""}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-mono text-sm ${changeTone}`}>
                        {change === null
                          ? "—"
                          : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
                      </div>
                      <div className="text-xs text-neutral-500">
                        KL {formatCompactUsd(p.volume24hUsd)}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
            <p className="pt-2 text-center text-[10px] text-neutral-600">
              Nguồn: GeckoTerminal · đổi lượng theo khung giờ đã chọn, KL =
              khối lượng
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
