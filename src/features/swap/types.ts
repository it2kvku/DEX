import type { Address, Hex } from "viem";

/**
 * Hợp đồng dữ liệu chung của tầng quote — mọi nguồn (LI.FI aggregator hoặc
 * routing engine Uniswap V3 tự viết) đều trả về đúng shape này, nên UI
 * không cần phân nhánh theo chain.
 */

/** Quy ước địa chỉ native token (ETH/BNB/POL). */
export const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

/** Một chặng (hop) trong route: đổi tokenIn -> tokenOut qua một pool. */
export interface RouteHop {
  /** Tên DEX/pool thực thi hop (vd "Uniswap V3", "OKX Dex Aggregator"). */
  dex: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  /** Fee tier theo phần triệu (3000 = 0.30%); null nếu nguồn không tiết lộ. */
  feePpm: number | null;
  /** Địa chỉ pool nếu biết được. */
  pool?: Address;
}

/** Route đã chọn + bối cảnh để UI giải thích "vì sao route này". */
export interface RoutePlan {
  hops: RouteHop[];
  /** Số route ứng viên đã chấm điểm (0 nếu aggregator không tiết lộ). */
  candidatesEvaluated: number;
  /** Nguồn dựng route. */
  source: "uniswap-v3" | "aggregator";
}

/**
 * Các sub-call bên trong `multicall` của engine nội bộ, giữ lại để dựng lại
 * calldata khi cần chèn `selfPermit` vào cùng giao dịch (permit + swap 1 tx).
 * null với aggregator vì calldata do bên thứ ba sinh, không tách được.
 */
export interface SwapPlan {
  /** Deadline đã nhúng trong calldata. */
  deadline: bigint;
  /** Sub-call của multicall: exactInput [+ unwrapWETH9]. */
  calls: Hex[];
  /** Router có `selfPermit` -> gộp được permit vào chính tx swap. */
  supportsSelfPermit: boolean;
}

export interface SwapQuote {
  /** Tên DEX/tool thực thi route (vd "okx", "Uniswap V3"). */
  tool: string;
  toAmount: string;
  toAmountMin: string;
  /** Spender để approve ERC-20 (router sẽ pull token). */
  approvalAddress: Address;
  fromAmountUsd: number;
  toAmountUsd: number;
  gasUsd: number;
  /**
   * Price impact thật (%) — độ lệch giữa giá thực thi và mid price của pool,
   * ĐÃ trừ phí LP. null khi không tính được (aggregator không cho mid price).
   */
  priceImpactPct: number | null;
  /** Tổng phí LP/DEX của route (%). null nếu nguồn không tiết lộ fee tier. */
  lpFeePct: number | null;
  /** Tỷ giá mid (spot, chưa gồm phí & impact): tokenOut trên 1 tokenIn. */
  midRate: number | null;
  /** Route để hiển thị; null nếu nguồn không tiết lộ. */
  route: RoutePlan | null;
  /** Chi tiết calldata để chèn permit; null nếu nguồn không cho phép. */
  plan: SwapPlan | null;
  txRequest: {
    to: Address;
    data: Hex;
    value: bigint;
    gasLimit: bigint | null;
  };
}
