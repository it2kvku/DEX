import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { sepolia } from "wagmi/chains";
import { isSwapSupported as isLifiSupported } from "./lifi";
import type { SwapQuote } from "./types";
import { buildCandidates, type RouteToken } from "./routing/path";
import { fetchMidRate, findBestRoute } from "./routing/quoter";

/**
 * DEX engine trên Sepolia: tự routing qua Uniswap V3 (LI.FI không hỗ trợ
 * testnet). Khác với việc gọi một Quoter duy nhất, tầng này:
 *   1. Sinh mọi route ứng viên (1-hop 4 fee tier + 2-hop qua token trung gian).
 *   2. Quote toàn bộ trong 1 round-trip RPC (Multicall3 + allowFailure).
 *   3. Chấm điểm theo net output (đã trừ gas) -> best execution.
 *   4. Tính price impact thật từ mid price của pool (không phải từ giá USD).
 *   5. Build calldata exactInput bọc trong multicall(deadline, ...).
 *
 * Toàn bộ địa chỉ contract, pool và luồng calldata (kể cả native in/out) đã
 * được kiểm chứng bằng eth_call + state override trên Sepolia.
 */

export const SEPOLIA_CHAIN_ID = sepolia.id;

const SWAP_ROUTER_02 = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;
const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address;
/** Hằng số ADDRESS_THIS của SwapRouter02 — giữ output tại router để unwrap. */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

/** Token trung gian dùng để dựng route 2-hop (giống base token list của Uniswap). */
const CONNECTORS: RouteToken[] = [
  { address: WETH_SEPOLIA, symbol: "WETH", decimals: 18 },
  {
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    symbol: "USDC",
    decimals: 6,
  },
];

/** Thời hạn hiệu lực của giao dịch (phút) — quá hạn router tự revert. */
const DEADLINE_MINUTES = 20;

/** Chain hỗ trợ swap: mainnet qua LI.FI + Sepolia qua engine Uniswap V3. */
export function isSwapChainSupported(chainId: number): boolean {
  return isLifiSupported(chainId) || chainId === SEPOLIA_CHAIN_ID;
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
    // "approve" và swap vào MỘT giao dịch. Đã xác nhận có trong bytecode
    // của SwapRouter02 trên Sepolia.
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

export interface SepoliaQuoteArgs {
  client: PublicClient;
  tokenIn: RouteToken;
  tokenOut: RouteToken;
  /** true khi người dùng bán ETH native (path vẫn dùng WETH). */
  nativeIn: boolean;
  /** true khi người dùng muốn nhận ETH native (thêm unwrapWETH9). */
  nativeOut: boolean;
  amountInWei: bigint;
  fromAddress: Address;
  slippageBps: number;
}

/** Encode path cho engine: native được thay bằng WETH. */
function toWrapped(token: RouteToken, nativeSide: boolean): RouteToken {
  if (!nativeSide) return token;
  return { address: WETH_SEPOLIA, symbol: "WETH", decimals: 18 };
}

export async function fetchSepoliaQuote(
  args: SepoliaQuoteArgs,
): Promise<SwapQuote> {
  const {
    client,
    nativeIn,
    nativeOut,
    amountInWei,
    fromAddress,
    slippageBps,
  } = args;

  const tokenIn = toWrapped(args.tokenIn, nativeIn);
  const tokenOut = toWrapped(args.tokenOut, nativeOut);

  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
    throw new Error(
      "ETH và WETH là cùng một tài sản — dùng wrap/unwrap thay vì swap.",
    );
  }

  const candidates = buildCandidates(tokenIn, tokenOut, CONNECTORS);

  // Gas price + tỷ giá native/tokenOut chạy song song với batch quote:
  // cả hai chỉ dùng để chấm điểm net output, không phụ thuộc kết quả quote.
  const [gasPriceWei, nativePerTokenOut] = await Promise.all([
    client.getGasPrice().catch(() => 0n),
    tokenOut.address.toLowerCase() === WETH_SEPOLIA.toLowerCase()
      ? Promise.resolve(1)
      : fetchMidRate(client, tokenOut, {
          address: WETH_SEPOLIA,
          symbol: "WETH",
          decimals: 18,
        }),
  ]);

  const routing = await findBestRoute(
    client,
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
        // Nhận ETH native: giữ WETH ở router rồi unwrap về ví trong cùng tx.
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

  return {
    tool: `Uniswap V3 · ${best.candidate.fees.length} hop`,
    toAmount: best.amountOut.toString(),
    toAmountMin: amountOutMin.toString(),
    approvalAddress: SWAP_ROUTER_02,
    // Testnet không có giá USD thật — price impact vẫn tính được từ pool.
    fromAmountUsd: 0,
    toAmountUsd: 0,
    gasUsd: 0,
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
      to: SWAP_ROUTER_02,
      data,
      value: nativeIn ? amountInWei : 0n,
      // Quoter chỉ đo phần swap; cộng overhead router + 30% buffer.
      gasLimit: ((best.gasEstimate + 80_000n) * 13n) / 10n,
    },
  };
}

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

/** Địa chỉ WETH của Sepolia — UI cần để nhận diện cặp ETH/WETH. */
export { WETH_SEPOLIA };
