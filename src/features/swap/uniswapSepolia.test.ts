import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { withSelfPermit, isSwapChainSupported, SEPOLIA_CHAIN_ID } from "./uniswapSepolia";
import type { SwapQuote } from "./types";

/**
 * `withSelfPermit` dựng lại calldata để permit và swap nằm trong CÙNG một tx.
 * Điểm chết người là THỨ TỰ: `selfPermit` phải là sub-call đầu tiên của
 * `multicall`, vì router phải tự cấp allowance cho mình trước khi `exactInput`
 * gọi `transferFrom`. Đảo lại thì tx revert `STF` sau khi người dùng đã ký và đã
 * trả gas — nên thứ tự đó được khoá bằng test chứ không chỉ bằng comment.
 */

const ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;

const multicallAbi = [
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

const selfPermitAbi = [
  {
    type: "function",
    name: "selfPermit",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const DEADLINE = 1_893_456_000n;
/** Sub-call giả lập `exactInput` — nội dung không quan trọng, chỉ cần nhận diện được. */
const SWAP_CALL = "0xdeadbeef" as Hex;

const permit = {
  token: USDC,
  value: 1_000_000n,
  deadline: DEADLINE,
  v: 27,
  r: "0xa7ae24ca2f84b9f7eb6cc4424a7df862af6dd4bb619953a9b3be0a1675293e10" as Hex,
  s: "0x289faf6e552987c5ec60021dbe49c9f469a7400980789f4aa72ad631bd8de96b" as Hex,
};

function makeQuote(overrides: Partial<SwapQuote> = {}): SwapQuote {
  const calls: Hex[] = [SWAP_CALL];
  return {
    tool: "Uniswap V3 · 1 hop",
    toAmount: "1000",
    toAmountMin: "995",
    approvalAddress: ROUTER,
    fromAmountUsd: 0,
    toAmountUsd: 0,
    gasUsd: 0,
    priceImpactPct: 0.1,
    lpFeePct: 0.3,
    midRate: 1,
    route: null,
    plan: { deadline: DEADLINE, calls, supportsSelfPermit: true },
    txRequest: {
      to: ROUTER,
      data: encodeFunctionData({
        abi: multicallAbi,
        functionName: "multicall",
        args: [DEADLINE, calls],
      }),
      value: 0n,
      gasLimit: 200_000n,
    },
    ...overrides,
  };
}

/** Bóc danh sách sub-call ra khỏi calldata `multicall`. */
function innerCalls(data: Hex): readonly Hex[] {
  const decoded = decodeFunctionData({ abi: multicallAbi, data });
  return decoded.args[1];
}

describe("withSelfPermit", () => {
  it("chèn selfPermit vào ĐẦU multicall, trước exactInput", () => {
    const out = withSelfPermit(makeQuote(), permit);
    const calls = innerCalls(out.txRequest.data);
    expect(calls.length).toBe(2);
    expect(calls[1]).toBe(SWAP_CALL);

    const decoded = decodeFunctionData({ abi: selfPermitAbi, data: calls[0] });
    expect(decoded.functionName).toBe("selfPermit");
    expect(decoded.args).toEqual([
      USDC,
      1_000_000n,
      DEADLINE,
      27,
      permit.r,
      permit.s,
    ]);
  });

  it("giữ nguyên deadline đã nhúng trong quote gốc", () => {
    // Sinh deadline mới ở bước này thì quote đang hiển thị và tx đem ký sẽ lệch
    // nhau — người dùng thấy một thứ, ký một thứ khác.
    const out = withSelfPermit(makeQuote(), permit);
    const decoded = decodeFunctionData({
      abi: multicallAbi,
      data: out.txRequest.data,
    });
    expect(decoded.args[0]).toBe(DEADLINE);
    expect(out.plan?.deadline).toBe(DEADLINE);
  });

  it("giữ nguyên unwrapWETH9 phía sau khi bán/mua ETH native", () => {
    const unwrap = "0xcafebabe" as Hex;
    const q = makeQuote();
    const withUnwrap = makeQuote({
      plan: { deadline: DEADLINE, calls: [SWAP_CALL, unwrap], supportsSelfPermit: true },
      txRequest: { ...q.txRequest, value: 0n },
    });
    const calls = innerCalls(withSelfPermit(withUnwrap, permit).txRequest.data);
    // permit -> swap -> unwrap: unwrap phải vẫn là cuối cùng, nếu không thì
    // router unwrap trước khi có WETH và trả về 0 ETH.
    expect(calls).toEqual([calls[0], SWAP_CALL, unwrap]);
  });

  it("cộng thêm gas cho phần permit thay vì giữ nguyên gas limit cũ", () => {
    // Gas limit của quote gốc chỉ tính phần swap; `token.permit` tốn thêm ~60k
    // (đo thực tế trên Sepolia: 219 537 vs 159 001). Không cộng là out-of-gas.
    const out = withSelfPermit(makeQuote(), permit);
    expect(out.txRequest.gasLimit).toBe(200_000n + 70_000n);
  });

  it("gasLimit null (aggregator không trả) thì vẫn null, không thành NaN", () => {
    const q = makeQuote();
    const out = withSelfPermit(
      makeQuote({ txRequest: { ...q.txRequest, gasLimit: null } }),
      permit,
    );
    expect(out.txRequest.gasLimit).toBeNull();
  });

  it("quote không hỗ trợ selfPermit thì trả về NGUYÊN quote cũ", () => {
    // Aggregator sinh calldata riêng, không tách được sub-call. Trả về quote cũ
    // để UI tự động rơi về luồng approve thay vì gửi calldata sai.
    const noPlan = makeQuote({ plan: null });
    expect(withSelfPermit(noPlan, permit)).toBe(noPlan);

    const q = makeQuote();
    const unsupported = makeQuote({
      plan: { ...q.plan!, supportsSelfPermit: false },
    });
    expect(withSelfPermit(unsupported, permit)).toBe(unsupported);
  });

  it("không đột biến quote gốc (UI vẫn hiển thị từ quote cũ)", () => {
    const q = makeQuote();
    const originalData = q.txRequest.data;
    const originalCalls = [...q.plan!.calls];
    withSelfPermit(q, permit);
    expect(q.txRequest.data).toBe(originalData);
    expect(q.plan!.calls).toEqual(originalCalls);
  });
});

describe("isSwapChainSupported", () => {
  it("bật cho Sepolia (engine nội bộ) và mainnet (LI.FI)", () => {
    expect(isSwapChainSupported(SEPOLIA_CHAIN_ID)).toBe(true);
    expect(isSwapChainSupported(1)).toBe(true);
    expect(isSwapChainSupported(137)).toBe(true);
  });

  it("tắt cho chain không có nguồn quote nào", () => {
    expect(isSwapChainSupported(999_999)).toBe(false);
  });
});
