import type { AssetRow } from "./useBalances";

/**
 * Lọc danh sách tài sản cho tab Tài sản.
 *
 * Vấn đề: sau khi nạp danh sách token chuẩn (Uniswap list), một chain có
 * hàng trăm token — hiện tất cả kể cả số dư 0 là danh sách vô dụng. Nguyên
 * tắc hiển thị:
 *
 *   - Không tìm kiếm: chỉ hiện native, token CÓ số dư, và token tự import.
 *   - Có tìm kiếm: hiện mọi token khớp symbol/tên/địa chỉ (kể cả số dư 0) —
 *     để người dùng tra cứu và bấm vào xem chart/trang chi tiết — nhưng giới
 *     hạn số kết quả để không render hàng trăm row.
 *
 * Pure function để unit test được: logic này hay sai ở edge case (native
 * không bị lọc bỏ, custom luôn hiện, query trim + không phân biệt hoa).
 */

export const SEARCH_RESULT_LIMIT = 50;

export interface FilterableRow {
  kind: "native" | "erc20";
  address?: string;
  symbol: string;
  name: string;
  balance: bigint;
  isCustom?: boolean;
}

export function visibleAssetRows<T extends FilterableRow>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return rows.filter(
      (r) => r.kind === "native" || r.balance > 0n || r.isCustom,
    );
  }
  return rows
    .filter((r) => {
      const addr = r.address?.toLowerCase() ?? "";
      return (
        r.symbol.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        addr.includes(q)
      );
    })
    .slice(0, SEARCH_RESULT_LIMIT);
}
