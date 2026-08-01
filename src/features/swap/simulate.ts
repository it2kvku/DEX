import {
  decodeFunctionResult,
  encodeAbiParameters,
  hexToBigInt,
  keccak256,
  pad,
  size,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type StateOverride,
} from "viem";
import { erc20Abi } from "@/lib/abi/erc20";

/**
 * Preflight simulation: chạy đúng calldata sẽ ký bằng `eth_call` TRƯỚC khi
 * người dùng bấm ký, để lỗi hiện ra dưới dạng thông báo thay vì một tx revert
 * đã mất phí gas.
 *
 * Vấn đề: với ERC-20, swap chỉ chạy được sau khi đã approve. Nếu chờ approve
 * xong mới simulate thì user đã trả gas cho approve rồi — mất ý nghĩa cảnh báo.
 * Cách giải: override thẳng slot allowance của token trong `stateOverride`,
 * tức là simulate "thế giới sau khi approve" mà không cần approve thật.
 *
 * Muốn override thì phải biết allowance nằm ở storage slot nào — mỗi token một
 * layout khác nhau và ABI không tiết lộ. `findAllowanceSlot` tìm ra bằng MỘT
 * eth_call duy nhất: ghi vào 32 slot ứng viên 32 giá trị đánh dấu khác nhau rồi
 * đọc `allowance()`; giá trị trả về chính là số hiệu slot thật.
 */

/** Số slot đầu tiên được dò — mapping allowance của ERC-20 thực tế luôn nằm trong khoảng này. */
const MAX_PROBE_SLOTS = 16;

/** Allowance giả định sau khi override (đủ lớn cho mọi lệnh, vẫn xa uint256 max). */
const OVERRIDDEN_ALLOWANCE = pad(toHex((1n << 128n) - 1n), { size: 32 });

interface AllowanceSlot {
  slot: number;
  /** true nếu layout là `allowance[owner][spender]` (owner là index ngoài). */
  ownerFirst: boolean;
}

/** Cache theo chain + token: layout storage không đổi nên chỉ dò một lần. */
const slotCache = new Map<string, AllowanceSlot | null>();

/** Khoá storage của `mapping(address => mapping(address => uint256))`. */
function allowanceSlotKey(
  owner: Address,
  spender: Address,
  slot: number,
  ownerFirst: boolean,
): Hex {
  const [outer, inner] = ownerFirst ? [owner, spender] : [spender, owner];
  const innerKey = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [outer, BigInt(slot)],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [inner, innerKey],
    ),
  );
}

/**
 * Tìm slot chứa mapping `allowance` bằng một eth_call duy nhất.
 *
 * Mẹo: ghi giá trị `i + 1` vào slot ứng viên thứ i, cả hai thứ tự khoá, rồi đọc
 * `allowance(owner, spender)`. Token đọc đúng slot của nó nên giá trị trả về
 * cho biết đó là ứng viên nào — không cần dò tuần tự 32 lần.
 */
async function findAllowanceSlot(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<AllowanceSlot | null> {
  const cacheKey = `${client.chain?.id ?? 0}:${token.toLowerCase()}`;
  const cached = slotCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const candidates: AllowanceSlot[] = [];
  for (let slot = 0; slot < MAX_PROBE_SLOTS; slot++) {
    candidates.push({ slot, ownerFirst: true });
    candidates.push({ slot, ownerFirst: false });
  }

  const stateDiff = candidates.map((c, i) => ({
    slot: allowanceSlotKey(owner, spender, c.slot, c.ownerFirst),
    // Marker = i + 1 để phân biệt "không trúng slot nào" (đọc ra 0).
    value: pad(toHex(BigInt(i + 1)), { size: 32 }),
  }));

  let found: AllowanceSlot | null = null;
  try {
    const marker = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
      stateOverride: [{ address: token, stateDiff }],
    });
    const index = Number(marker) - 1;
    if (index >= 0 && index < candidates.length) found = candidates[index];
  } catch {
    found = null;
  }

  slotCache.set(cacheKey, found);
  return found;
}

export type SimulationStatus = "ok" | "revert" | "unknown";

export interface SimulationResult {
  status: SimulationStatus;
  /** Lý do revert đã decode (nếu có), chưa dịch sang tiếng Việt. */
  reason: string | null;
  /** Số token thực nhận theo simulation — có thể lệch quote nếu pool vừa đổi giá. */
  amountOut: bigint | null;
  /**
   * true nếu simulation phải giả lập allowance (user chưa approve). Kết quả vẫn
   * đúng về mặt route/thanh khoản, nhưng không chứng minh được approve sẽ chạy.
   */
  usedAllowanceOverride: boolean;
}

