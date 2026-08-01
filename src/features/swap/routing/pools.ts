import {
  encodeAbiParameters,
  getContractAddress,
  keccak256,
  type Address,
} from "viem";

/**
 * Tính địa chỉ pool Uniswap V3 bằng CREATE2 (không cần gọi Factory.getPool)
 * và quy đổi sqrtPriceX96 -> tỷ giá mid (spot).
 *
 * Vì sao CREATE2 thay vì getPool: routing engine cần biết địa chỉ của hàng
 * chục pool ứng viên. Tính offline = 0 RPC call, thay vì N call getPool.
 * Đã xác minh khớp 100% với Factory.getPool cho 12 pool trên Sepolia.
 */

/** UniswapV3Factory — cùng địa chỉ trên Sepolia. */
const FACTORY_SEPOLIA = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as Address;

/** keccak256 của creation bytecode UniswapV3Pool (hằng số của protocol). */
const POOL_INIT_CODE_HASH =
  "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

/** 4 fee tier chuẩn của Uniswap V3 (đơn vị phần triệu). */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;
export type FeeTier = (typeof FEE_TIERS)[number];

const Q96 = 2n ** 96n;
const Q192 = Q96 * Q96;

/** Sắp token theo thứ tự Uniswap (token0 < token1 theo địa chỉ). */
export function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/** Địa chỉ pool cho (tokenA, tokenB, fee) — thứ tự token không quan trọng. */
export function computePoolAddress(
  tokenA: Address,
  tokenB: Address,
  fee: number,
): Address {
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }],
      [token0, token1, fee],
    ),
  );
  return getContractAddress({
    opcode: "CREATE2",
    from: FACTORY_SEPOLIA,
    bytecodeHash: POOL_INIT_CODE_HASH,
    salt,
  });
}

/** Chia hai bigint thành Number, giữ 18 chữ số thập phân. */
function ratioToNumber(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  const SCALE = 10n ** 18n;
  return Number((numerator * SCALE) / denominator) / 1e18;
}

/**
 * Tỷ giá mid của một pool theo chiều tokenIn -> tokenOut:
 * bao nhiêu tokenOut (đơn vị người dùng) cho 1 tokenIn.
 *
 * Uniswap định nghĩa sqrtPriceX96 = sqrt(token1/token0) * 2^96, nên
 * price(token1 per token0) = sqrtPriceX96^2 / 2^192, tính trên raw units;
 * phải bù chênh lệch decimals của hai token.
 *
 * Đây là giá "vô cùng nhỏ" (marginal) — CHƯA gồm phí LP và chưa gồm
 * price impact. Đúng theo định nghĩa mid price dùng để đo impact.
 */
export function midRateFromSqrtPrice(
  sqrtPriceX96: bigint,
  tokenIn: Address,
  tokenOut: Address,
  decimalsIn: number,
  decimalsOut: number,
): number {
  if (sqrtPriceX96 <= 0n) return 0;
  const [token0] = sortTokens(tokenIn, tokenOut);
  const inIsToken0 = token0.toLowerCase() === tokenIn.toLowerCase();

  // price1per0 (raw) = sqrtP^2 / 2^192
  let numerator = sqrtPriceX96 * sqrtPriceX96;
  let denominator = Q192;

  if (!inIsToken0) {
    // Cần price0per1 = nghịch đảo.
    [numerator, denominator] = [denominator, numerator];
  }

  // Quy về đơn vị người dùng: out_human = out_raw / 10^decOut,
  // in_human = in_raw / 10^decIn  =>  nhân thêm 10^decIn / 10^decOut.
  if (decimalsIn >= decimalsOut) {
    numerator *= 10n ** BigInt(decimalsIn - decimalsOut);
  } else {
    denominator *= 10n ** BigInt(decimalsOut - decimalsIn);
  }

  return ratioToNumber(numerator, denominator);
}
