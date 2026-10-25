import { describe, expect, it } from "vitest";
import { priceAtTick, rangeStatus, rawPriceAtTick } from "./range";

/**
 * Tick → price là toán nền của hiển thị range LP. Sai ở đây là sai số người
 * dùng nhìn thấy ngay (range hiển thị lệch so với Uniswap). Giá trị chuẩn đối
 * chiếu với Uniswap interface cho pool USDC/WETH.
 */

describe("rawPriceAtTick", () => {
  it("tick 0 = 1.0 chính xác", () => {
    expect(rawPriceAtTick(0)).toBe(10n ** 18n);
  });

  it("tick ±60 (một tick spacing 0.01% x60) ~ 1.006", () => {
    // 1.0001^60 ≈ 1.0060158…
    const up = Number(rawPriceAtTick(60)) / 1e18;
    const down = Number(rawPriceAtTick(-60)) / 1e18;
    expect(up).toBeCloseTo(1.0060158, 5);
    expect(down).toBeCloseTo(1 / 1.0060158, 5);
    // Hai chiều là nghịch đảo.
    expect(up * down).toBeCloseTo(1, 6);
  });

  it("tick lớn (2000) khớp 1.0001^2000", () => {
    expect(Number(rawPriceAtTick(2000)) / 1e18).toBeCloseTo(
      Math.pow(1.0001, 2000),
      6,
    );
  });

  it("tick âm lớn: dương và kẹp tại sàn fixed-point (1e-18 — hiển thị ~0)", () => {
    const p = Number(rawPriceAtTick(-887272)) / 1e18; // MIN_TICK
    // e^-88.7 ≈ 3e-39 dưới độ phân giải 1e-18 — rawPriceAtTick kẹp về 1n
    // (xem range.ts) đúng ngữ nghĩa "gần bằng 0" cho hiển thị range.
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1e-17);
  });
});

describe("priceAtTick — hiệu chỉnh decimals", () => {
  it("USDC(6)/WETH(18): tick 0 → human price = 1e-12 WETH per USDC", () => {
    // raw=1, human = 1 × 10^(6−18) = 1e-12
    expect(priceAtTick(0, 6, 18)).toBeCloseTo(1e-12, 30);
  });

  it("WETH(18)/USDC(6): tick 2000 → raw × 10^(18−6) USDC per WETH", () => {
    expect(priceAtTick(2000, 18, 6)).toBeCloseTo(Math.pow(1.0001, 2000) * 1e12, -2);
  });

  it("cùng decimals (18/18): human = raw", () => {
    expect(priceAtTick(60, 18, 18)).toBeCloseTo(1.0060158, 5);
  });
});

describe("rangeStatus", () => {
  it("in-range khi tick hiện tại nằm giữa lower/upper", () => {
    expect(rangeStatus(-100, 100, 0)).toBe("in-range");
    expect(rangeStatus(-100, 100, -100)).toBe("in-range");
    expect(rangeStatus(-100, 100, 100)).toBe("in-range");
  });

  it("below/above khi giá chạy khỏi range", () => {
    expect(rangeStatus(-100, 100, -101)).toBe("below");
    expect(rangeStatus(-100, 100, 101)).toBe("above");
  });
});
