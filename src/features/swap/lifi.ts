import type { Address, Hex } from "viem";

/**
 * Client cho LI.FI API (không cần API key) — aggregator tổng hợp nhiều
 * DEX/aggregator (0x, 1inch, ParaSwap, OKX...) và tự chọn route tốt nhất.
 *
 * Ưu điểm cho ví: MỘT call /v1/quote trả về đủ mọi thứ:
 *   - estimate: toAmount, toAmountMin (đã áp slippage), approvalAddress,
 *     fromAmountUSD/toAmountUSD (tính price impact), gasCosts
 *   - transactionRequest: { to, data, value, gasLimit } sẵn sàng để ký
 * Ví chỉ việc: check allowance với approvalAddress -> approve nếu thiếu
 * -> gửi transactionRequest.
 */

/** Quy ước địa chỉ native token (ETH/BNB/POL) của LI.FI. */
export const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

const LIFI_BASE = "https://li.quest/v1";

/** Chain hỗ trợ swap (testnet như Sepolia không có thanh khoản thật). */
const supportedSwapChains = new Set([1, 56, 137, 42161]);

export function isSwapSupported(chainId: number): boolean {
  return supportedSwapChains.has(chainId);
}

export interface SwapQuote {
  /** Tên DEX/tool thực thi route (vd "okx", "1inch"). */
  tool: string;
  toAmount: string;
  toAmountMin: string;
  /** Spender để approve ERC-20 (router của LI.FI). */
  approvalAddress: Address;
  fromAmountUsd: number;
  toAmountUsd: number;
  gasUsd: number;
  txRequest: {
    to: Address;
    data: Hex;
    value: bigint;
    gasLimit: bigint | null;
  };
}

interface LifiQuoteResponse {
  tool?: string;
  estimate?: {
    toAmount: string;
    toAmountMin: string;
    approvalAddress: Address;
    fromAmountUSD?: string;
    toAmountUSD?: string;
    gasCosts?: { amountUSD?: string }[];
  };
  transactionRequest?: {
    to: Address;
    data: Hex;
    value?: string;
    gasLimit?: string;
  };
  message?: string;
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

  return {
    tool: json.tool ?? "aggregator",
    toAmount: json.estimate.toAmount,
    toAmountMin: json.estimate.toAmountMin,
    approvalAddress: json.estimate.approvalAddress,
    fromAmountUsd: Number(json.estimate.fromAmountUSD) || 0,
    toAmountUsd: Number(json.estimate.toAmountUSD) || 0,
    gasUsd,
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
