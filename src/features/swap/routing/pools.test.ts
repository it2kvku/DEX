import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  computePoolAddress,
  midRateFromSqrtPrice,
  sortTokens,
  FEE_TIERS,
} from "./pools";

/**
 * Hai hàm trong file này là nền của cả routing engine, và cả hai đều thuộc loại
 * "sai âm thầm": địa chỉ pool tính lệch thì `slot0` revert và route bị bỏ như
 * thể pool không có thanh khoản; mid price lệch thì price impact hiển thị sai mà
 * không có gì báo lỗi. Nên giá trị mong đợi ở đây KHÔNG phải tự bịa — đều đã
 * đối chiếu on-chain trên Sepolia:
 *
 *   - Địa chỉ pool: so với `UniswapV3Factory.getPool` cho 6 pool (4 fee tier của
 *     WETH/USDC + WETH/UNI + USDC/UNI) — khớp 6/6.
 *   - sqrtPriceX96 = 496673595936264413521926321327836 là `slot0()` thật của pool
 *     WETH/USDC fee 3000 (0x6Ce0896e…9b50) lúc viết test.
 */

const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address;

const Q96 = 2n ** 96n;

describe("sortTokens", () => {
  it("sắp theo địa chỉ tăng dần, không phụ thuộc thứ tự truyền vào", () => {
    expect(sortTokens(WETH, USDC)).toEqual([USDC, WETH]);
    expect(sortTokens(USDC, WETH)).toEqual([USDC, WETH]);
  });

  it("so sánh không phân biệt chữ hoa/thường (checksum vs lowercase)", () => {
    const [a] = sortTokens(WETH.toLowerCase() as Address, USDC);
    expect(a.toLowerCase()).toBe(USDC.toLowerCase());
  });
});

describe("computePoolAddress", () => {
  /** Kết quả `Factory.getPool` thật trên Sepolia. */
  const KNOWN: [Address, Address, number, Address][] = [
    [WETH, USDC, 3000, "0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50" as Address],
    [WETH, USDC, 500, "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1" as Address],
    [WETH, USDC, 100, "0xFeEd501c2B21D315F04946F85fC6416B640240b5" as Address],
    [WETH, USDC, 10000, "0x6418EEC70f50913ff0d756B48d32Ce7C02b47C47" as Address],
    [WETH, UNI, 3000, "0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7" as Address],
    [USDC, UNI, 3000, "0x349492f65C8B27efEF83456189b85D0Fa32afCcd" as Address],
  ];

  it.each(KNOWN)(
    "khớp Factory.getPool cho fee %#",
    (a, b, fee, expected) => {
      expect(computePoolAddress(a, b, fee)).toBe(expected);
    },
  );

  it("thứ tự token không ảnh hưởng kết quả", () => {
    for (const fee of FEE_TIERS) {
      expect(computePoolAddress(WETH, USDC, fee)).toBe(
        computePoolAddress(USDC, WETH, fee),
      );
    }
  });

  it("mỗi fee tier là một pool khác nhau", () => {
    const addrs = FEE_TIERS.map((f) => computePoolAddress(WETH, USDC, f));
    expect(new Set(addrs).size).toBe(FEE_TIERS.length);
  });
});

describe("midRateFromSqrtPrice", () => {
  it("sqrtPriceX96 = 2^96 nghĩa là giá raw = 1", () => {
    expect(midRateFromSqrtPrice(Q96, USDC, WETH, 18, 18)).toBeCloseTo(1, 12);
  });

  it("bình phương sqrt: sqrtP gấp đôi -> giá gấp 4 theo chiều token0->token1", () => {
    // token0 = USDC (địa chỉ nhỏ hơn WETH).
    expect(midRateFromSqrtPrice(2n * Q96, USDC, WETH, 18, 18)).toBeCloseTo(4, 12);
  });

  it("đảo chiều swap là nghịch đảo tỷ giá", () => {
    const fwd = midRateFromSqrtPrice(2n * Q96, USDC, WETH, 18, 18);
    const rev = midRateFromSqrtPrice(2n * Q96, WETH, USDC, 18, 18);
    expect(fwd * rev).toBeCloseTo(1, 12);
  });

  it("bù chênh lệch decimals (6 vs 18) đúng cả hai chiều", () => {
    // Giá raw = 1 nhưng 1 USDC (6 dec) = 10^12 lần đơn vị nhỏ hơn WETH (18 dec).
    expect(midRateFromSqrtPrice(Q96, USDC, WETH, 6, 18)).toBeCloseTo(1e-12, 24);
    expect(midRateFromSqrtPrice(Q96, WETH, USDC, 18, 6)).toBeCloseTo(1e12, 0);
  });

  it("khớp slot0 thật của pool WETH/USDC 0.3% trên Sepolia", () => {
    const sqrtP = 496673595936264413521926321327836n;
    // token0 = USDC(6), token1 = WETH(18).
    const usdcToWeth = midRateFromSqrtPrice(sqrtP, USDC, WETH, 6, 18);
    const wethToUsdc = midRateFromSqrtPrice(sqrtP, WETH, USDC, 18, 6);
    expect(usdcToWeth).toBeCloseTo(0.000039299133788065, 18);
    expect(wethToUsdc).toBeCloseTo(25445.853473332336, 6);
    // Hai chiều phải là nghịch đảo của nhau — nếu không thì đã có lỗi decimals.
    expect(usdcToWeth * wethToUsdc).toBeCloseTo(1, 9);
  });

  it("pool chưa khởi tạo (sqrtPriceX96 = 0) trả 0 chứ không NaN/Infinity", () => {
    // Trả NaN thì phép nhân mid của route 2-hop lây NaN và price impact hiển
    // thị "NaN%"; trả 0 để nhánh `mid <= 0` bỏ qua route.
    expect(midRateFromSqrtPrice(0n, USDC, WETH, 6, 18)).toBe(0);
    expect(midRateFromSqrtPrice(-1n, USDC, WETH, 6, 18)).toBe(0);
  });
});
