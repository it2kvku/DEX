import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { sepolia } from "wagmi/chains";
import {
  NATIVE_LLAMA_KEY,
  fetchCurrentPrices,
  toLlamaKey,
} from "@/lib/marketData";
import { isSwapSupported as isLifiSupported } from "./lifi";
import type { SwapQuote } from "./types";
import { getV3ChainConfig, isEngineChain } from "./routing/chains";
import type { RouteToken } from "./routing/path";
import { buildCandidates } from "./routing/path";
import { fetchMidRate, findBestRoute } from "./routing/quoter";

/**
 * DEX engine nội bộ: tự routing qua Uniswap V3. Khác với việc gọi một Quoter
 * duy nhất, tầng này:
 *   1. Sinh mọi route ứng viên (1-hop 4 fee tier + 2-hop qua token trung gian).
 *   2. Quote toàn bộ trong 1 round-trip RPC (Multicall3 + allowFailure).
 *   3. Chấm điểm theo net output (đã trừ gas) -> best execution.
 *   4. Tính price impact thật từ mid price của pool (không phải từ giá USD).
 *   5. Build calldata exactInput bọc trong multicall(deadline, ...).
 *
 * Chạy trên Ethereum / Arbitrum / Polygon / Sepolia (xem routing/chains.ts) —
 * cấu hình contract và danh sách connector token khác nhau theo chain. Trên
 * mainnet và L2, quote còn kèm giá USD thật (DefiLlama) để so sánh với
 * aggregator ở tầng useSwapQuote; Sepolia giữ USD = 0 vì testnet không có
 * giá thật.
 *
 * Toàn bộ luồng calldata (kể cả native in/out qua wrap/unwrap) đã được kiểm
 * chứng bằng eth_call + state override trên Sepolia, và bằng quote + mô phỏng
 * thật trên mainnet sau khi đa chain hoá.
 */

export const SEPOLIA_CHAIN_ID = sepolia.id;

/** Thời hạn hiệu lực của giao dịch (phút) — quá hạn router tự revert. */
const DEADLINE_MINUTES = 20;

/** Chain hỗ trợ swap: engine nội bộ (V3) hoặc LI.FI aggregator. */
export function isSwapChainSupported(chainId: number): boolean {
  return isLifiSupported(chainId) || isEngineChain(chainId);
}

