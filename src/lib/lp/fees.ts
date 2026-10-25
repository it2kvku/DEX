import { rawPriceAtTick } from "./range";

/**
 * Toán LP Uniswap V3 — phí tích lũy và lượng token trong position. Thuần,
 * BigInt, unit test đối chiếu công thức chính thức của protocol.
 *
 * Nguồn công thức: UniswapV3Pool.sol (feeGrowthInside) & whitepaper §6.4
 * (amounts từ liquidity).
 */

const Q96 = 2n ** 96n;
const Q128 = 2n ** 128n;

export interface PoolFeeGrowth {
  feeGrowthGlobal0X128: bigint;
  feeGrowthGlobal1X128: bigint;
  /** feeGrowthOutside tại mép range. */
  feeGrowthOutsideLower0X128: bigint;
  feeGrowthOutsideLower1X128: bigint;
  feeGrowthOutsideUpper0X128: bigint;
  feeGrowthOutsideUpper1X128: bigint;
}

export interface PositionFeeLast {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
}

/**
 * Fee tích lũy CHƯA THU HỒI của position (raw token units), công thức
 * UniswapV3Pool._updateFee:
 *
 *   feeGrowthInside = feeGrowthGlobal
 *     − (tickCurrent >= tickLower ? outsideLower : 0)
 *     − (tickCurrent >= tickUpper ? outsideUpper : 0)
 *     − position.feeGrowthInsideLast
 *   fees = liquidity × feeGrowthInside / 2^128
 *
 * U128 overflow wrap-around (cộng đồng số 2^128): growth counters là uint256
 * nhưng protocol tính trên modulo 2^128 — làm tròn BigInt đầy đủ.
 */
export function unclaimedFees(
  pool: PoolFeeGrowth,
  pos: PositionFeeLast,
  currentTick: number,
): { fees0: bigint; fees1: bigint } {
  // Công thức UniswapV3Pool.sol: trừ outsideLower khi giá DƯỚI range,
  // outsideUpper khi giá TRÊN range (>= tickUpper).
  const below = currentTick < pos.tickLower;
  const above = currentTick >= pos.tickUpper;

  const inside0 =
    wrap128(pool.feeGrowthGlobal0X128) -
    (below ? wrap128(pool.feeGrowthOutsideLower0X128) : 0n) -
    (above ? wrap128(pool.feeGrowthOutsideUpper0X128) : 0n) -
    wrap128(pos.feeGrowthInside0LastX128);
  const inside1 =
    wrap128(pool.feeGrowthGlobal1X128) -
    (below ? wrap128(pool.feeGrowthOutsideLower1X128) : 0n) -
    (above ? wrap128(pool.feeGrowthOutsideUpper1X128) : 0n) -
    wrap128(pos.feeGrowthInside1LastX128);

  return {
    fees0: (pos.liquidity * wrap128(inside0)) / Q128,
    fees1: (pos.liquidity * wrap128(inside1)) / Q128,
  };
}

function wrap128(x: bigint): bigint {
  // Modulo 2^128 — growth counters wrap theo chuẩn protocol.
  return ((x % Q128) + Q128) % Q128;
}

/**
 * sqrt(1.0001^tick) × 2^96 — PORT THUẦN CHỮA của TickMath.getSqrtRatioAtTick
 * từ Uniswap v3-core (nguồn sự thật của protocol). Chuỗi hằng số magic nhân
 * theo từng bit của |tick| — chính xác tuyệt đối ở MỌI tick kể cả MIN/MAX
 * (position full-range rất phổ biến), và known-answer test khoá 2 giá trị
 * biên lấy từ chính test suite của v3-core: MIN_SQRT_RATIO = 4295128739,
 * MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342.
 */