const multicallResultAbi = [
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

/**
 * Lấy revert reason thô từ lỗi của viem. viem bọc lỗi qua nhiều lớp
 * (CallExecutionError -> ... -> RpcRequestError) nên phải đi hết chuỗi `cause`.
 */
function extractRevertReason(error: unknown): string | null {
  let cur: unknown = error;
  for (let depth = 0; cur && depth < 8; depth++) {
    const e = cur as {
      shortMessage?: string;
      reason?: string;
      details?: string;
      cause?: unknown;
    };
    if (e.reason) return e.reason;
    if (e.details?.includes("execution reverted")) return e.details;
    if (e.shortMessage?.includes("reverted")) return e.shortMessage;
    cur = e.cause;
  }
  const msg = (error as Error | undefined)?.message;
  return msg ?? null;
}

export interface SimulateSwapArgs {
  client: PublicClient;
  from: Address;
  to: Address;
  data: Hex;
  value: bigint;
  /** Token bán; undefined khi bán native (không cần allowance). */
  tokenIn?: Address;
  /** Spender trong quote — router sẽ pull token qua địa chỉ này. */
  spender?: Address;
  amountIn: bigint;
  /** true khi allowance hiện tại chưa đủ, cần override để simulate. */
  needsAllowance: boolean;
}

/**
 * Chạy calldata thật qua `eth_call`, có override allowance nếu cần.
 *
 * Trả `status: "unknown"` (chứ không phải "revert") khi bản thân eth_call thất
 * bại vì lý do hạ tầng — RPC lỗi, không hỗ trợ stateOverride. Lúc đó UI phải
 * cho phép ký tiếp, vì không simulate được không có nghĩa là swap sẽ fail.
 */
export async function simulateSwap(
  args: SimulateSwapArgs,
): Promise<SimulationResult> {
  const {
    client,
    from,
    to,
    data,
    value,
    tokenIn,
    spender,
    amountIn,
    needsAllowance,
  } = args;

  const stateOverride: StateOverride = [];
  let usedAllowanceOverride = false;

  if (needsAllowance && tokenIn && spender && amountIn > 0n) {
    const layout = await findAllowanceSlot(client, tokenIn, from, spender);
    if (layout) {
      stateOverride.push({
        address: tokenIn,
        stateDiff: [
          {
            slot: allowanceSlotKey(from, spender, layout.slot, layout.ownerFirst),
            value: OVERRIDDEN_ALLOWANCE,
          },
        ],
      });
      usedAllowanceOverride = true;
    } else {
      // Không tìm được slot -> simulate sẽ revert vì thiếu allowance, mà đó là
      // lỗi giả. Bỏ qua simulation thay vì báo sai cho người dùng.
      return {
        status: "unknown",
        reason: null,
        amountOut: null,
        usedAllowanceOverride: false,
      };
    }
  }

  try {
    const result = await client.call({
      account: from,
      to,
      data,
      value,
      ...(stateOverride.length > 0 ? { stateOverride } : {}),
    });
    return {
      status: "ok",
      reason: null,
      amountOut: decodeAmountOut(result.data),
      usedAllowanceOverride,
    };
  } catch (error) {
    const reason = extractRevertReason(error);
    // Phân biệt revert của contract với lỗi hạ tầng: chỉ khi thấy dấu hiệu
    // revert mới dám chặn người dùng.
    const isRevert = !!reason && /revert/i.test(reason);
    return {
      status: isRevert ? "revert" : "unknown",
      reason,
      amountOut: null,
      usedAllowanceOverride,
    };
  }
}

/**
 * Bóc `amountOut` khỏi kết quả `multicall(deadline, bytes[])`.
 *
 * Mỗi phần tử trong `results` là return data của một sub-call; `exactInput` trả
 * về đúng một uint256 nên phần tử dài 32 byte chính là amountOut. Trả null nếu
 * shape khác (vd LI.FI trả calldata riêng của aggregator).
 */
function decodeAmountOut(data: Hex | undefined): bigint | null {
  if (!data || data === "0x") return null;
  try {
    const results = decodeFunctionResult({
      abi: multicallResultAbi,
      functionName: "multicall",
      data,
    });
    for (const inner of results) {
      if (size(inner) === 32) {
        const out = hexToBigInt(inner);
        if (out > 0n) return out;
      }
    }
    return null;
  } catch {
    return null;
  }
}

