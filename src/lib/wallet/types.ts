import type { WalletClient, Address } from "viem";

/**
 * Kiểu ví:
 * - "injected": ví bên ngoài (MetaMask, WalletConnect...). App KHÔNG giữ private key.
 * - "in-app":   ví do app tự sinh/nhập, key mã hóa lưu trong IndexedDB.
 *
 * Toàn bộ tầng Asset/Transaction/History chỉ làm việc với interface WalletAccount,
 * không cần biết ví thuộc loại nào — đây là điểm mấu chốt để hỗ trợ cả hai mô hình
 * mà không tách thành hai codebase.
 */
export type WalletKind = "injected" | "in-app";

export interface WalletAccount {
  /** Địa chỉ ví (checksummed). */
  address: Address;
  /** Loại ví. */
  kind: WalletKind;
  /** Chain hiện tại. */
  chainId: number;
  /**
   * Lấy WalletClient của viem để ký/gửi giao dịch.
   * - injected: trả về client từ connector.
   * - in-app:   giải mã key tạm trong RAM để tạo client, không giữ key lâu dài.
   */
  getWalletClient(): Promise<WalletClient>;
}
