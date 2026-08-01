import type { Page } from "@playwright/test";
import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";

/**
 * Giả lập TOÀN BỘ tầng mạng của app trong e2e.
 *
 * Vì sao không dùng chain thật: một smoke test chạm RPC công khai sẽ đỏ vì
 * rate-limit, vì node nghẽn, vì giá CoinGecko đổi — toàn những thứ không liên
 * quan tới bug của app. Vì sao không fork bằng anvil: máy dev/CI ở đây không
 * có Foundry, và fork cũng không giúp gì cho việc kiểm giao diện.
 *
 * Cách làm: chặn ở tầng `page.route`, tự trả lời JSON-RPC. Test vì thế hermetic
 * — cùng input luôn cho cùng output, chạy được offline.
 *
 * Giới hạn có ý thức: mock này KHÔNG mô phỏng pool/quoter. Mọi eth_call lạ đều
 * trả về "thất bại", nên các luồng phụ thuộc quote (route preview, simulation)
 * không kiểm ở đây — chúng đã có test đơn vị trên logic thuần.
 */

const RPC_HOST_RE =
  /(g\.alchemy\.com|publicnode\.com|drpc\.org|1rpc\.io|polygon-rpc\.com|arbitrum\.io|binance\.org|bsc-dataseed)/;

/** Header CORS: page ở 127.0.0.1:3000 nên response cross-origin phải tự mở. */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "*",
};

const ZERO_WORD =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

/** Selector 4 byte của các hàm ERC-20 mà mock biết trả lời. */
const SELECTOR = {
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
  decimals: "0x313ce567",
} as const;

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

