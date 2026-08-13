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

/** Format giá token (hỗ trợ số rất nhỏ hoặc rất lớn). */
export function formatTokenPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1) {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: value >= 100 ? 2 : 4,
    });
  }
  if (value >= 0.0001) {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 6,
    });
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumSignificantDigits: 4,
  });
}

/** Format giá trị USD dạng compact ($8.4M, $1.3B). */
export function formatCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return formatUsd(value);
}

/** Thời gian tương đối (2m, 3h, 2d). */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/** Định dạng gwei cho hiển thị phí gas. */
export function formatGwei(wei: bigint): string {
  const gwei = Number(formatUnits(wei, 9));
  return `${gwei.toLocaleString("en-US", { maximumFractionDigits: 4 })} Gwei`;
}
