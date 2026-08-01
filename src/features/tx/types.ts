import type { Address, Hex } from "viem";

/**
 * Mô hình dữ liệu của Transaction Center — một nơi duy nhất theo dõi mọi giao
 * dịch đã gửi, thay cho việc mỗi tính năng tự giữ `useWaitForTransactionReceipt`
 * riêng rồi mất trạng thái ngay khi người dùng đổi tab.
 *
 * Mọi field đều JSON-serializable (không bigint) vì bản ghi được persist xuống
 * localStorage để hồi phục sau khi reload — đó là cơ chế "pending recovery":
 * tx đang chờ không biến mất khi tab đóng, lần mở sau app tự nối lại việc theo
 * dõi từ hash đã lưu.
 */

export type TxStatus =
  /** Đã gửi, chưa có receipt. */
  | "pending"
  /** Receipt status = success. */
  | "success"
  /** Receipt status = reverted (đã mất gas). */
  | "reverted"
  /** Hết thời gian theo dõi mà chưa vào block — có thể bị drop khỏi mempool. */
  | "dropped";

/** Loại giao dịch — quyết định icon và câu thông báo. */
export type TxKind = "swap" | "approve" | "revoke" | "send";

/** Lý do một tx bị thay thế (người dùng speed-up/cancel trong ví). */
export type TxReplacement = "repriced" | "cancelled" | "replaced";

export interface TrackedTx {
  /**
   * Khoá định danh bất biến. KHÔNG dùng `hash` làm khoá vì hash đổi khi tx bị
   * replace (speed-up/cancel) — lúc đó bản ghi phải được cập nhật, không phải
   * tạo mới.
   */
  id: string;
  hash: Hex;
  chainId: number;
  /** Ví đã gửi — dùng để chỉ hiện tx của tài khoản đang kết nối. */
  from: Address;
  kind: TxKind;
  /** Mô tả ngắn hiển thị trong danh sách, vd "Swap 0.1 ETH → 320 USDC". */
  title: string;
  status: TxStatus;
  createdAt: number;
  finalizedAt?: number;
  /** Có mặt nếu tx bị thay thế bởi một tx khác cùng nonce. */
  replacedBy?: Hex;
  replacement?: TxReplacement;
  /** Lý do thất bại (revert reason hoặc lỗi theo dõi), chưa dịch. */
  error?: string;
}

/** Thông báo hiện lên khi một tx chuyển sang trạng thái cuối. */
export interface TxNotice {
  id: string;
  tone: "success" | "error" | "warning";
  message: string;
  /** Link explorer nếu biết. */
  url: string | null;
}

/** Bản ghi đã ở trạng thái cuối (không cần theo dõi tiếp). */
export function isFinal(tx: TrackedTx): boolean {
  return tx.status !== "pending";
}