const aggregate3Abi = [
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

/** Số dư giả: đủ lớn để nút "Tiếp tục" không bị chặn bởi "Số dư không đủ". */
const FAKE_NATIVE_BALANCE = "0x2386f26fc10000"; // 0.01 ETH
/** balanceOf trả 1000 đơn vị token (đúng cho cả 6 và 18 decimals ở mức test). */
const FAKE_TOKEN_BALANCE =
  "0x00000000000000000000000000000000000000000000000000000002540be400" as Hex; // 10^10

/** Trả lời một eth_call đơn lẻ; null = coi như call thất bại. */
function answerCall(data: string): Hex | null {
  const selector = data.slice(0, 10).toLowerCase();
  if (selector === SELECTOR.balanceOf) return FAKE_TOKEN_BALANCE;
  // allowance = 0 -> UI hiện luồng approve/permit, đúng trạng thái mặc định.
  if (selector === SELECTOR.allowance) return ZERO_WORD;
  if (selector === SELECTOR.decimals) {
    return "0x0000000000000000000000000000000000000000000000000000000000000012" as Hex;
  }
  return null;
}

interface RpcRequest {
  id?: number | string;
  method: string;
  params?: unknown[];
}

/**
 * Bộ định tuyến JSON-RPC. Trả `undefined` cho method không biết để caller
 * quyết định (trả lỗi -32601), chứ không im lặng trả null — im lặng làm viem
 * hiểu sai thành "dữ liệu rỗng" và test đỏ ở chỗ không liên quan.
 */
function handleRpc(req: RpcRequest, chainId: number): unknown {
  const params = (req.params ?? []) as unknown[];

  switch (req.method) {
    case "eth_chainId":
      return `0x${chainId.toString(16)}`;
    case "net_version":
      return String(chainId);
    case "eth_blockNumber":
      return "0x1400000";
    case "eth_getBalance":
      return FAKE_NATIVE_BALANCE;
    case "eth_getTransactionCount":
      return "0x1";
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00"; // 1 gwei
    case "eth_estimateGas":
      return "0x5208"; // 21000
    case "eth_getCode":
      // EOA: không bytecode. Cũng khiến nhánh EIP-7702 trong permit không bật.
      return "0x";
    case "eth_getBlockByNumber":
      return {
        number: "0x1400000",
        hash: `0x${"11".repeat(32)}`,
        parentHash: `0x${"22".repeat(32)}`,
        timestamp: "0x66a00000",
        baseFeePerGas: "0x3b9aca00",
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        miner: `0x${"00".repeat(20)}`,
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        logsBloom: `0x${"00".repeat(256)}`,
        nonce: "0x0000000000000000",
        size: "0x0",
        stateRoot: `0x${"33".repeat(32)}`,
        receiptsRoot: `0x${"44".repeat(32)}`,
        transactionsRoot: `0x${"55".repeat(32)}`,
        sha3Uncles: `0x${"66".repeat(32)}`,
        transactions: [],
        uncles: [],
      };
    case "eth_feeHistory":
      return {
        oldestBlock: "0x13ffffc",
        baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
        gasUsedRatio: [0.5],
        reward: [["0x3b9aca00"]],
      };
    case "eth_call": {
      const tx = params[0] as { to?: string; data?: Hex } | undefined;
      if (!tx?.data) return "0x";
      if (tx.to?.toLowerCase() === MULTICALL3) {
        return answerAggregate3(tx.data);
      }
      const answer = answerCall(tx.data);
      if (answer) return answer;
      // Quoter/pool: cố tình "revert" để UI đi nhánh "không có route".
      throw new Error("execution reverted");
    }
    default:
      return undefined;
  }
}

/** Bung multicall3.aggregate3 thành từng sub-call rồi gói kết quả lại. */
function answerAggregate3(data: Hex): Hex {
  const { args } = decodeFunctionData({ abi: aggregate3Abi, data });
  const calls = args[0] as readonly { callData: Hex }[];
  const results = calls.map((c) => {
    const answer = answerCall(c.callData);
    return answer
      ? { success: true, returnData: answer }
      : { success: false, returnData: "0x" as Hex };
  });
  // abi chỉ có MỘT output (`returnData`), nên `result` là chính mảng đó — không
  // bọc thêm một lớp mảng như khi hàm trả nhiều giá trị.
  return encodeFunctionResult({
    abi: aggregate3Abi,
    functionName: "aggregate3",
    result: results,
  });
}

/**
 * Suy ra chainId từ host RPC.
 *
 * Cần thiết vì app mở transport cho CẢ 5 chain cùng lúc (fallback list dựng sẵn
 * trong `buildTransports`), và ENS luôn query mainnet bất kể mạng đang chọn.
 * Nếu mock trả cùng một chainId cho mọi host, viem sẽ ném ChainMismatchError ở
 * đúng những chỗ không liên quan tới thứ đang test.
 */
function chainIdFromUrl(url: URL, fallback: number): number {
  const s = `${url.host}${url.pathname}`;
  if (/sepolia/.test(s)) return 11155111;
  if (/bsc|binance/.test(s)) return 56;
  if (/polygon|matic/.test(s)) return 137;
  if (/arb/.test(s)) return 42161;
  if (/eth-mainnet|ethereum-rpc|eth\.drpc|1rpc\.io\/eth/.test(s)) return 1;
  return fallback;
}

/**
 * Cài mock lên một page. Gọi TRƯỚC `page.goto`, nếu không request đầu tiên đã
 * bay ra internet thật rồi.
 */
export async function mockChain(page: Page, fallbackChainId = 1) {
  // --- JSON-RPC ---
  await page.route(
    (url) => RPC_HOST_RE.test(url.host),
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: CORS_HEADERS });
      }

      const chainId = chainIdFromUrl(
        new URL(route.request().url()),
        fallbackChainId,
      );

      let payload: RpcRequest | RpcRequest[];
      try {
        payload = JSON.parse(route.request().postData() ?? "{}");
      } catch {
        return route.fulfill({ status: 400, body: "bad request" });
      }

      // viem gộp nhiều call thành mảng (batch), phải trả về mảng tương ứng.
      const batch = Array.isArray(payload) ? payload : [payload];
      const responses = batch.map((req) => {
        try {
          const result = handleRpc(req, chainId);
          if (result === undefined) {
            return {
              jsonrpc: "2.0",
              id: req.id ?? null,
              error: {
                code: -32601,
                message: `mock: chưa hỗ trợ ${req.method}`,
              },
            };
          }
          return { jsonrpc: "2.0", id: req.id ?? null, result };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: req.id ?? null,
            error: {
              code: 3,
              message: e instanceof Error ? e.message : "mock error",
            },
          };
        }
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify(Array.isArray(payload) ? responses : responses[0]),
      });
    },
  );

  // --- CoinGecko: giá cố định để tổng tài sản không đổi giữa các lần chạy ---
  await page.route("**/api.coingecko.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ethereum: { usd: 3000, usd_24h_change: 1.5 },
        tether: { usd: 1, usd_24h_change: 0.01 },
        "usd-coin": { usd: 1, usd_24h_change: -0.02 },
        binancecoin: { usd: 600, usd_24h_change: 2 },
        "matic-network": { usd: 0.5, usd_24h_change: -1 },
      }),
    }),
  );

  // --- Etherscan: lịch sử + log approval rỗng ---
  await page.route("**/api.etherscan.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({ status: "1", message: "OK", result: [] }),
    }),
  );

  // --- LI.FI: không có route, để UI hiện đúng thông báo thay vì treo ---
  await page.route("**/li.quest/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "mock: không có route" }),
    }),
  );

  // --- WalletConnect relay: chặn để modal không mở socket ra ngoài ---
  await page.route(/walletconnect\.(com|org)|reown\.com/, (route) =>
    route.abort(),
  );
}


