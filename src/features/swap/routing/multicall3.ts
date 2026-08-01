import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

/**
 * Gọi hàng loạt eth_call qua Multicall3.aggregate3 trong MỘT round-trip RPC.
 *
 * Vì sao cần: routing engine chấm điểm ~36 route ứng viên. Gọi tuần tự =
 * 36 round-trip (vài giây, dễ bị rate-limit). Gộp thành 1 call = ~200ms.
 * allowFailure=true nên pool không tồn tại chỉ trả về success=false thay vì
 * làm sập cả batch.
 *
 * Multicall3 deploy cùng địa chỉ trên mọi chain EVM lớn (đã verify có
 * bytecode trên Sepolia).
 */

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

export interface Call3 {
  target: Address;
  callData: Hex;
}

export interface Call3Result {
  success: boolean;
  returnData: Hex;
}

/** Chia mảng thành từng khối để không vượt giới hạn gas/size của eth_call. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Thực thi batch. `chunkSize` giữ mỗi eth_call trong ngưỡng gas an toàn —
 * quoteExactInput có thể tốn ~150k gas/route nên 40 route/batch là hợp lý.
 */
export async function aggregate3(
  client: PublicClient,
  calls: Call3[],
  chunkSize = 40,
): Promise<Call3Result[]> {
  const batches = chunk(calls, chunkSize);
  const results: Call3Result[] = [];

  for (const batch of batches) {
    const { data } = await client.call({
      to: MULTICALL3_ADDRESS,
      data: encodeFunctionData({
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [
          batch.map((c) => ({
            target: c.target,
            allowFailure: true,
            callData: c.callData,
          })),
        ],
      }),
    });
    if (!data) throw new Error("Multicall3 không trả về dữ liệu.");

    const decoded = decodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      data,
    });
    results.push(
      ...decoded.map((r) => ({
        success: r.success,
        returnData: r.returnData as Hex,
      })),
    );
  }

  return results;
}