const swapRouterAbi = [
  {
    type: "function",
    name: "exactInput",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "unwrapWETH9",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    // Biến thể có deadline — dùng thay cho multicall(bytes[]) để tx quá hạn
    // trong mempool sẽ revert thay vì execute ở giá đã lệch.
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    // Nhận chữ ký ERC-2612 rồi tự gọi token.permit — cho phép gộp
    // "approve" và swap vào MỘT giao dịch. Có trong bytecode SwapRouter02
    // trên mọi chain engine hỗ trợ.
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

export interface V3QuoteArgs {
  chainId: number;
  client: PublicClient;
  tokenIn: RouteToken;
  tokenOut: RouteToken;
  /** true khi người dùng bán native (path vẫn dùng wrapped). */
  nativeIn: boolean;
  /** true khi người dùng muốn nhận native (thêm unwrapWETH9). */
  nativeOut: boolean;
  amountInWei: bigint;
  fromAddress: Address;
  slippageBps: number;
}

/** Encode path cho engine: native được thay bằng wrapped của chain. */
function toWrapped(
  token: RouteToken,
  nativeSide: boolean,
  wrappedNative: RouteToken,
): RouteToken {
  if (!nativeSide) return token;
  return wrappedNative;
}

/** Giá USD tham chiếu cho native + hai token của cặp swap (batch 1 request). */
async function fetchUsdPrices(
  chainId: number,
  nativeIn: boolean,
  nativeOut: boolean,
  tokenIn: RouteToken,
  tokenOut: RouteToken,
): Promise<Record<string, number>> {
  const nativeKey = NATIVE_LLAMA_KEY[chainId];
  const keys = [
    nativeKey,
    nativeIn || nativeOut ? null : toLlamaKey(chainId, "erc20", tokenIn.address),
    toLlamaKey(chainId, "erc20", tokenOut.address),
  ].filter((k): k is string => !!k);

  try {
    const prices = await fetchCurrentPrices(keys);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(prices)) out[k] = v.usd;
    return out;
  } catch {
    return {}; // Giá USD là thông tin hiển thị — thiếu thì để 0, không chặn swap.
  }
}

export async function fetchUniswapV3Quote(
  args: V3QuoteArgs,
): Promise<SwapQuote> {
  const {
    chainId,
    client,
    nativeIn,
    nativeOut,
    amountInWei,
    fromAddress,
    slippageBps,
  } = args;

  const config = getV3ChainConfig(chainId);
  if (!config) {
    throw new Error(`Chain ${chainId} không có Uniswap V3 cho engine nội bộ.`);
  }
  const wrappedNative = config.wrappedNative;

  const tokenIn = toWrapped(args.tokenIn, nativeIn, wrappedNative);
  const tokenOut = toWrapped(args.tokenOut, nativeOut, wrappedNative);

  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
    throw new Error(
      "Native và wrapped là cùng một tài sản — dùng wrap/unwrap thay vì swap.",
    );
  }

  const candidates = buildCandidates(
    tokenIn,
    tokenOut,
    config.connectors,
  );

  // Sepolia không có giá USD thật — mọi trường USD giữ 0 như trước.
  const hasRealUsd = chainId !== sepolia.id;

  // Gas price + tỷ giá wrapped/tokenOut + giá USD chạy song song với nhau:
  // hai thứ đầu dùng để chấm điểm net output, cái sau chỉ để hiển thị.
  const [gasPriceWei, nativePerTokenOut, usd] = await Promise.all([
    client.getGasPrice().catch(() => 0n),
    tokenOut.address.toLowerCase() === wrappedNative.address.toLowerCase()
      ? Promise.resolve(1)
      : fetchMidRate(client, config.factory, tokenOut, wrappedNative),
    hasRealUsd
      ? fetchUsdPrices(chainId, nativeIn, nativeOut, tokenIn, tokenOut)
      : Promise.resolve({} as Record<string, number>),
  ]);

  const routing = await findBestRoute(
    client,
    { factory: config.factory, quoterV2: config.quoterV2 },
    candidates,
    amountInWei,
    gasPriceWei,
    nativePerTokenOut,
  );
  const best = routing.best;

  const amountOutMin = (best.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + DEADLINE_MINUTES * 60,
  );

  const swapCall = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInput",
    args: [
      {
        path: best.encodedPath,
        // Nhận native: giữ wrapped ở router rồi unwrap về ví trong cùng tx.
        recipient: nativeOut ? ADDRESS_THIS : fromAddress,
        amountIn: amountInWei,
        amountOutMinimum: amountOutMin,
      },
    ],
  });

  const inner: Hex[] = [swapCall];
  if (nativeOut) {
    inner.push(
      encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "unwrapWETH9",
        args: [amountOutMin, fromAddress],
      }),
    );
  }

  const data = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "multicall",
    args: [deadline, inner],
  });

  const hops = best.candidate.fees.map((fee, i) => ({
    dex: "Uniswap V3",
    tokenInSymbol: best.candidate.tokens[i].symbol,
    tokenOutSymbol: best.candidate.tokens[i + 1].symbol,
    feePpm: fee,
    pool: best.pools[i],
  }));

  // Giá trị USD hiển thị: nhân giá llama với lượng token con người.
  const nativeUsd = usd[NATIVE_LLAMA_KEY[chainId] ?? ""] ?? 0;
  const tokenInUsdKey =
    nativeIn || tokenIn.address.toLowerCase() === wrappedNative.address.toLowerCase()
      ? NATIVE_LLAMA_KEY[chainId]
      : toLlamaKey(chainId, "erc20", tokenIn.address);
  const tokenOutUsdKey =
    nativeOut || tokenOut.address.toLowerCase() === wrappedNative.address.toLowerCase()
      ? NATIVE_LLAMA_KEY[chainId]
      : toLlamaKey(chainId, "erc20", tokenOut.address);
  const tokenInUsd = usd[tokenInUsdKey ?? ""] ?? 0;
  const tokenOutUsd = usd[tokenOutUsdKey ?? ""] ?? 0;

  const gasLimit = ((best.gasEstimate + 80_000n) * 13n) / 10n;
  const inHuman = Number(amountInWei) / 10 ** tokenIn.decimals;
  const outHuman = Number(best.amountOut) / 10 ** tokenOut.decimals;
  // gasUsd theo gasLimit của tx (đã gồm buffer router + 30%) — cận trên trung
  // thực; so sánh với LI.FI ở tầng quoteSource cùng cơ số này.
  const gasUsd =
    nativeUsd > 0
      ? (Number(gasLimit * gasPriceWei) / 1e18) * nativeUsd
      : 0;

  return {
    tool: `Uniswap V3 · ${best.candidate.fees.length} hop`,
    toAmount: best.amountOut.toString(),
    toAmountMin: amountOutMin.toString(),
    approvalAddress: config.swapRouter02,
    fromAmountUsd: tokenInUsd > 0 ? inHuman * tokenInUsd : 0,
    toAmountUsd: tokenOutUsd > 0 ? outHuman * tokenOutUsd : 0,
    gasUsd,
    priceImpactPct: best.priceImpactPct,
    lpFeePct: best.lpFeePct,
    midRate: best.midRate > 0 ? best.midRate : null,
    route: {
      hops,
      candidatesEvaluated: routing.candidatesEvaluated,
      source: "uniswap-v3",
    },
    // Giữ lại sub-call để tầng permit dựng lại multicall có selfPermit ở đầu.
    plan: { deadline, calls: inner, supportsSelfPermit: true },
    txRequest: {
      to: config.swapRouter02,
      data,
      value: nativeIn ? amountInWei : 0n,
      // Quoter chỉ đo phần swap; cộng overhead router + 30% buffer.
      gasLimit,
    },
  };
}

