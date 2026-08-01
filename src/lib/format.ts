import { formatUnits } from "viem";

/** Rút gọn địa chỉ: 0x1234...abcd */
export function shortenAddress(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Format số dư token từ bigint sang chuỗi dễ đọc.
 * Cắt bớt số lẻ để tránh chuỗi dài lê thê.
 */
export function formatBalance(
  value: bigint,
  decimals: number,
  maxFractionDigits = 6,
): string {
  const raw = formatUnits(value, decimals);
  const num = Number(raw);
  if (num === 0) return "0";
  // Số rất nhỏ: hiển thị dạng "< 0.000001" thay vì 0.
  if (num > 0 && num < 10 ** -maxFractionDigits) {
    return `< ${10 ** -maxFractionDigits}`;
  }
  return num.toLocaleString("en-US", {
    maximumFractionDigits: maxFractionDigits,
  });
}

/** Format giá trị USD. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** Định dạng gwei cho hiển thị phí gas. */
export function formatGwei(wei: bigint): string {
  const gwei = Number(formatUnits(wei, 9));
  return `${gwei.toLocaleString("en-US", { maximumFractionDigits: 4 })} Gwei`;
}
