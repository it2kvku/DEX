"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  Send as SendIcon,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import { explorerTxUrl } from "@/lib/chains";
import { Spinner } from "@/components/ui";
import { useTxCenter } from "./TxCenter";
import type { TrackedTx, TxKind } from "./types";

/**
 * Hai mặt hiển thị của Transaction Center:
 *   - `TxNotices`: toast xếp chồng, hiện khi một tx đạt trạng thái cuối.
 *   - `TxQueue`: danh sách tx của phiên, sống sót qua reload.
 *
 * Đặt ở tầng layout (không trong tab) vì tx vẫn chạy khi người dùng đã chuyển
 * sang tab khác — đó chính là lý do tx center tồn tại.
 */

const KIND_ICON: Record<TxKind, typeof ArrowLeftRight> = {
  swap: ArrowLeftRight,
  approve: ShieldCheck,
  revoke: ShieldOff,
  send: SendIcon,
};

/** Toast thông báo — tự tắt sau 6s, xếp chồng từ dưới lên. */
export function TxNotices() {
  const { notices, dismissNotice } = useTxCenter();

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[70] flex flex-col items-end gap-2 md:bottom-6">
      <AnimatePresence>
        {notices.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, x: 32, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className={`pointer-events-auto flex max-w-[320px] items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm shadow-2xl backdrop-blur-xl ${
              n.tone === "success"
                ? "border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-100"
                : n.tone === "error"
                  ? "border-rose-500/25 bg-rose-500/[0.12] text-rose-100"
                  : "border-amber-500/25 bg-amber-500/[0.12] text-amber-100"
            }`}
            role="status"
          >
            {n.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words">{n.message}</p>
              {n.url && (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs underline decoration-dotted"
                >
                  Xem trên explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => dismissNotice(n.id)}
              className="rounded-lg p-0.5 opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-white/20"
              aria-label="Đóng thông báo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Hàng đợi giao dịch của ví đang kết nối, trên chain hiện tại. Chỉ hiện khi có
 * bản ghi — không chiếm chỗ ở trạng thái rỗng.
 */
export function TxQueue() {
  const { txs, clearFinished } = useTxCenter();
  const { address } = useAccount();
  const chainId = useChainId();

  const mine = txs.filter(
    (t) =>
      t.chainId === chainId &&
      !!address &&
      t.from.toLowerCase() === address.toLowerCase(),
  );
  if (mine.length === 0) return null;

  const hasFinished = mine.some((t) => t.status !== "pending");

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Giao dịch ({mine.length})
        </span>
        {hasFinished && (
          <button
            onClick={clearFinished}
            className="rounded-lg px-1.5 py-0.5 text-xs text-neutral-500 outline-none transition-colors hover:text-neutral-300 focus-visible:ring-2 focus-visible:ring-white/20"
          >
            Xoá đã xong
          </button>
        )}
      </div>
      <div className="space-y-1">
        {mine.map((tx) => (
          <TxRow key={tx.id} tx={tx} />
        ))}
      </div>
    </div>
  );
}

function TxRow({ tx }: { tx: TrackedTx }) {
  const Icon = KIND_ICON[tx.kind];
  const url = explorerTxUrl(tx.chainId, tx.hash);

  const tone =
    tx.status === "success"
      ? "text-emerald-400"
      : tx.status === "reverted"
        ? "text-rose-400"
        : tx.status === "dropped"
          ? "text-amber-400"
          : "text-neutral-400";

  const statusText =
    tx.status === "pending"
      ? "Đang chờ xác nhận"
      : tx.status === "success"
        ? "Thành công"
        : tx.status === "reverted"
          ? "Bị revert"
          : "Chưa xác nhận được";

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]">
      <span className={`shrink-0 ${tone}`}>
        {tx.status === "pending" ? (
          <Spinner className="!h-4 !w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-neutral-200">{tx.title}</p>
        <p className={`text-[11px] ${tone}`}>
          {statusText}
          {/* Tx bị speed-up/cancel trong ví: hash đã đổi, nói rõ để người dùng
              không tưởng là giao dịch lạ. */}
          {tx.replacement === "repriced" && " (đã tăng gas)"}
          {tx.replacement === "cancelled" && " (đã huỷ trong ví)"}
          {tx.replacement === "replaced" && " (đã bị thay thế)"}
        </p>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg p-1 text-neutral-500 outline-none transition-colors hover:text-accent1 focus-visible:ring-2 focus-visible:ring-white/20"
          aria-label="Xem trên explorer"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
