"use client";

import { useState } from "react";
import { useChainId } from "wagmi";
import {
  useHistory,
  isExplorerSupported,
  type HistoryMode,
} from "./useHistory";
import { explorerTxUrl } from "@/lib/chains";
import { shortenAddress } from "@/lib/format";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui";
import { Reveal } from "@/components/anim/Reveal";

export function History() {
  const chainId = useChainId();
  const [mode, setMode] = useState<HistoryMode>("native");
  const { data, isLoading, isError, error, refetch } = useHistory(mode);

  if (!isExplorerSupported(chainId)) {
    return (
      <Card>
        <Alert variant="info">
          Chain hiện tại chưa hỗ trợ tải lịch sử qua explorer.
        </Alert>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Segmented control: coin bản địa / token ERC-20.
          Active = xám nhạt + chữ trắng (hồng chỉ dành cho CTA chính). */}
      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
        {(
          [
            { id: "native", label: "Coin" },
            { id: "token", label: "Token ERC-20" },
          ] as { id: HistoryMode; label: string }[]
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              mode === m.id
                ? "bg-white/[0.08] text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="space-y-3">
          <Alert variant="error">
            {error instanceof Error ? error.message : "Không tải được lịch sử."}
          </Alert>
          <Button variant="secondary" onClick={() => refetch()}>
            Thử lại
          </Button>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card>
          <Alert variant="info">
            {mode === "native"
              ? "Chưa có giao dịch coin nào."
              : "Chưa có giao dịch token nào."}
          </Alert>
        </Card>
      ) : (
        <Reveal className="space-y-2" watch={`${mode}-${data.length}`}>
          {data.map((tx) => {
            const url = explorerTxUrl(chainId, tx.hash);
            const isOut = tx.direction === "out";
            return (
              <Card
                key={`${tx.hash}-${tx.symbol}`}
                className="space-y-1.5 transition-colors hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                        isOut
                          ? "bg-rose-500/15 text-rose-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {isOut ? "↗" : "↙"}
                    </span>
                    <Badge tone={isOut ? "red" : "green"}>
                      {isOut ? "Gửi" : "Nhận"}
                    </Badge>
                    {tx.status === "failed" && (
                      <Badge tone="amber">thất bại</Badge>
                    )}
                  </div>
                  <span className="font-mono text-sm">
                    {isOut ? "-" : "+"}
                    {Number(tx.value).toLocaleString("en-US", {
                      maximumFractionDigits: 6,
                    })}{" "}
                    {tx.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span className="font-mono">
                    {isOut
                      ? `Đến ${shortenAddress(tx.to)}`
                      : `Từ ${shortenAddress(tx.from)}`}
                  </span>
                  <span>{new Date(tx.timestamp).toLocaleString("vi-VN")}</span>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent1 transition-all hover:brightness-125"
                  >
                    Xem chi tiết →
                  </a>
                )}
              </Card>
            );
          })}
        </Reveal>
      )}
    </div>
  );
}
