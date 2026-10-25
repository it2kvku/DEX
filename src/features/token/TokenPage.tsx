"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useBalance, useChainId, useReadContract } from "wagmi";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Check,
} from "lucide-react";
import { formatUnits, type Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import { explorerAddressUrl, supportedChains } from "@/lib/chains";
import { formatBalance, formatUsd, shortenAddress } from "@/lib/format";
import type { ChartRange } from "@/lib/marketData";
import { BoxesBackground } from "@/components/BoxesBackground";
import { BrandLogo } from "@/components/BrandLogo";
import { NetworkSelector } from "@/components/NetworkSelector";
import { WalletButton } from "@/components/WalletButton";
import { TokenLogo } from "@/components/TokenLogo";
import { Alert, Card, Skeleton } from "@/components/ui";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Swap } from "@/features/swap/Swap";
import type { TokenChoice } from "@/features/swap/TokenSelect";
import { useTokenDetail } from "./useTokenDetail";
import { useTokenExplore } from "./useTokenExplore";
import { useTokenOhlc } from "./useTokenOhlc";
import { useTokenChart } from "./useTokenChart";
import { PriceChart, PriceChartSkeleton } from "./PriceChart";
import { TokenExplore } from "./TokenExplore";

export function TokenPage({ addressParam }: { addressParam: string }) {
  const router = useRouter();
  const chainId = useChainId();
  const { address: walletAddress, isConnected } = useAccount();
  const [range, setRange] = useState<ChartRange>("1D");
  const [copied, setCopied] = useState(false);

  const {
    detail,
    priceUsd,
    change24h,
    pricesLoading,
    notFound,
    resolving,
    chartAvailable,
  } = useTokenDetail(addressParam);

  const chart = useTokenChart(detail?.llamaKey ?? null, range);
  // Nguồn topPool cho nến OHLC — dùng chung query cache với TokenExplore.
  const { stats } = useTokenExplore(chainId, detail, detail?.llamaKey ?? null);
  const ohlc = useTokenOhlc(chainId, stats?.topPoolAddress ?? null, range);

  const rangeChange = useMemo(() => {
    if (chart.data && chart.data.openPrice > 0) {
      return (
        ((chart.data.closePrice - chart.data.openPrice) /
          chart.data.openPrice) *
        100
      );
    }
    return change24h ?? null;
  }, [chart.data, change24h]);

  const balance = useNativeOrErc20Balance(
    detail?.kind ?? "native",
    detail?.address,
    walletAddress,
  );

  const swapDefaultIn: TokenChoice = "native";
  const swapDefaultOut: TokenChoice | null =
    detail?.kind === "native"
      ? null
      : (detail?.address as TokenChoice);

  const explorerUrl =
    detail?.kind === "erc20" && detail.address
      ? explorerAddressUrl(chainId, detail.address)
      : null;

  const copyAddress = async () => {
    if (detail?.kind !== "erc20" || !detail.address) return;
    await navigator.clipboard.writeText(detail.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (notFound) {
    return (
      <TokenShell>
        <Card className="mx-auto max-w-lg space-y-4 text-center">
          <p className="font-display text-lg font-semibold">
            Không đọc được token trên mạng này
          </p>
          <p className="text-sm text-neutral-500">
            Địa chỉ này không phải token ERC-20 trên{" "}
            <span className="text-neutral-300">
              {supportedChains.find((c) => c.id === chainId)?.name ??
                `chain ${chainId}`}
            </span>{" "}
            — có thể nó là token của chain khác (vd mở link token mainnet khi ví
            đang ở Sepolia) hoặc là địa chỉ ví thường. Thử đổi mạng ở góc trên
            phải.
          </p>
          <div className="flex justify-center gap-2">
            <Link
              href="/app"
              className="inline-block text-sm text-accent1 hover:brightness-125"
            >
              ← Về ví
            </Link>
            <Link
              href="/app/explore"
              className="inline-block text-sm text-neutral-400 hover:text-white"
            >
              Khám phá token
            </Link>
          </div>
        </Card>
      </TokenShell>
    );
  }

  // Token lạ (link từ Khám phá, token chưa import): đang đọc metadata on-chain.
  if (resolving || !detail) {
    return (
      <TokenShell>
        <div className="mx-auto w-full max-w-6xl px-4 pt-24 sm:px-6">
          <Card className="mx-auto flex max-w-lg items-center justify-center gap-2 text-sm text-neutral-400">
            <Skeleton className="h-4 w-4 animate-pulse rounded-full" />
            Đang đọc thông tin token trên mạng…
          </Card>
        </div>
      </TokenShell>
    );
  }

  const displayName = detail!.name;
  const displaySymbol = detail!.symbol;

  return (
    <TokenShell>
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 sm:px-6">
        {/* Breadcrumb + header token */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại
          </button>

          <p className="mb-3 text-xs text-neutral-500">
            <Link href="/app" className="hover:text-neutral-300">
              Tokens
            </Link>
            <span className="mx-1.5">›</span>
            <span className="text-neutral-300">{displaySymbol}</span>
          </p>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <TokenLogo
                chainId={chainId}
                address={
                  detail!.kind === "erc20" ? detail!.address : undefined
                }
                symbol={displaySymbol}
                size={44}
              />
              <div>
                <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
                  {displayName}
                </h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span>{displaySymbol}</span>
                  <span className="text-neutral-700">·</span>
                  <span>{detail!.chainName}</span>
                  {detail!.kind === "erc20" && detail!.address && (
                    <>
                      <span className="text-neutral-700">·</span>
                      <button
                        type="button"
                        onClick={copyAddress}
                        className="inline-flex items-center gap-1 font-mono hover:text-neutral-300"
                      >
                        {shortenAddress(detail!.address)}
                        {copied ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-500 hover:text-accent1"
                          title="Xem trên explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {isConnected && balance.data !== undefined && (
              <div className="text-right">
                <p className="text-xs text-neutral-500">Số dư của bạn</p>
                <p className="font-mono text-sm text-white">
                  {formatBalance(balance.data, detail!.decimals)}{" "}
                  {displaySymbol}
                </p>
                {priceUsd != null && priceUsd > 0 && balance.data !== undefined && (
                  <p className="text-xs text-neutral-500">
                    ≈{" "}
                    {formatUsd(
                      Number(formatUnits(balance.data, detail!.decimals)) *
                        priceUsd,
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {detail!.isReferenceChart && chartAvailable && (
          <div className="mb-4">
            <Alert variant="info">
              Sepolia testnet — biểu đồ hiển thị giá tham khảo từ mainnet, không
              phản ánh giá on-chain testnet.
            </Alert>
          </div>
        )}

        {/* Layout 2 cột: chart trái, swap phải */}
        <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-4 backdrop-blur-xl sm:p-6">
              {!chartAvailable ? (
                <div className="space-y-4 py-8 text-center">
                  <p className="text-sm text-neutral-400">
                    Token này chưa có dữ liệu giá trên DefiLlama.
                  </p>
                </div>
              ) : chart.isLoading && !chart.data ? (
                <PriceChartSkeleton />
              ) : (
                <PriceChart
                  candles={ohlc.data ?? null}
                  candlesLoading={ohlc.isLoading}
                  points={chart.data?.points ?? []}
                  loading={chart.isLoading || pricesLoading}
                  error={chart.isError}
                  range={range}
                  onRangeChange={setRange}
                  currentPrice={
                    chart.data?.closePrice ?? priceUsd ?? null
                  }
                  rangeChange={rangeChange}
                />
              )}
            </div>

            <TokenExplore
              chainId={chainId}
              detail={detail!}
              llamaKey={detail!.llamaKey}
              explorerUrl={explorerUrl}
            />
          </div>

          {/* Swap panel */}
          <div className="lg:sticky lg:top-20">
            <div className="rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
              <WidgetErrorBoundary label="swap">
                <Swap
                  defaultTokenIn={swapDefaultIn}
                  defaultTokenOut={swapDefaultOut}
                  compact
                />
              </WidgetErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </TokenShell>
  );
}

function TokenShell({ children }: { children: React.ReactNode }) {
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
      <div className="pointer-events-auto relative">{children}</div>
    </main>
  );
}

function useNativeOrErc20Balance(
  kind: "native" | "erc20",
  tokenAddress: Address | undefined,
  walletAddress: Address | undefined,
) {
  const native = useBalance({
    address: walletAddress,
    query: { enabled: kind === "native" && !!walletAddress },
  });

  const erc20 = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: kind === "erc20" && !!walletAddress && !!tokenAddress },
  });

  if (kind === "native") {
    return { data: native.data?.value, isLoading: native.isLoading };
  }
  return {
    data: erc20.data as bigint | undefined,
    isLoading: erc20.isLoading,
  };
}

