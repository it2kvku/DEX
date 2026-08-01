import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { aggregate3, type Call3 } from "./multicall3";
import { computePoolAddress, midRateFromSqrtPrice, FEE_TIERS } from "./pools";
import {
  cumulativeLpFeePct,
  describeCandidate,
  encodePath,
  type Candidate,
  type RouteToken,
} from "./path";

/**
 * Routing engine: chấm điểm mọi route ứng viên rồi chọn best execution.
 *
 * Ba bước, mỗi bước MỘT round-trip RPC:
 *   1. quoteExactInput cho tất cả route (batch qua Multicall3).
 *   2. slot0 của các pool trong những route có quote (batch) -> mid price.
 *   3. (ngoài file này) build calldata cho route thắng.
 *
 * Chấm điểm theo net output chứ không phải amountOut thô:
 *   score = amountOut - gasCost quy đổi sang tokenOut
 * Một route 2-hop hơn 0.1% output nhưng tốn thêm 60k gas có thể lỗ khi
 * gas đắt — đó là điểm khác giữa "best quote" và "best execution".
 */

const QUOTER_V2 = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as Address;

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const poolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

/** Route đã có quote thành công. */
export interface QuotedRoute {
  candidate: Candidate;
  /** Path đã encode — dùng lại trực tiếp khi build calldata. */
  encodedPath: Hex;
  /** Địa chỉ pool của từng hop (tính bằng CREATE2). */
  pools: Address[];
  amountOut: bigint;
  gasEstimate: bigint;
  /** Số tick đã cross ở mỗi hop — nhiều tick = lệnh ăn sâu vào thanh khoản. */
  ticksCrossed: number[];
  /** amountOut sau khi trừ chi phí gas quy đổi sang tokenOut. */
  netScore: bigint;
  /** Mid price của cả route (tích mid từng hop); 0 nếu chưa tính. */
  midRate: number;
  /** Price impact thật (%) — đã tách phí LP ra. null nếu chưa tính được. */
  priceImpactPct: number | null;
  /** Tổng phí LP của route (%). */
  lpFeePct: number;
  label: string;
}

export interface RoutingResult {
  best: QuotedRoute;
  /** Toàn bộ route có quote, đã sắp giảm dần theo netScore. */
  ranked: QuotedRoute[];
  candidatesEvaluated: number;
}

/**
 * Quote toàn bộ candidate rồi chọn route tốt nhất.
 *
 * @param gasPriceWei giá gas hiện tại; dùng để quy gas -> tokenOut.
 * @param nativePerTokenOut bao nhiêu native token cho 1 tokenOut (để quy đổi
 *   gas sang tokenOut). Truyền null nếu không biết -> chấm điểm bằng amountOut
 *   thô và chỉ dùng gas để phá hòa (tie-break).
 */
export async function findBestRoute(
  client: PublicClient,
  candidates: Candidate[],
  amountIn: bigint,
  gasPriceWei: bigint,
  nativePerTokenOut: number | null,
): Promise<RoutingResult> {
  // ---- Bước 1: batch quoteExactInput ----
  // Encode path một lần, dùng lại cho cả quote và calldata thực thi.
  const paths: Hex[] = candidates.map((c) =>
    encodePath(
      c.tokens.map((t) => t.address),
      c.fees,
    ),
  );
  const poolsOf: Address[][] = candidates.map((c) =>
    c.fees.map((fee, h) =>
      computePoolAddress(c.tokens[h].address, c.tokens[h + 1].address, fee),
    ),
  );

  const quoteCalls: Call3[] = paths.map((path) => ({
    target: QUOTER_V2,
    callData: encodeFunctionData({
      abi: quoterAbi,
      functionName: "quoteExactInput",
      args: [path, amountIn],
    }),
  }));

  const quoteResults = await aggregate3(client, quoteCalls);

  const quoted: QuotedRoute[] = [];
  quoteResults.forEach((r, i) => {
    if (!r.success) return; // pool rỗng / không tồn tại
    try {
      const decoded = decodeFunctionResult({
        abi: quoterAbi,
        functionName: "quoteExactInput",
        data: r.returnData,
      });
      const amountOut = decoded[0];
      if (amountOut <= 0n) return;

      const candidate = candidates[i];
      quoted.push({
        candidate,
        encodedPath: paths[i],
        pools: poolsOf[i],
        amountOut,
        gasEstimate: decoded[3],
        ticksCrossed: [...decoded[2]].map(Number),
        netScore: amountOut, // tinh chỉnh ở bước tính gas bên dưới
        midRate: 0,
        priceImpactPct: null,
        lpFeePct: cumulativeLpFeePct(candidate.fees),
        label: describeCandidate(candidate),
      });
    } catch {
      // returnData không decode được -> bỏ route này.
    }
  });

  if (quoted.length === 0) {
    throw new Error(
      "Không có pool Uniswap V3 nào đủ thanh khoản cho cặp token này.",
    );
  }

  // ---- Bước 2: net score = amountOut - gas quy đổi sang tokenOut ----
  // gasCostNative(wei) = gasEstimate * gasPrice; đổi sang tokenOut bằng
  // nativePerTokenOut (tokenOut trên 1 native => chia).
  const decimalsOut = quoted[0].candidate.tokens.at(-1)!.decimals;
  for (const q of quoted) {
    // Router thêm ~46k gas overhead ngoài phần quoter đo được (transfer,
    // multicall wrapper) — cùng hằng số cho mọi route nên không lệch xếp hạng.
    const gasCostWei = (q.gasEstimate + 46_000n) * gasPriceWei;
    if (nativePerTokenOut && nativePerTokenOut > 0) {
      // 1 native = (1/nativePerTokenOut) tokenOut.
      const tokenOutPerNative = 1 / nativePerTokenOut;
      const gasInTokenOut =
        (Number(gasCostWei) / 1e18) * tokenOutPerNative * 10 ** decimalsOut;
      q.netScore = q.amountOut - BigInt(Math.floor(Math.max(0, gasInTokenOut)));
    } else {
      q.netScore = q.amountOut;
    }
  }

  quoted.sort((a, b) => {
    if (b.netScore !== a.netScore) return b.netScore > a.netScore ? 1 : -1;
    // Cùng net output: chọn route rẻ gas hơn.
    return a.gasEstimate > b.gasEstimate ? 1 : -1;
  });

  // ---- Bước 3: mid price + price impact cho top route ----
  // Chỉ tính cho vài route đầu — mid price chỉ dùng để hiển thị, không đổi
  // thứ hạng, nên không cần trả phí RPC cho cả 36 route.
  await attachPriceImpact(client, quoted.slice(0, 5), amountIn);

  return {
    best: quoted[0],
    ranked: quoted,
    candidatesEvaluated: candidates.length,
  };
}