export function sqrtPriceX96AtTick(tick: number): bigint {
  const absTick = BigInt(Math.abs(tick));

  let ratio =
    absTick & 0x1n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  const mul = (hex: bigint) => {
    ratio = (ratio * hex) >> 128n;
  };
  if (absTick & 0x2n) mul(0xfff97272373d413259a46990580e213an);
  if (absTick & 0x4n) mul(0xfff2e50f5f656932ef12357cf3c7fdccn);
  if (absTick & 0x8n) mul(0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if (absTick & 0x10n) mul(0xffcb9843d60f6159c9db58835c926644n);
  if (absTick & 0x20n) mul(0xff973b41fa98c081472e6896dfb254c0n);
  if (absTick & 0x40n) mul(0xff2ea16466c96a3843ec78b326b52861n);
  if (absTick & 0x80n) mul(0xfe5dee046a99a2a811c461f1969c3053n);
  if (absTick & 0x100n) mul(0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if (absTick & 0x200n) mul(0xf987a7253ac413176f2b074cf7815e54n);
  if (absTick & 0x400n) mul(0xf3392b0822b70005940c7a398e4b70f3n);
  if (absTick & 0x800n) mul(0xe7159475a2c29b7443b29c7fa6e889d9n);
  if (absTick & 0x1000n) mul(0xd097f3bdfd2022b8845ad8f792aa5825n);
  if (absTick & 0x2000n) mul(0xa9f746462d870fdf8a65dc1f90e061e5n);
  if (absTick & 0x4000n) mul(0x70d869a156d2a1b890bb3df62baf32f7n);
  if (absTick & 0x8000n) mul(0x31be135f97d08fd981231505542fcfa6n);
  if (absTick & 0x10000n) mul(0x9aa508b5b7a84e1c677de54f3e99bc9n);
  if (absTick & 0x20000n) mul(0x5d6af8dedb81196699c329225ee604n);
  if (absTick & 0x40000n) mul(0x2216e584f5fa1ea926041bedfe98n);
  if (absTick & 0x80000n) mul(0x48a170391f7dc42444e8fa2n);

  // Tick dương: nghịch đảo trên 2^256−1 (đúng v3-core); ratio ở Q128.128 →
  // dịch >>32 sang Q128.96 VỚI LÀM TRÒN LÊN (đúng chữ ký của protocol —
  // known-answer test MIN/MAX_SQRT_RATIO khoá hành vi này).
  const MAX_256 = (1n << 256n) - 1n;
  const scaled = tick > 0 ? MAX_256 / ratio : ratio;
  return (scaled >> 32n) + (scaled % (1n << 32n) === 0n ? 0n : 1n);
}

/** Integer sqrt Newton — floor(sqrt(n)). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt: số âm");
  if (n < 2n) return n;
  let x = 1n << (BigInt(n.toString(2).length + 1) / 2n);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/**
 * Lượng token nhận khi rút `liquidity` tại trạng thái pool hiện tại.
 * Whitepaper §6.4:
 *   below range: toàn bộ token0 = L × (1/√Pl − 1/√Pu)
 *   above range: toàn bộ token1 = L × (√Pu − √Pl)
 *   in range:    token0 = L × (1/√Pc − 1/√Pu); token1 = L × (√Pc − √Pl)
 * (√X là sqrtPriceX96 của tick tương ứng; floor như protocol.)
 */
export function withdrawAmounts(
  tickLower: number,
  tickUpper: number,
  currentTick: number,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  const sl = sqrtPriceX96AtTick(tickLower);
  const su = sqrtPriceX96AtTick(tickUpper);

  if (currentTick < tickLower) {
    return {
      amount0: (liquidity * Q96 * (su - sl)) / (sl * su),
      amount1: 0n,
    };
  }
  if (currentTick > tickUpper) {
    return {
      amount0: 0n,
      amount1: (liquidity * (su - sl)) / Q96,
    };
  }
  const sc = sqrtPriceX96AtTick(currentTick);
  return {
    amount0: (liquidity * Q96 * (su - sc)) / (sc * su),
    amount1: (liquidity * (sc - sl)) / Q96,
  };
}
