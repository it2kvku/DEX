"use client";

import { useState } from "react";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import {
  AlertTriangle,
  ExternalLink,
  Infinity as InfinityIcon,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import type { Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import { explorerAddressUrl } from "@/lib/chains";
import { formatBalance, shortenAddress } from "@/lib/format";
import { Alert, Badge, Button, Card, Skeleton, Spinner } from "@/components/ui";
import { Reveal } from "@/components/anim/Reveal";
import { useTxCenter, useTrackedTx } from "@/features/tx/TxCenter";
import { useAllowances, type AllowanceRow } from "./useAllowances";
import { isApprovalScanSupported } from "./discover";

/**
 * Bảng quyền chi tiêu đang mở + nút thu hồi (approve về 0).
 *
 * Thu hồi = `approve(spender, 0)`. Không có hàm `revoke` riêng trong ERC-20;
 * đặt allowance về 0 chính là cách chuẩn. Tx này đi qua Transaction Center với
 * `kind: "revoke"`, nên khi vào block thì prefix `allowances` được invalidate và
 * dòng tương ứng tự biến mất khỏi bảng.
 */
export function AllowanceManager() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { rows, discoveryStatus, isLoading, isError, refetch } =
    useAllowances();

  if (!address) {
    return (
      <Card>
        <Alert variant="info">Kết nối ví để xem các quyền đang cấp.</Alert>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const risky = rows.filter((r) => !r.label || r.unlimited).length;

  return (
    <Reveal className="space-y-3" watch={rows.length}>
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h3 className="font-display text-sm font-semibold text-white">
            Quyền chi tiêu ({rows.length})
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Mỗi dòng là một contract đang được phép rút token khỏi ví bạn.
          </p>
        </div>
        <Button variant="ghost" onClick={refetch} className="!px-2 text-xs">
          Làm mới
        </Button>
      </div>

      {isError && (
        <Alert variant="error">
          Không đọc được allowance từ RPC. Thử lại sau ít phút.
        </Alert>
      )}

      {discoveryStatus === "no-key" && (
        <Alert variant="info">
          Chưa có <span className="font-mono">NEXT_PUBLIC_ETHERSCAN_API_KEY</span>
          , nên chỉ dò được các contract DEX phổ biến trên token trong danh mục.
          Thêm key để quét toàn bộ lịch sử approve.
        </Alert>
      )}

      {discoveryStatus === "unsupported" && (
        <Alert variant="info">
          Mạng này không cho quét log approval ở gói API miễn phí. Danh sách dưới
          đây chỉ gồm các contract DEX phổ biến đã dò trực tiếp — có thể chưa đủ.
        </Alert>
      )}

      {discoveryStatus === "truncated" && (
        <Alert variant="warning">
          Ví có quá nhiều lượt approve nên chỉ quét được phần gần nhất. Những
          quyền cũ hơn có thể chưa hiện ở đây.
        </Alert>
      )}

      {risky > 0 && (
        <Alert variant="warning">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {risky} quyền nên xem lại: cấp cho contract không nhận diện được,
              hoặc cấp không giới hạn. Quyền không giới hạn nghĩa là contract đó
              rút được toàn bộ số token này của bạn ở bất kỳ lúc nào.
            </span>
          </span>
        </Alert>
      )}

      {rows.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2.5 text-sm text-neutral-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Không có quyền nào đang mở{" "}
            {!isApprovalScanSupported(chainId) && "(trong phạm vi dò được)"}.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <AllowanceCard key={row.key} row={row} />
          ))}
        </div>
      )}
    </Reveal>
  );
}

function AllowanceCard({ row }: { row: AllowanceRow }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { track } = useTxCenter();
  const revokeTx = useWriteContract();
  const tracked = useTrackedTx(revokeTx.data);
  const [confirming, setConfirming] = useState(false);

  const busy = revokeTx.isPending || tracked.isPending;
  const spenderUrl = explorerAddressUrl(chainId, row.spender);

  const doRevoke = () => {
    revokeTx.writeContract(
      {
        address: row.token,
        abi: erc20Abi,
        functionName: "approve",
        // Thu hồi = đặt allowance về 0. ERC-20 không có hàm revoke riêng.
        args: [row.spender, 0n],
      },
      {
        onSuccess: (hash) => {
          if (!address) return;
          track({
            hash,
            chainId,
            from: address,
            kind: "revoke",
            title: `${row.symbol} → ${row.label ?? shortenAddress(row.spender)}`,
          });
        },
      },
    );
    setConfirming(false);
  };

  return (
    <Card className="space-y-2.5">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
            row.label
              ? "border-white/[0.08] bg-white/[0.04] text-neutral-400"
              : "border-amber-500/25 bg-amber-500/10 text-amber-400"
          }`}
        >
          {row.label ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-white">{row.symbol}</span>
            {row.unlimited && (
              <Badge tone="red">
                <InfinityIcon className="mr-0.5 h-2.5 w-2.5" /> không giới hạn
              </Badge>
            )}
            {row.kind === "permit2" && <Badge tone="indigo">permit2</Badge>}
            {!row.label && <Badge tone="amber">không rõ</Badge>}
          </div>

          <p className="mt-1 text-xs text-neutral-400">
            Cấp cho{" "}
            <span className="text-neutral-200">
              {row.label ?? "contract không nhận diện được"}
            </span>
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
            <span className="font-mono">{shortenAddress(row.spender)}</span>
            {spenderUrl && (
              <a
                href={spenderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-neutral-500 transition-colors hover:text-accent1"
              >
                explorer <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            <span>·</span>
            <span>
              Hạn mức:{" "}
              <span className="font-mono text-neutral-400">
                {row.unlimited
                  ? "∞"
                  : formatBalance(row.amount, row.decimals)}{" "}
                {row.symbol}
              </span>
            </span>
            {row.lastTimestamp && (
              <>
                <span>·</span>
                <span>
                  {new Date(row.lastTimestamp).toLocaleDateString("vi-VN")}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {revokeTx.error && (
        <Alert variant="error">
          {revokeTx.error.message.split("\n")[0].slice(0, 120)}
        </Alert>
      )}

      {tracked.isSuccess ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <ShieldOff className="h-3.5 w-3.5" /> Đã thu hồi. Danh sách sẽ tự cập
          nhật.
        </p>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            onClick={doRevoke}
            className="flex-1 !py-2 text-xs"
          >
            Xác nhận thu hồi
          </Button>
          <Button
            variant="secondary"
            onClick={() => setConfirming(false)}
            className="!py-2 text-xs"
          >
            Huỷ
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="w-full !py-2 text-xs"
        >
          {busy ? (
            <>
              <Spinner className="!h-3 !w-3" />
              {revokeTx.isPending ? "Chờ ký trong ví…" : "Đang thu hồi…"}
            </>
          ) : (
            <>
              <ShieldOff className="h-3.5 w-3.5" /> Thu hồi quyền
            </>
          )}
        </Button>
      )}
    </Card>
  );
}
