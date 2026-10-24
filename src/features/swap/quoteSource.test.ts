import { describe, expect, it } from "vitest";
import { pickBestQuote } from "./quoteSource";
import type { SwapQuote } from "./types";

/**
 * `pickBestQuote` quyết định TIỀN thật đi qua route nào — engine tự viết hay
 * aggregator. Sai ở đây là sai về best-execution âm thầm (luôn chọn một bên
 * dù bên kia tốt hơn), nên mọi quy tắc chọn đều phải khóa bằng test:
 *
 *   1. Có USD: so NET output (đã trừ gas), không phải toAmount thô —
 *      route output cao hơn nhưng gas đắt hơn vẫn phải thua.
 *   2. Thiếu USD: rơi về toAmount thô (cùng tokenOut nên cùng đơn vị).
 *   3. Hòa hoặc không phân biệt được: chọn ENGINE (selfPermit, price impact
 *      thật, không phụ thuộc bên thứ ba).
 *   4. Một bên chết: dùng bên còn lại, không gắn comparison.
 *   5. Hai bên chết: throw để React Query vào trạng thái error như cũ.
 *
 * Lưu ý: hàm trả về BẢN SAO của quote thắng (để gắn comparison) nên test
 * định danh bên thắng qua approvalAddress (engine và aggregator khác router),
 * không dùng so sánh identity.
 */

const ENGINE_ROUTER = "0x0000000000000000000000000000000000000001";
const AGGREGATOR_ROUTER = "0x0000000000000000000000000000000000000002";

const BASE: SwapQuote = {
  tool: "Uniswap V3 · 1 hop",
  toAmount: "1000",
  toAmountMin: "995",
  approvalAddress: ENGINE_ROUTER,
  fromAmountUsd: 1000,
  toAmountUsd: 1000,
  gasUsd: 5,
  priceImpactPct: 0.1,
  lpFeePct: 0.3,
  midRate: 1,
  route: null,
  plan: null,
  txRequest: {
    to: ENGINE_ROUTER,
    data: "0x",
    value: 0n,
    gasLimit: 200_000n,
  },
};

const engineQuote = (o: Partial<SwapQuote> = {}): SwapQuote => ({
  ...BASE,
  ...o,
});

const aggregatorQuote = (o: Partial<SwapQuote> = {}): SwapQuote => ({
  ...BASE,
  approvalAddress: AGGREGATOR_ROUTER,
  txRequest: { ...BASE.txRequest, to: AGGREGATOR_ROUTER },
  ...o,
});

/** Nhận diện quote nào thắng qua spender — engine và aggregator khác router. */
const winnerOf = (q: SwapQuote) =>
  q.approvalAddress === ENGINE_ROUTER ? "engine" : "aggregator";

describe("pickBestQuote — so sánh theo net USD", () => {
  it("engine thắng khi net output cao hơn (dù toAmount thua)", () => {
    const pick = pickBestQuote(
      engineQuote({ toAmountUsd: 1000, gasUsd: 3 }), // net 997
      aggregatorQuote({ toAmountUsd: 1001, gasUsd: 10 }), // net 991
    );
    expect(winnerOf(pick)).toBe("engine");
    expect(pick.comparison?.chosen).toBe("engine");
  });

  it("aggregator thắng khi net output cao hơn rõ ràng", () => {
    const pick = pickBestQuote(
      engineQuote({ toAmountUsd: 1000, gasUsd: 8 }), // net 992
      aggregatorQuote({ toAmountUsd: 1010, gasUsd: 5 }), // net 1005
    );
    expect(winnerOf(pick)).toBe("aggregator");
    expect(pick.comparison?.chosen).toBe("aggregator");
    expect(pick.comparison?.advantagePct).toBeGreaterThan(1);
  });

  it("hòa tuyệt đối thì chọn engine (selfPermit + không phụ thuộc bên thứ ba)", () => {
    const pick = pickBestQuote(engineQuote(), aggregatorQuote());
    expect(winnerOf(pick)).toBe("engine");
    expect(pick.comparison?.advantagePct).toBe(0);
  });

  it("lợi thế tính trên số NHỎ hơn (phần trăm so với bên thua)", () => {
    // engine 1010, aggregator 1000 -> lợi thế 1% so với 1000, không phải 0.99%.
    const pick = pickBestQuote(
      engineQuote({ toAmountUsd: 1010, gasUsd: 0 }),
      aggregatorQuote({ toAmountUsd: 1000, gasUsd: 0 }),
    );
    expect(pick.comparison?.advantagePct).toBeCloseTo(1, 6);
  });
});

describe("pickBestQuote — thiếu giá USD", () => {
  it("rơi về so toAmount thô khi một bên không có giá", () => {
    const pick = pickBestQuote(
      engineQuote({ toAmountUsd: 0, gasUsd: 0, toAmount: "900" }),
      aggregatorQuote({ toAmountUsd: 1000, gasUsd: 5, toAmount: "1000" }),
    );
    // engine không có USD -> không thể so netUsd; so toAmount thô: 900 < 1000.
    expect(winnerOf(pick)).toBe("aggregator");
    expect(pick.comparison?.engineUsd).toBeNull();
    expect(pick.comparison?.aggregatorUsd).toBe(995);
  });

  it("hai bên cùng thiếu giá: vẫn chọn được bằng toAmount", () => {
    const pick = pickBestQuote(
      engineQuote({ toAmountUsd: 0, gasUsd: 0, toAmount: "1100" }),
      aggregatorQuote({ toAmountUsd: 0, gasUsd: 0, toAmount: "1000" }),
    );
    expect(winnerOf(pick)).toBe("engine");
  });
});

describe("pickBestQuote — một nguồn", () => {
  it("engine chết thì dùng aggregator, không gắn comparison", () => {
    const pick = pickBestQuote(null, aggregatorQuote());
    expect(winnerOf(pick)).toBe("aggregator");
    expect(pick.comparison).toBeUndefined();
  });

  it("aggregator chết (rate-limit) thì vẫn swap được bằng engine", () => {
    const pick = pickBestQuote(engineQuote(), null);
    expect(winnerOf(pick)).toBe("engine");
    expect(pick.comparison).toBeUndefined();
  });

  it("hai nguồn cùng chết: throw cho UI hiện 'Không có route'", () => {
    expect(() => pickBestQuote(null, null)).toThrow(/Không tìm được route/);
  });
});

describe("pickBestQuote — tính đúng đắn của quote trả về", () => {
  it("comparison gắn lên bản sao, quote gốc không bị đột biến", () => {
    const engine = engineQuote(); // net 995
    const aggregator = aggregatorQuote({ toAmountUsd: 990, gasUsd: 0 }); // net 990
    const pick = pickBestQuote(engine, aggregator);
    expect(pick.comparison).toBeDefined();
    expect(winnerOf(pick)).toBe("engine");
    expect(engine.comparison).toBeUndefined();
    // toAmount/gasLimit… của quote thắng phải nguyên vẹn để đem ký.
    expect(pick.toAmount).toBe(engine.toAmount);
    expect(pick.txRequest.gasLimit).toBe(engine.txRequest.gasLimit);
    expect(pick.txRequest.to).toBe(engine.txRequest.to);
  });
});
