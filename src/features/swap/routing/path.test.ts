import { describe, expect, it } from "vitest";
import { encodePath, buildCandidates, cumulativeLpFeePct, describeCandidate } from "./path";
import type { Address } from "viem";
import type { RouteToken } from "./path";

/**
 * Path packed của Uniswap V3 là thứ dễ sai nhất trong cả engine: sai một byte
 * là Quoter revert và route bị loại IM LẶNG (aggregate3 dùng allowFailure), nên
 * bug hiện ra dưới dạng "không có thanh khoản" chứ không phải lỗi. Test ở đây
 * khoá lại đúng độ dài và đúng thứ tự byte.
 */

const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address;

const t = (address: Address, symbol: string, decimals: number): RouteToken => ({
  address,
  symbol,
  decimals,
});

describe("encodePath", () => {
  it("1 hop: 20 byte token + 3 byte fee + 20 byte token = 43 byte", () => {
    const path = encodePath([WETH, USDC], [3000]);
    // 2 ký tự hex / byte, cộng "0x".
    expect(path.length).toBe(2 + 43 * 2);
    expect(path.toLowerCase()).toBe(
      `0x${WETH.slice(2)}000bb8${USDC.slice(2)}`.toLowerCase(),
    );
  });

  it("fee được pad đủ 3 byte, kể cả fee tier nhỏ nhất (100 = 0x000064)", () => {
    const path = encodePath([WETH, USDC], [100]);
    expect(path.slice(42, 48)).toBe("000064");
  });

  it("2 hop: 66 byte và giữ nguyên thứ tự token/fee", () => {
    const path = encodePath([USDC, WETH, UNI], [500, 3000]);
    expect(path.length).toBe(2 + 66 * 2);
    expect(path.toLowerCase()).toBe(
      `0x${USDC.slice(2)}0001f4${WETH.slice(2)}000bb8${UNI.slice(2)}`.toLowerCase(),
    );
  });

  it("từ chối khi số fee không khớp số token", () => {
    // Không throw ở đây thì lỗi trôi xuống tận Quoter, nơi nó chỉ hiện ra là
    // "route không có thanh khoản".
    expect(() => encodePath([WETH, USDC], [500, 3000])).toThrow();
    expect(() => encodePath([WETH, USDC, UNI], [500])).toThrow();
  });
});

describe("buildCandidates", () => {
  const tokenIn = t(USDC, "USDC", 6);
  const tokenOut = t(UNI, "UNI", 18);
  const connectors = [t(WETH, "WETH", 18), t(USDC, "USDC", 6)];

  it("sinh 4 route 1-hop + 16 route 2-hop cho mỗi connector dùng được", () => {
    const c = buildCandidates(tokenIn, tokenOut, connectors);
    // USDC bị loại vì trùng tokenIn -> chỉ WETH làm trung gian: 4 + 4*4 = 20.
    expect(c.length).toBe(20);
    expect(c.filter((x) => x.fees.length === 1).length).toBe(4);
    expect(c.filter((x) => x.fees.length === 2).length).toBe(16);
  });

  it("không dùng token trung gian trùng với tokenIn hoặc tokenOut", () => {
    // Route A -> A -> B không tồn tại pool; để lọt vào thì tốn quote vô ích.
    const c = buildCandidates(tokenIn, tokenOut, connectors);
    for (const cand of c.filter((x) => x.tokens.length === 3)) {
      expect(cand.tokens[1].address.toLowerCase()).not.toBe(USDC.toLowerCase());
      expect(cand.tokens[1].address.toLowerCase()).not.toBe(UNI.toLowerCase());
    }
  });

  it("maxHops = 1 chỉ trả route trực tiếp", () => {
    const c = buildCandidates(tokenIn, tokenOut, connectors, 1);
    expect(c.length).toBe(4);
    expect(c.every((x) => x.tokens.length === 2)).toBe(true);
  });

  it("mọi candidate đều encode được (số token = số fee + 1)", () => {
    for (const cand of buildCandidates(tokenIn, tokenOut, connectors)) {
      expect(cand.tokens.length).toBe(cand.fees.length + 1);
      expect(() =>
        encodePath(
          cand.tokens.map((x) => x.address),
          cand.fees,
        ),
      ).not.toThrow();
    }
  });
});

describe("cumulativeLpFeePct", () => {
  it("1 hop trả về đúng fee tier", () => {
    expect(cumulativeLpFeePct([3000])).toBeCloseTo(0.3, 10);
    expect(cumulativeLpFeePct([500])).toBeCloseTo(0.05, 10);
  });

  it("nhiều hop là cộng dồn theo tích (1-f), không phải cộng thẳng", () => {
    // 0.3% + 0.3% = 0.6% nếu cộng thẳng; thực tế 1 - 0.997^2 = 0.5991%.
    expect(cumulativeLpFeePct([3000, 3000])).toBeCloseTo(0.5991, 6);
    expect(cumulativeLpFeePct([3000, 3000])).toBeLessThan(0.6);
  });

  it("route rỗng không mất phí", () => {
    expect(cumulativeLpFeePct([])).toBe(0);
  });
});

describe("describeCandidate", () => {
  it("ghép symbol theo đúng chiều swap", () => {
    expect(
      describeCandidate({
        tokens: [t(USDC, "USDC", 6), t(WETH, "WETH", 18), t(UNI, "UNI", 18)],
        fees: [500, 3000],
      }),
    ).toBe("USDC → WETH → UNI");
  });
});
