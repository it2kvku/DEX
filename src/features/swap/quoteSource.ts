import type { QuoteComparison, SwapQuote } from "./types";

/**
 * Chọn nguồn quote tốt hơn giữa engine nội bộ (Uniswap V3) và aggregator
 * (LI.FI) cho cùng một lệnh swap.
 *
 * Đây là điểm khiến app hành xử như một aggregator thật: không tin tưởng engine
 * của mình một cách mù quáng — mainnet có những cặp mà route V2/DEX khác của
 * aggregator tốt hơn, và ngược lại aggregator không thấy được fee tier V3 mỏng
 * mà engine dò được. So sánh cùng một cơ số:
 *
 *   netUsd = toAmountUsd − gasUsd   (nhận về bao nhiêu USD sau khi trừ gas)
 *
 * Khi một trong hai nguồn thiếu giá USD (DefiLlama không có token, testnet),
 * rơi về so sánh toAmount thô — cùng cặp token nên đơn vị so sánh vẫn nhất quán.
 *
 * Hòa hoặc không phân biệt được: chọn ENGINE — vì nó hỗ trợ selfPermit (1 tx
 * thay vì 2), price impact thật, và không phụ thuộc bên thứ ba.
 */

/** Net output quy USD; null khi nguồn không có giá để quy đổi. */
function netUsd(q: SwapQuote): number | null {
  if (q.toAmountUsd > 0) return q.toAmountUsd - q.gasUsd;
  return null;
}

/** Trả về quote thắng, đã gắn `comparison` để UI hiển thị lý do chọn. */
export function pickBestQuote(
  engine: SwapQuote | null,
  aggregator: SwapQuote | null,
): SwapQuote {
  if (!engine && !aggregator) {
    throw new Error(
      "Không tìm được route cho cặp token này từ engine lẫn aggregator.",
    );
  }
  if (!engine) return aggregator!;
  if (!aggregator) return engine;

  const eNet = netUsd(engine);
  const aNet = netUsd(aggregator);

  let engineWins: boolean;
  let advantagePct: number | null;

  if (eNet !== null && aNet !== null) {
    // Cả hai có USD: so net output — đã tính gas, so sánh "best execution".
    engineWins = eNet >= aNet;
    advantagePct =
      aNet > 0 ? (Math.abs(eNet - aNet) / Math.min(eNet, aNet)) * 100 : null;
  } else {
    // Thiếu giá: so toAmount thô (cùng tokenOut nên cùng đơn vị).
    const e = BigInt(engine.toAmount);
    const a = BigInt(aggregator.toAmount);
    engineWins = e >= a;
    advantagePct = a > 0n ? Number(((e - a) * 10_000n) / a) / 100 : null;
  }

  const winner = engineWins ? engine : aggregator;
  return {
    ...winner,
    comparison: makeComparison(eNet, aNet, engineWins, advantagePct),
  };
}

function makeComparison(
  engineUsd: number | null,
  aggregatorUsd: number | null,
  engineWins: boolean,
  advantagePct: number | null,
): QuoteComparison {
  return {
    engineUsd,
    aggregatorUsd,
    chosen: engineWins ? "engine" : "aggregator",
    advantagePct,
  };
}
