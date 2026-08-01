import { concatHex, pad, toHex, type Address, type Hex } from "viem";
import { FEE_TIERS } from "./pools";

/**
 * Sinh và encode các route ứng viên cho Uniswap V3.
 *
 * Path của Uniswap V3 là bytes packed: token0 | fee(3 bytes) | token1 |
 * fee | token2 ... Quoter và SwapRouter đọc trực tiếp định dạng này, nên
 * multi-hop chỉ là chuyện encode đúng — không cần contract phụ.
 */

export interface RouteToken {
  address: Address;
  symbol: string;
  decimals: number;
}

/** Một route ứng viên: n+1 token, n fee tier. */
export interface Candidate {
  tokens: RouteToken[];
  fees: number[];
}

/** token0 | fee | token1 | fee | token2 ... */
export function encodePath(tokens: Address[], fees: number[]): Hex {
  if (tokens.length !== fees.length + 1) {
    throw new Error("encodePath: số token phải bằng số fee + 1");
  }
  let path: Hex = tokens[0];
  for (let i = 0; i < fees.length; i++) {
    path = concatHex([path, pad(toHex(fees[i]), { size: 3 }), tokens[i + 1]]);
  }
  return path;
}

/** Mô tả route dạng đọc được: "USDC → WETH → UNI". */
export function describeCandidate(c: Candidate): string {
  return c.tokens.map((t) => t.symbol).join(" → ");
}

const eq = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

/**
 * Sinh toàn bộ route ứng viên từ tokenIn -> tokenOut:
 *   - 1 hop: trực tiếp, thử cả 4 fee tier.
 *   - 2 hop: qua từng token trung gian, thử mọi tổ hợp fee tier.
 *
 * Không loại pool "không tồn tại" ở bước này: quoter trả về revert cho pool
 * rỗng và ta gọi qua Multicall3 với allowFailure, nên route xấu tự bị loại
 * trong CÙNG một round-trip RPC. Lọc trước sẽ tốn thêm call getPool/slot0.
 */
export function buildCandidates(
  tokenIn: RouteToken,
  tokenOut: RouteToken,
  intermediaries: RouteToken[],
  maxHops = 2,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const fee of FEE_TIERS) {
    candidates.push({ tokens: [tokenIn, tokenOut], fees: [fee] });
  }

  if (maxHops >= 2) {
    for (const mid of intermediaries) {
      if (eq(mid.address, tokenIn.address) || eq(mid.address, tokenOut.address)) {
        continue;
      }
      for (const feeA of FEE_TIERS) {
        for (const feeB of FEE_TIERS) {
          candidates.push({
            tokens: [tokenIn, mid, tokenOut],
            fees: [feeA, feeB],
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Phí LP tích lũy của route (%). Nhiều hop = cộng dồn phí:
 * giữ lại (1-f1)(1-f2)... nên tổng phí = 1 - tích.
 */
export function cumulativeLpFeePct(fees: number[]): number {
  const kept = fees.reduce((acc, f) => acc * (1 - f / 1_000_000), 1);
  return (1 - kept) * 100;
}
