import type { Address, Hex } from "viem";
import { NATIVE_TOKEN_ADDRESS, type RouteHop, type SwapQuote } from "./types";

/**
 * Client cho LI.FI API (không cần API key) — aggregator tổng hợp nhiều
 * DEX/aggregator (0x, 1inch, ParaSwap, OKX...) và tự chọn route tốt nhất.
 *
 * MỘT call /v1/quote trả về đủ mọi thứ:
 *   - estimate: toAmount, toAmountMin (đã áp slippage), approvalAddress,
 *     fromAmountUSD/toAmountUSD, feeCosts, gasCosts
 *   - includedSteps: từng chặng thực tế của route (dùng cho Route Preview)
 *   - transactionRequest: { to, data, value, gasLimit } sẵn sàng để ký
 */

export { NATIVE_TOKEN_ADDRESS };

const LIFI_BASE = "https://li.quest/v1";

/** Chain hỗ trợ swap (testnet như Sepolia không có thanh khoản thật). */
const supportedSwapChains = new Set([1, 56, 137, 42161]);

export function isSwapSupported(chainId: number): boolean {
  return supportedSwapChains.has(chainId);
}

interface LifiStep {
  tool?: string;
  type?: string;
  toolDetails?: { name?: string };
  action?: {
    fromToken?: { symbol?: string };
    toToken?: { symbol?: string };
  };
}

interface LifiQuoteResponse {
  tool?: string;
  toolDetails?: { name?: string };
  estimate?: {
    toAmount: string;
    toAmountMin: string;
    approvalAddress: Address;
    fromAmountUSD?: string;
    toAmountUSD?: string;
    gasCosts?: { amountUSD?: string }[];
    feeCosts?: { percentage?: string; included?: boolean }[];
  };
  includedSteps?: LifiStep[];
  transactionRequest?: {
    to: Address;
    data: Hex;
    value?: string;
    gasLimit?: string;
  };
  message?: string;
}

/**
 * Chuyển includedSteps -> RouteHop để UI vẽ Route Preview.
 * Bỏ các step không phải swap (feeCollection của LI.FI) vì chúng không đổi
 * token — hiển thị sẽ thành "USDC → USDC" gây nhiễu.
 */
function parseRoute(steps: LifiStep[]): RouteHop[] {
  return steps
    .filter((s) => {
      const from = s.action?.fromToken?.symbol;
      const to = s.action?.toToken?.symbol;
      return !!from && !!to && from !== to;
    })
    .map((s) => ({
      dex: s.toolDetails?.name ?? s.tool ?? "DEX",
      tokenInSymbol: s.action!.fromToken!.symbol!,
      tokenOutSymbol: s.action!.toToken!.symbol!,
      // Aggregator không tiết lộ fee tier của pool bên dưới.
      feePpm: null,
    }));
}

/** Lấy quote + calldata cho swap cùng chain. slippageBps: 50 = 0.5%. */
export async function fetchLifiQuote(
  chainId: number,
  fromToken: Address,
  toToken: Address,
  amountInWei: bigint,
  fromAddress: Address,
  slippageBps: number,
): Promise<SwapQuote> {
  if (!isSwapSupported(chainId)) throw new Error("Chain chưa hỗ trợ swap.");

  const params = new URLSearchParams({
    fromChain: String(chainId),
    toChain: String(chainId),
    fromToken,
    toToken,
    fromAmount: amountInWei.toString(),
    fromAddress,
    slippage: (slippageBps / 10_000).toString(), // 50 bps -> 0.005
  });

  const res = await fetch(`${LIFI_BASE}/quote?${params.toString()}`);
  const json = (await res.json()) as LifiQuoteResponse;

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Aggregator đang giới hạn tần suất — đợi vài giây.");
    }
    throw new Error(json.message || `Aggregator trả về ${res.status}`);
  }
  if (!json.estimate || !json.transactionRequest) {
    throw new Error(json.message || "Không tìm được route cho cặp token này.");
  }

  const gasUsd = (json.estimate.gasCosts ?? []).reduce(
    (sum, g) => sum + (Number(g.amountUSD) || 0),
    0,
  );
  const feePct = (json.estimate.feeCosts ?? []).reduce(
    (sum, f) => sum + (Number(f.percentage) || 0) * 100,
    0,
  );

  const hops = parseRoute(json.includedSteps ?? []);
  const toolName = json.toolDetails?.name ?? json.tool ?? "aggregator";

  return {
    tool: toolName,
    toAmount: json.estimate.toAmount,
    toAmountMin: json.estimate.toAmountMin,
    approvalAddress: json.estimate.approvalAddress,
    fromAmountUsd: Number(json.estimate.fromAmountUSD) || 0,
    toAmountUsd: Number(json.estimate.toAmountUSD) || 0,
    gasUsd,
    // Aggregator không trả mid price của pool nên không tính được price impact
    // đúng nghĩa. Để null thay vì dùng chênh lệch USD — đại lượng đó gộp cả
    // phí LP, phí integrator và sai số oracle, không phải price impact.
    priceImpactPct: null,
    lpFeePct: feePct > 0 ? feePct : null,
    midRate: null,
    route:
      hops.length > 0
        ? { hops, candidatesEvaluated: 0, source: "aggregator" }
        : null,
    // Calldata do aggregator sinh, không tách được sub-call -> không chèn được
    // selfPermit. Luồng permit chỉ áp dụng cho engine nội bộ.
    plan: null,
    txRequest: {
      to: json.transactionRequest.to,
      data: json.transactionRequest.data,
      value: json.transactionRequest.value
        ? BigInt(json.transactionRequest.value)
        : 0n,
      gasLimit: json.transactionRequest.gasLimit
        ? BigInt(json.transactionRequest.gasLimit)
        : null,
    },
  };
}
