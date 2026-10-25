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

/** Chain hỗ trợ swap qua aggregator (testnet như Sepolia không có thanh khoản thật). */
const supportedSwapChains = new Set([1, 56, 137, 42161, 8453]);

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
    /** Thời gian thực thi ước tính (giây) — có nghĩa với bridge cross-chain. */
    executionDuration?: number;
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

/**
 * Lấy quote + calldata. slippageBps: 50 = 0.5%.
 * `toChainId` khác `chainId` = cross-chain bridge (LI.FI tự chọn tool:
 * hyphen/across/stargate…); bằng nhau = swap cùng chain như cũ.
 */
export async function fetchLifiQuote(
  chainId: number,
  fromToken: Address,
  toToken: Address,
  amountInWei: bigint,
  fromAddress: Address,
  slippageBps: number,
  toChainId: number = chainId,
): Promise<SwapQuote> {
  if (!isSwapSupported(chainId)) throw new Error("Chain chưa hỗ trợ swap.");

  const params = new URLSearchParams({
    fromChain: String(chainId),
    toChain: String(toChainId),
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
    bridgeDurationSec: json.estimate?.executionDuration ?? null,
    bridgeTool: json.tool ?? null,
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

/**
 * Trạng thái cross-chain sau khi tx NGUỒN đã vào block. LI.FI theo dõi toàn bộ
 * chuỗi step (bridge + swap đích) và trả tx hash phía nhận khi xong.
 *
 * Parse tách hàm thuần (parseLifiStatus) để unit test — shape /status đã đổi
 * nhiều lần trong quá khứ nên mọi trường đều optional, không tin gì cả.
 */
export interface LifiBridgeStatus {
  status: "pending" | "done" | "failed" | "unknown";
  /** "REFUNDED", "COMPLETED"… — hiển thị cho người dùng khi thất bại. */
  substatus: string | null;
  /** Tx hash phía chain đích (có khi DONE hoặc gần DONE). */
  receivingTxHash: Hex | null;
  receivingChainId: number | null;
}

interface LifiStatusResp {
  status?: string;
  substatus?: string;
  receiving?: { txHash?: string; chainId?: number } | null;
}

/** Chuẩn hóa response /status — hàm thuần, không gọi mạng. */
export function parseLifiStatus(json: unknown): LifiBridgeStatus {
  const j = (json ?? {}) as LifiStatusResp;
  const raw = (j.status ?? "").toUpperCase();
  let status: LifiBridgeStatus["status"];
  if (raw === "DONE") status = "done";
  else if (raw === "FAILED" || raw === "INVALID") status = "failed";
  else if (raw === "PENDING" || raw === "NOT_FOUND" || raw === "WAITING")
    status = "pending";
  else status = "unknown";
  return {
    status,
    substatus: j.substatus ?? null,
    receivingTxHash: (j.receiving?.txHash as Hex | undefined) ?? null,
    receivingChainId: j.receiving?.chainId ?? null,
  };
}

/** Poll /status — cần bridge tool name lấy từ quote (`tool`). */
export async function fetchLifiStatus(args: {
  bridge: string;
  fromChain: number;
  toChain: number;
  txHash: Hex;
}): Promise<LifiBridgeStatus> {
  const params = new URLSearchParams({
    bridge: args.bridge,
    fromChain: String(args.fromChain),
    toChain: String(args.toChain),
    txHash: args.txHash,
  });
  try {
    const res = await fetch(`${LIFI_BASE}/status?${params.toString()}`);
    if (!res.ok) {
      // 4xx/5xx là lỗi hạ tầng, không phán quyết bridge thất bại.
      return {
        status: "unknown",
        substatus: null,
        receivingTxHash: null,
        receivingChainId: null,
      };
    }
    return parseLifiStatus(await res.json());
  } catch {
    // Mạng rớt (offline, DNS…) — cùng nguyên tắc: unknown, caller tự retry.
    return {
      status: "unknown",
      substatus: null,
      receivingTxHash: null,
      receivingChainId: null,
    };
  }
}