/**
 * Tính mid price của route (tích mid price từng hop) rồi suy ra price impact.
 *
 * impact = 1 - execRate / midRate, sau đó TRỪ phí LP:
 * quoter trả về amountOut đã bị trừ phí, nên nếu không tách ra thì một swap
 * cực nhỏ qua pool 1% vẫn báo impact 1% — sai về mặt định nghĩa.
 */
async function attachPriceImpact(
  client: PublicClient,
  routes: QuotedRoute[],
  amountIn: bigint,
): Promise<void> {
  // Gom mọi pool cần slot0, khử trùng lặp giữa các route.
  const poolIndex = new Map<string, number>();
  const calls: Call3[] = [];
  const slot0Data = encodeFunctionData({ abi: poolAbi, functionName: "slot0" });

  for (const r of routes) {
    for (const pool of r.pools) {
      const key = pool.toLowerCase();
      if (!poolIndex.has(key)) {
        poolIndex.set(key, calls.length);
        calls.push({ target: pool, callData: slot0Data });
      }
    }
  }

  let sqrtPrices: (bigint | null)[];
  try {
    const results = await aggregate3(client, calls);
    sqrtPrices = results.map((r) => {
      if (!r.success) return null;
      try {
        return decodeFunctionResult({
          abi: poolAbi,
          functionName: "slot0",
          data: r.returnData,
        })[0];
      } catch {
        return null;
      }
    });
  } catch {
    return; // Mid price là thông tin phụ — thiếu thì để null, không chặn swap.
  }

  for (const r of routes) {
    const { tokens, fees } = r.candidate;
    let mid = 1;
    let complete = true;

    for (let h = 0; h < fees.length; h++) {
      const sqrtPriceX96 = sqrtPrices[poolIndex.get(r.pools[h].toLowerCase())!];
      if (!sqrtPriceX96) {
        complete = false;
        break;
      }
      mid *= midRateFromSqrtPrice(
        sqrtPriceX96,
        tokens[h].address,
        tokens[h + 1].address,
        tokens[h].decimals,
        tokens[h + 1].decimals,
      );
    }
    if (!complete || mid <= 0) continue;

    r.midRate = mid;

    const decIn = tokens[0].decimals;
    const decOut = tokens.at(-1)!.decimals;
    const inHuman = Number(amountIn) / 10 ** decIn;
    const outHuman = Number(r.amountOut) / 10 ** decOut;
    if (inHuman <= 0) continue;

    const execRate = outHuman / inHuman;
    const totalLoss = (1 - execRate / mid) * 100; // impact + phí LP
    r.priceImpactPct = Math.max(0, totalLoss - r.lpFeePct);
  }
}

/**
 * Mid rate spot giữa hai token (tokenB trên 1 tokenA), lấy từ pool sâu nhất
 * trong 4 fee tier. Dùng để quy đổi gas -> tokenOut khi chấm điểm route,
 * nên chỉ cần đúng cỡ độ lớn. Trả về null nếu không có pool trực tiếp.
 */
export async function fetchMidRate(
  client: PublicClient,
  tokenA: RouteToken,
  tokenB: RouteToken,
): Promise<number | null> {
  const pools = FEE_TIERS.map((fee) =>
    computePoolAddress(tokenA.address, tokenB.address, fee),
  );
  const slot0Data = encodeFunctionData({ abi: poolAbi, functionName: "slot0" });
  const liquidityData = encodeFunctionData({
    abi: poolAbi,
    functionName: "liquidity",
  });

  try {
    const results = await aggregate3(
      client,
      pools.flatMap((pool) => [
        { target: pool, callData: slot0Data },
        { target: pool, callData: liquidityData },
      ]),
    );

    let bestRate: number | null = null;
    let bestLiquidity = 0n;

    for (let i = 0; i < pools.length; i++) {
      const s0 = results[i * 2];
      const liq = results[i * 2 + 1];
      if (!s0.success || !liq.success) continue;
      try {
        const sqrtPriceX96 = decodeFunctionResult({
          abi: poolAbi,
          functionName: "slot0",
          data: s0.returnData,
        })[0];
        const liquidity = decodeFunctionResult({
          abi: poolAbi,
          functionName: "liquidity",
          data: liq.returnData,
        });
        if (liquidity <= bestLiquidity) continue;
        const rate = midRateFromSqrtPrice(
          sqrtPriceX96,
          tokenA.address,
          tokenB.address,
          tokenA.decimals,
          tokenB.decimals,
        );
        if (rate > 0) {
          bestRate = rate;
          bestLiquidity = liquidity;
        }
      } catch {
        // pool không decode được -> bỏ qua
      }
    }
    return bestRate;
  } catch {
    return null;
  }
}
