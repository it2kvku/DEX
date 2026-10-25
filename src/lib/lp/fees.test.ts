import { describe, expect, it } from "vitest";
import {
  isqrt,
  sqrtPriceX96AtTick,
  unclaimedFees,
  withdrawAmounts,
} from "./fees";

/**
 * Đối chiếu công thức chính thức của Uniswap V3:
 *  - sqrtPriceX96AtTick khớp TickMath.getSqrtRatioAtTick (giá trị thật của
 *    protocol ở vài tick chuẩn, lấy từ Uniswap v3-core test).
 *  - unclaimedFees: dựng kịch bản growth thủ công, số quen thuộc.
 *  - withdrawAmounts: bảo toàn tổng khi cộng dồn (amounts × price ~ L).
 */

describe("sqrtPriceX96AtTick", () => {
  it("tick 0 → 2^96 (giá 1)", () => {
    expect(sqrtPriceX96AtTick(0)).toBe(2n ** 96n);
  });

  it("khớp TickMath.getSqrtRatioAtTick của protocol tại tick chuẩn", () => {
    // Giá trị thật từ Uniswap v3-core TickMath test:
    expect(sqrtPriceX96AtTick(-887272)).toBe(4295128739n); // MIN_SQRT_RATIO
    expect(sqrtPriceX96AtTick(887272)).toBe(
      1461446703485210103287273052203988822378723970342n,
    ); // MAX_SQRT_RATIO
  });

  it("tick ±60: sqrt(P) × sqrt(P) ≈ P", () => {
    const a = sqrtPriceX96AtTick(60);
    const b = sqrtPriceX96AtTick(-60);
    // a×b ≈ 2^192 (P(60)×P(−60)=1) — sai số 1e-6 tương đối.
    // Protocol làm tròn LÊN (round-up) nên tích có thể vượt 2^192 một chút.
    expect(a * b).toBeGreaterThanOrEqual(2n ** 192n - (1n << 160n));
    expect(a * b).toBeLessThanOrEqual(2n ** 192n + (1n << 160n));
  });
});

describe("isqrt", () => {
  it("số chính phương và không chính phương (floor)", () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(9999n * 9999n)).toBe(9999n);
    expect(isqrt(9999n * 9999n + 1n)).toBe(9999n);
    expect(isqrt(10n ** 36n)).toBe(10n ** 18n);
  });
});

describe("unclaimedFees", () => {
  const Q128 = 2n ** 128n;
  const L = 10n ** 18n;

  it("growth tăng X (inside) → fee = L × X / 2^128", () => {
    const X = Q128 / 1000n; // growth tương ứng 1/1000 token per L
    const fees = unclaimedFees(
      {
        feeGrowthGlobal0X128: X,
        feeGrowthGlobal1X128: 0n,
        feeGrowthOutsideLower0X128: 0n,
        feeGrowthOutsideLower1X128: 0n,
        feeGrowthOutsideUpper0X128: 0n,
        feeGrowthOutsideUpper1X128: 0n,
      },
      {
        tickLower: -100,
        tickUpper: 100,
        liquidity: L,
        feeGrowthInside0LastX128: 0n,
        feeGrowthInside1LastX128: 0n,
      },
      0,
    );
    expect(fees.fees0).toBeGreaterThanOrEqual(L / 1000n - 1n);
    expect(fees.fees0).toBeLessThanOrEqual(L / 1000n);
    expect(fees.fees1).toBe(0n);
  });

  it("wrap-around 2^128: growth vượt Q128 vẫn tính đúng (modulo)", () => {
    const X = Q128 + Q128 / 1000n; // vượt 1 wrap → module còn Q128/1000
    const fees = unclaimedFees(
      {
        feeGrowthGlobal0X128: X,
        feeGrowthGlobal1X128: 0n,
        feeGrowthOutsideLower0X128: 0n,
        feeGrowthOutsideLower1X128: 0n,
        feeGrowthOutsideUpper0X128: 0n,
        feeGrowthOutsideUpper1X128: 0n,
      },
      {
        tickLower: -100,
        tickUpper: 100,
        liquidity: L,
        feeGrowthInside0LastX128: 0n,
        feeGrowthInside1LastX128: 0n,
      },
      0,
    );
    expect(fees.fees0).toBeGreaterThanOrEqual(L / 1000n - 1n);
    expect(fees.fees0).toBeLessThanOrEqual(L / 1000n);
  });

  it("tick dưới range: dùng outsideLower, không dùng outsideUpper", () => {
    const OL = Q128 / 500n;
    const fees = unclaimedFees(
      {
        feeGrowthGlobal0X128: OL * 2n,
        feeGrowthGlobal1X128: 0n,
        feeGrowthOutsideLower0X128: OL,
        feeGrowthOutsideLower1X128: 0n,
        feeGrowthOutsideUpper0X128: 0n,
        feeGrowthOutsideUpper1X128: 0n,
      },
      {
        tickLower: -100,
        tickUpper: 100,
        liquidity: L,
        feeGrowthInside0LastX128: 0n,
        feeGrowthInside1LastX128: 0n,
      },
      -200, // dưới range
    );
    // inside = global − outsideLower (vì current >= tickLower true) = OL
    expect(fees.fees0).toBeGreaterThanOrEqual(L / 500n - 1n);
    expect(fees.fees0).toBeLessThanOrEqual(L / 500n);
  });
});

describe("withdrawAmounts", () => {
  const L = 10n ** 18n;

  it("below range: toàn bộ token0, token1 = 0", () => {
    const { amount0, amount1 } = withdrawAmounts(-100, 100, -200, L);
    expect(amount0).toBeGreaterThan(0n);
    expect(amount1).toBe(0n);
  });

  it("above range: toàn bộ token1", () => {
    const { amount0, amount1 } = withdrawAmounts(-100, 100, 200, L);
    expect(amount0).toBe(0n);
    expect(amount1).toBeGreaterThan(0n);
  });

  it("in range: cả hai token dương", () => {
    const { amount0, amount1 } = withdrawAmounts(-100, 100, 0, L);
    expect(amount0).toBeGreaterThan(0n);
    expect(amount1).toBeGreaterThan(0n);
  });

  it("in range tại tick 0 với range đối xứng ±60: hai bên gần cân bằng theo giá 1", () => {
    // P=1, L=1e18: token1 = L×(1 − 1/1.006…) ≈ L×0.00598; token0 = L×0.00598×P
    const { amount0, amount1 } = withdrawAmounts(-60, 60, 0, L);
    const Q96 = 2n ** 96n;
    const expected = (L * (Q96 - sqrtPriceX96AtTick(-60))) / Q96;
    expect(amount1).toBe(expected);
    expect(amount0).toBeGreaterThan(expected * 9n / 10n);
    expect(amount0).toBeLessThan(expected * 11n / 10n);
  });

  it("full-range withdrawal (MIN→MAX tick) tại mọi tick hiện tại trả đủ L", () => {
    // Kiểm bất biến: below → amount0 = L/√Pl (−min), above → amount1 = L×√Pu
    const a = withdrawAmounts(-887272, 887272, -887273, L);
    expect(a.amount0).toBeGreaterThan(0n);
    const b = withdrawAmounts(-887272, 887272, 887273, L);
    expect(b.amount1).toBeGreaterThan(0n);
  });
});
