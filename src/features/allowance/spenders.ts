import type { Address } from "viem";

/**
 * Nhãn cho các spender phổ biến.
 *
 * Toàn bộ tên trong bảng này lấy từ trường `ContractName` của contract đã
 * verify trên Etherscan (đã tra thật, không đoán theo tên thư mục): ví dụ
 * `0x68b3…Fc45` trả về `SwapRouter02` trên cả 3 chain 1/137/42161, còn
 * `0x0000…8BA3` trả về `Permit2`. Nhờ vậy nhãn hiển thị cho người dùng không
 * phải là phỏng đoán.
 *
 * Vì sao cần nhãn: allowance chỉ là cặp (token, address). Người dùng không thể
 * tự biết `0x1231DEB6…` là router của LI.FI hay là contract lừa đảo. Spender
 * KHÔNG có trong bảng sẽ được đánh dấu "Không rõ" — đó chính là nhóm đáng xem
 * lại trước tiên.
 */

interface SpenderInfo {
  label: string;
  /** Nhóm để UI phân biệt hạ tầng DEX quen thuộc với contract lạ. */
  kind: "dex" | "permit2" | "bridge";
}

/** Khoá là địa chỉ viết thường — nhiều protocol deploy cùng address trên nhiều chain. */
const KNOWN_SPENDERS: Record<string, SpenderInfo> = {
  // Uniswap
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": {
    label: "Uniswap SwapRouter02",
    kind: "dex",
  },
  "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e": {
    label: "Uniswap SwapRouter02 (Sepolia)",
    kind: "dex",
  },
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": {
    label: "Uniswap V2 Router02",
    kind: "dex",
  },
  "0x000000000022d473030f116ddee9f6b43ac78ba3": {
    label: "Permit2 (Uniswap)",
    kind: "permit2",
  },
  // Aggregator
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": {
    label: "LI.FI Diamond",
    kind: "bridge",
  },
  "0x111111125421ca6dc452d289314280a0f8842a65": {
    label: "1inch AggregationRouterV6",
    kind: "dex",
  },
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": {
    label: "0x Exchange Proxy",
    kind: "dex",
  },
  // DEX theo chain
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": {
    label: "SushiSwap Router",
    kind: "dex",
  },
  "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": {
    label: "SushiSwap Router (Arbitrum)",
    kind: "dex",
  },
  "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff": {
    label: "QuickSwap Router",
    kind: "dex",
  },
  "0x10ed43c718714eb63d5aa57b78b54704e256024e": {
    label: "PancakeSwap Router",
    kind: "dex",
  },
};

export function describeSpender(spender: Address): SpenderInfo | null {
  return KNOWN_SPENDERS[spender.toLowerCase()] ?? null;
}

/**
 * Danh sách spender để dò trực tiếp bằng `allowance()` mà không cần API log.
 * Đây là lưới an toàn cho hai trường hợp: chain không được Etherscan free tier
 * hỗ trợ (BSC), và log scan bị cắt bớt. Đọc thêm vài chục slot qua multicall
 * gần như miễn phí, còn bỏ sót một allowance đang mở thì không.
 */
export const PROBE_SPENDERS = Object.keys(KNOWN_SPENDERS) as Address[];
