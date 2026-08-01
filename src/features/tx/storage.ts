"use client";

import type { TrackedTx } from "./types";

/**
 * Lưu danh sách giao dịch xuống localStorage để hồi phục sau khi reload.
 *
 * Chỉ có hash + metadata hiển thị — không có gì nhạy cảm, và hash vốn đã công
 * khai trên chain. Dùng localStorage (không phải IndexedDB như vault ví) vì dữ
 * liệu nhỏ, cần đọc đồng bộ ngay lúc mount để pending tx xuất hiện lại tức thì.
 */

const STORAGE_KEY = "tx-center:v1";

/** Giữ tối đa số bản ghi để localStorage không phình theo thời gian. */
const MAX_RECORDS = 50;

/** Tx pending quá lâu coi như đã bị drop khỏi mempool, không theo dõi lại. */
export const PENDING_TTL_MS = 30 * 60 * 1000;

function isTrackedTx(v: unknown): v is TrackedTx {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<TrackedTx>;
  return (
    typeof t.id === "string" &&
    typeof t.hash === "string" &&
    typeof t.chainId === "number" &&
    typeof t.from === "string" &&
    typeof t.status === "string" &&
    typeof t.createdAt === "number"
  );
}

export function loadTxs(): TrackedTx[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Lọc từng phần tử: dữ liệu localStorage có thể do phiên bản cũ ghi ra.
    return parsed.filter(isTrackedTx);
  } catch {
    return [];
  }
}

export function saveTxs(txs: TrackedTx[]): void {
  if (typeof window === "undefined") return;
  try {
    // Tx mới nhất đứng đầu nên cắt phần đuôi là bỏ bản ghi cũ nhất.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(txs.slice(0, MAX_RECORDS)),
    );
  } catch {
    // localStorage đầy hoặc bị chặn (private mode) — tx center vẫn chạy trong
    // RAM, chỉ mất khả năng hồi phục sau reload.
  }
}
