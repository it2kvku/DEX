/**
 * Toán tick Uniswap V3 cho hiển thị range LP — thuần, unit test được.
 *
 * Uniswap chia dải giá thành tick; mỗi tick tương ứng giá raw
 * price = 1.0001^tick (token1 trên 1 token0, tính trên đơn vị nhỏ nhất).
 * Hiển thị cho người dùng phải quy decimals: humanPrice = price_raw ×
 * 10^(decimals0 − decimals1).
 */

/** Giá raw (token1/token0) tại một tick — BigInt để không trôi số học. */
export function rawPriceAtTick(tick: number): bigint {
  // 1.0001^tick = e^(tick × ln 1.0001) — fixed-point 18 số lẻ.
  // Tick âm: e^-y = 1/e^y (series e^x chỉ hội tụ nhanh ở |x| nhỏ; MIN_TICK
  // cho |x| ≈ 88.7 nên tính e^|x| rồi chia).
  const SCALE = 10n ** 18n;
  const LN_1_0001_X18 = 99995000333083n; // ln(1.0001) × 1e18
  const x18 = BigInt(tick) * LN_1_0001_X18;
  const absX = x18 < 0n ? -x18 : x18;

  // e^|x|: series Σ |x|^k/k!, dừng khi term không còn đóng góp (|x| tối đa
  // trên V3 là ~88.7 nên 400 vòng là dư sức).
  let sum = SCALE;
  let term = SCALE;
  for (let k = 1n; k < 400n; k++) {
    term = (term * absX) / (k * SCALE);
    if (term === 0n) break;
    sum += term;
  }

  if (x18 >= 0n) return sum;
  // e^-y: chia dài có làm tròn — SCALE²/y giữ SCALE ở tử để 18 số lẻ.
  // Giá trị dưới độ phân giải fixed-point (MIN_TICK ~ e^-88.7 << 1e-18)
  // kẹp về 1 — đơn vị nhỏ nhất, hiển thị "~0" đúng ngữ nghĩa.
  const inv = (SCALE * SCALE + sum / 2n) / sum;
  return inv > 0n ? inv : 1n;
}

/** Giá human (token1 trên 1 token0) tại một tick, hiệu chỉnh decimals. */
export function priceAtTick(
  tick: number,
  decimals0: number,
  decimals1: number,
): number {
  const raw = rawPriceAtTick(tick);
  // human = raw × 10^(dec0 − dec1). dec0 > dec1: nhân; ngược lại: chia.
  const diff = decimals0 - decimals1;
  const num = Number(raw) / 1e18;
  return num * 10 ** diff;
}

/** Trạng thái position so với tick hiện tại của pool. */
export function rangeStatus(
  tickLower: number,
  tickUpper: number,
  currentTick: number,
): "in-range" | "below" | "above" {
  if (currentTick < tickLower) return "below";
  if (currentTick > tickUpper) return "above";
  return "in-range";
}