/** Hằng số ADDRESS_THIS của SwapRouter02 — giữ output tại router để unwrap. */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

/**
 * Dựng lại calldata swap với `selfPermit` chèn lên đầu multicall, tức là permit
 * và swap nằm trong cùng MỘT giao dịch.
 *
 * `selfPermit` phải đứng trước `exactInput`: router gọi `token.permit` để tự cấp
 * allowance cho chính nó, rồi mới `transferFrom` trong bước swap. Ngược thứ tự
 * thì swap revert `STF`.
 *
 * Gas thực đo trên Sepolia: 219 537 (permit + swap) so với 159 001 (chỉ swap khi
 * đã approve) — nghĩa là gộp vào 1 tx vẫn rẻ hơn approve riêng (~46k) + swap.
 */
export function withSelfPermit(
  quote: SwapQuote,
  permit: {
    token: Address;
    value: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  },
): SwapQuote {
  if (!quote.plan?.supportsSelfPermit) return quote;

  const permitCall = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "selfPermit",
    args: [
      permit.token,
      permit.value,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s,
    ],
  });
  const calls = [permitCall, ...quote.plan.calls];

  return {
    ...quote,
    plan: { ...quote.plan, calls },
    txRequest: {
      ...quote.txRequest,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "multicall",
        args: [quote.plan.deadline, calls],
      }),
      // permit thêm ~60k gas (đo thực tế: 219 537 - 159 001).
      gasLimit:
        quote.txRequest.gasLimit === null
          ? null
          : quote.txRequest.gasLimit + 70_000n,
    },
  };
}
