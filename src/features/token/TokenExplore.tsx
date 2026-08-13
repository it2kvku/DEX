"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Globe, Check } from "lucide-react";
import type { Address } from "viem";
import {
  formatCompactUsd,
  formatTokenPrice,
  formatUsd,
  shortenAddress,
  timeAgo,
} from "@/lib/format";
import { explorerTxUrl } from "@/lib/chains";
import { Skeleton } from "@/components/ui";
import type { TokenDetail } from "./useTokenDetail";
import { useTokenExplore } from "./useTokenExplore";

type Tab = "tx" | "pools";

export function TokenExplore({
  chainId,
  detail,
  llamaKey,
  explorerUrl,
}: {
  chainId: number;
  detail: TokenDetail;
  llamaKey: string | null;
  explorerUrl: string | null;
}) {
  const [tab, setTab] = useState<Tab>("tx");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const {
    stats,
    statsLoading,
    pools,
    poolsLoading,
    trades,
    tradesLoading,
    about,
    aboutLoading,
    supported,
  } = useTokenExplore(chainId, detail, llamaKey);

  const copyContract = async () => {
    if (!detail.address) return;
    await navigator.clipboard.writeText(detail.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!supported) {
    return (
      <Panel>
        <p className="text-sm text-neutral-500">
          Thống kê chi tiết chưa hỗ trợ mạng này.
        </p>
      </Panel>
    );
  }

  const desc = about?.description?.replace(/<[^>]+>/g, "").trim();

  return (
    <div className="space-y-6">
      {/* Stats */}
      <Panel title="Thống kê">
        {statsLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Stat label="TVL" value={formatCompactUsd(stats?.tvlUsd)} />
            <Stat
              label="Vốn hoá"
              value={formatCompactUsd(stats?.marketCapUsd)}
            />
            <Stat label="FDV" value={formatCompactUsd(stats?.fdvUsd)} />
            <Stat
              label="KL 24h"
              value={formatCompactUsd(stats?.volume24hUsd)}
            />
            <Stat
              label="Cao 52 tuần"
              value={formatTokenPrice(stats?.high52w ?? 0)}
            />
            <Stat
              label="Thấp 52 tuần"
              value={formatTokenPrice(stats?.low52w ?? 0)}
            />
          </div>
        )}
        <p className="mt-4 text-[10px] text-neutral-600">
          Nguồn: GeckoTerminal · 52 tuần từ DefiLlama
        </p>
      </Panel>

      {/* About */}
      <Panel title="Giới thiệu">
        {aboutLoading && !desc ? (
          <Skeleton className="mb-4 h-16 w-full" />
        ) : desc ? (
          <p
            className={`text-sm leading-relaxed text-neutral-400 ${expanded ? "" : "line-clamp-4"}`}
          >
            {desc}
          </p>
        ) : (
          <p className="text-sm text-neutral-500">
            {detail.name} ({detail.symbol}) trên {detail.chainName}.
          </p>
        )}
        {desc && desc.length > 200 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 text-xs font-medium text-accent1 hover:brightness-125"
          >
            {expanded ? "Thu gọn" : "Xem thêm"}
          </button>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {detail.kind === "erc20" && detail.address && (
            <LinkChip
              onClick={copyContract}
              icon={copied ? Check : Copy}
              label={shortenAddress(detail.address)}
            />
          )}
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.08]"
            >
              <ExternalLink className="h-3 w-3" />
              Explorer
            </a>
          )}
          {about?.website && (
            <a
              href={about.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.08]"
            >
              <Globe className="h-3 w-3" />
              Website
            </a>
          )}
          {about?.twitter && (
            <a
              href={about.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.08]"
            >
              𝕏 Twitter
            </a>
          )}
        </div>
      </Panel>

      {/* Tabs: Giao dịch | Pools */}
      <Panel>
        <div className="mb-4 flex gap-1 border-b border-white/[0.06] pb-3">
          <TabBtn active={tab === "tx"} onClick={() => setTab("tx")}>
            Giao dịch
          </TabBtn>
          <TabBtn active={tab === "pools"} onClick={() => setTab("pools")}>
            Pools
          </TabBtn>
        </div>

        {tab === "tx" ? (
          tradesLoading ? (
            <TableSkeleton cols={6} />
          ) : trades.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              Chưa có giao dịch gần đây trên pool chính.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-xs">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="pb-2 font-medium">Thời gian</th>
                    <th className="pb-2 font-medium">Loại</th>
                    <th className="pb-2 font-medium">{detail.symbol}</th>
                    <th className="pb-2 font-medium">Đổi lấy</th>
                    <th className="pb-2 font-medium">USD</th>
                    <th className="pb-2 font-medium">Ví</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const txUrl = explorerTxUrl(chainId, t.txHash);
                    return (
                      <tr
                        key={t.id}
                        className="border-t border-white/[0.04] text-neutral-300"
                      >
                        <td className="py-2.5 text-neutral-500">
                          {timeAgo(t.time)}
                        </td>
                        <td
                          className={
                            t.kind === "buy"
                              ? "py-2.5 text-emerald-400"
                              : "py-2.5 text-rose-400"
                          }
                        >
                          {t.kind === "buy" ? "Mua" : "Bán"}
                        </td>
                        <td className="py-2.5 font-mono">
                          {t.tokenAmount.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })}
                        </td>
                        <td className="py-2.5 font-mono text-neutral-400">
                          {t.counterAmount.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })}{" "}
                          {t.counterSymbol}
                        </td>
                        <td className="py-2.5">{formatUsd(t.usd)}</td>
                        <td className="py-2.5">
                          {txUrl ? (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-neutral-500 hover:text-accent1"
                            >
                              {shortenAddress(t.wallet)}
                            </a>
                          ) : (
                            <span className="font-mono text-neutral-500">
                              {shortenAddress(t.wallet)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : poolsLoading ? (
          <TableSkeleton cols={4} />
        ) : pools.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">
            Không tìm thấy pool thanh khoản.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="text-neutral-500">
                  <th className="pb-2 font-medium">Pool</th>
                  <th className="pb-2 font-medium">DEX</th>
                  <th className="pb-2 font-medium">TVL</th>
                  <th className="pb-2 font-medium">KL 24h</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => (
                  <tr
                    key={p.address}
                    className="border-t border-white/[0.04] text-neutral-300"
                  >
                    <td className="py-2.5">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent1"
                        >
                          {p.name}
                        </a>
                      ) : (
                        p.name
                      )}
                    </td>
                    <td className="py-2.5 capitalize text-neutral-500">
                      {p.dex}
                    </td>
                    <td className="py-2.5">
                      {formatCompactUsd(p.reserveUsd)}
                    </td>
                    <td className="py-2.5">
                      {formatCompactUsd(p.volume24hUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-4 backdrop-blur-xl sm:p-6">
      {title && (
        <h2 className="mb-4 font-display text-sm font-semibold text-white">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-white sm:text-xl">
        {value}
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function LinkChip({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-neutral-300 transition-colors hover:bg-white/[0.08]"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
      <span className="sr-only">{cols} columns</span>
    </div>
  );
}
