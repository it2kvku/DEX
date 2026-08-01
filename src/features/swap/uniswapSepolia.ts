import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { sepolia } from "wagmi/chains";
import {
  isSwapSupported as isLifiSupported,
  NATIVE_TOKEN_ADDRESS,
  type SwapQuote,
} from "./lifi";

/**
 * Swap trực tiếp qua Uniswap V3 trên Sepolia (LI.FI không hỗ trợ testnet):
 *   - Quote: QuoterV2.quoteExactInputSingle (eth_call), thử 4 mức fee
 *     và chọn amountOut tốt nhất — "mini routing" một hop.
 *   - Swap: SwapRouter02.exactInputSingle; ETH native vào -> router tự wrap
 *     (gửi kèm msg.value); nhận ETH native -> multicall kèm unwrapWETH9.
 *
 * Địa chỉ contract + liquidity của các pool WETH/USDC, WETH/UNI, USDC/UNI
 * đã được xác minh on-chain qua Factory.getPool + pool.liquidity().
 */

export const SEPOLIA_CHAIN_ID = sepolia.id;

const QUOTER_V2 = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as Address;
const SWAP_ROUTER_02 = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;
const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address;
/** Hằng số ADDRESS_THIS của SwapRouter02 (nhận output trung gian để unwrap). */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

const FEE_TIERS = [500, 3000, 10000, 100] as const;

/** Chain hỗ trợ swap: 4 mainnet qua LI.FI + Sepolia qua Uniswap V3. */
export function isSwapChainSupported(chainId: number): boolean {
  return isLifiSupported(chainId) || chainId === SEPOLIA_CHAIN_ID;
}

const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const swapRouterAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
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
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

/** Quote + build calldata swap trên Sepolia, trả về cùng shape với LI.FI. */
export async function fetchSepoliaQuote(
  client: PublicClient,
  fromToken: Address,
  toToken: Address,
  amountInWei: bigint,
  fromAddress: Address,
  slippageBps: number,
): Promise<SwapQuote> {
  const nativeIn = fromToken.toLowerCase() === NATIVE_TOKEN_ADDRESS;
  const nativeOut = toToken.toLowerCase() === NATIVE_TOKEN_ADDRESS;
  const tokenIn = nativeIn ? WETH_SEPOLIA : fromToken;
  const tokenOut = nativeOut ? WETH_SEPOLIA : toToken;

  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    throw new Error(
      "ETH và WETH là cùng một tài sản — dùng wrap/unwrap thay vì swap.",
    );
  }

  // Thử từng fee tier, giữ quote tốt nhất (pool testnet không phải fee nào cũng dày).
  let best: { fee: number; amountOut: bigint; gasEstimate: bigint } | null =
    null;
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await client.simulateContract({
        address: QUOTER_V2,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            amountIn: amountInWei,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const amountOut = result[0];
      if (!best || amountOut > best.amountOut) {
        best = { fee, amountOut, gasEstimate: result[3] };
      }
    } catch {
      // Pool không tồn tại / không đủ thanh khoản ở fee này — thử fee khác.
    }
  }
  if (!best || best.amountOut === 0n) {
    throw new Error(
      "Không có pool Uniswap V3 nào đủ thanh khoản cho cặp token này trên Sepolia.",
    );
  }

  const amountOutMin =
    (best.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

  // Build calldata cho SwapRouter02.
  const swapCall = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        fee: best.fee,
        // Nhận ETH native: output WETH về router rồi unwrap; còn lại về ví.
        recipient: nativeOut ? ADDRESS_THIS : fromAddress,
        amountIn: amountInWei,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  let data: Hex = swapCall;
  if (nativeOut) {
    const unwrapCall = encodeFunctionData({
      abi: swapRouterAbi,
      functionName: "unwrapWETH9",
      args: [amountOutMin, fromAddress],
    });
    data = encodeFunctionData({
      abi: swapRouterAbi,
      functionName: "multicall",
      args: [[swapCall, unwrapCall]],
    });
  }

  return {
    tool: `Uniswap V3 · pool ${(best.fee / 10_000).toFixed(2)}%`,
    toAmount: best.amountOut.toString(),
    toAmountMin: amountOutMin.toString(),
    approvalAddress: SWAP_ROUTER_02,
    // Testnet không có giá USD thật.
    fromAmountUsd: 0,
    toAmountUsd: 0,
    gasUsd: 0,
    txRequest: {
      to: SWAP_ROUTER_02,
      data,
      value: nativeIn ? amountInWei : 0n,
      // +50% buffer trên gasEstimate của quoter (chỉ là gas phần swap).
      gasLimit: best.gasEstimate > 0n ? (best.gasEstimate * 3n) / 2n + 60_000n : null,
    },
  };
}
