import { publicFallbackRpc } from "@/lib/chains";

/**
 * RPC proxy — chỉ có ý nghĩa khi chạy trên Cloudflare Worker (build vinext).
 *
 * Mục tiêu: browser KHÔNG còn nói chuyện trực tiếp với Alchemy. Client gọi
 * same-origin `/rpc/{chainId}`, Worker chuyển tiếp sang upstream cùng Alchemy
 * key lấy từ secret `ALCHEMY_API_KEY` (server-side, không bao giờ xuống bundle).
 * Nhờ vậy:
 *   - `connect-src` của CSP không cần mở origin Alchemy cho client (vẫn giữ
 *     các RPC công khai làm fallback).
 *   - key không dính rate-limit theo IP của từng người dùng.
 *
 * Đây là một endpoint CÔNG KHAI trên domain của app, nên phải tự bảo vệ mình:
 *   1. Allowlist method JSON-RPC — chặn `debug_*`, `admin_*`, `eth_getProof`…
 *      là những method đắt compute-unit hoặc chỉ phục vụ vận hành node.
 *   2. Giới hạn body 256 KB và rate limit theo IP (best-effort, per-isolate —
 *      Worker có nhiều isolate nên đây là tấm rào chứ không phải tường;
 *      muốn chặt hơn thì thêm WAF rule hoặc Rate Limiting binding).
 *   3. Không gửi header CORS — website khác không đọc được response từ browser,
 *      và body phải là application/json nên cả `no-cors` cũng không qua.
 *
 * Khi proxy từ chối (4xx/5xx), viem `fallback` transport tự động chuyển sang
 * transport kế tiếp (RPC công khai trực tiếp) — người dùng không thấy lỗi.
 */

export const dynamic = "force-dynamic";

/** Sub-domain Alchemy theo chain — BSC không có trên Alchemy public. */
const ALCHEMY_NETWORK: Partial<Record<number, string>> = {
  1: "eth-mainnet",
  137: "polygon-mainnet",
  42161: "arb-mainnet",
  8453: "base-mainnet",
  11155111: "eth-sepolia",
};

/**
 * Method app thật sự dùng (đã rà toàn bộ codebase: đọc số dư/allowance qua
 * multicall là `eth_call`, TxCenter polling là `eth_getTransactionReceipt`
 * + `eth_blockNumber`, ví in-app broadcast là `eth_sendRawTransaction`…).
 */
const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
]);

const MAX_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 12_000;

/** Rate limit per-isolate: đủ rộng cho UI (multicall batch ~ vài chục call/phút). */
const RATE_LIMIT = 600;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    // Xả bucket cũ để Map không phình to vô hạn trong isolate sống lâu.
    if (rateBuckets.size > 10_000) rateBuckets.clear();
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

/** Chặn website khác dùng proxy từ browser (curl/wallet vẫn qua — rate limit gác). */
function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host !== new URL(request.url).host;
    } catch {
      return true;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  return false;
}

function rpcError(id: unknown, code: number, message: string, status: number) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    }),
    {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    },
  );
}

interface RpcPayload {
  id?: number | string;
  method: string;
}

/** Lấy method không hợp lệ đầu tiên trong payload (hỗ trợ batch array). */
function firstDisallowedMethod(payload: RpcPayload | RpcPayload[]): string | null {
  const list = Array.isArray(payload) ? payload : [payload];
  for (const req of list) {
    if (typeof req?.method !== "string" || !ALLOWED_METHODS.has(req.method)) {
      return req?.method ?? "(thiếu method)";
    }
  }
  return null;
}

function upstreamUrl(chainId: number): string | null {
  const fallbacks = publicFallbackRpc[chainId];
  if (!fallbacks || fallbacks.length === 0) return null;

  // Secret server-side (khác biến NEXT_PUBLIC_ dùng cho client ở build Next).
  // Không có key (local dev) → proxy vẫn chạy, chuyển tiếp sang RPC công khai.
  const alchemyNetwork = ALCHEMY_NETWORK[chainId];
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyNetwork && alchemyKey) {
    return `https://${alchemyNetwork}.g.alchemy.com/v2/${alchemyKey}`;
  }
  return fallbacks[0];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chainId: string }> },
) {
  const { chainId: chainIdParam } = await params;
  const chainId = Number(chainIdParam);
  if (!Number.isInteger(chainId) || !upstreamUrl(chainId)) {
    return rpcError(null, -32601, `proxy: chain ${chainIdParam} không hỗ trợ`, 404);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return rpcError(null, -32005, "proxy: quá nhiều request, thử lại sau", 429);
  }
  if (isCrossSite(request)) {
    return rpcError(null, -32601, "proxy: chỉ nhận request same-origin", 403);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return rpcError(null, -32601, "proxy: content-type phải là application/json", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return rpcError(null, -32601, "proxy: body quá lớn", 413);
  }

  let payload: RpcPayload | RpcPayload[];
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return rpcError(null, -32601, "proxy: body quá lớn", 413);
    }
    payload = JSON.parse(body);
  } catch {
    return rpcError(null, -32700, "proxy: JSON không hợp lệ", 400);
  }

  const disallowed = firstDisallowedMethod(payload);
  if (disallowed) {
    return rpcError(null, -32601, `proxy: method ${disallowed} không cho phép`, 400);
  }

  const upstream = upstreamUrl(chainId)!;
  try {
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // Truyền thẳng response của node về client; KHÔNG thêm header CORS để
    // endpoint không thể bị website khác đọc từ browser.
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "proxy: upstream timeout"
        : "proxy: không gọi được upstream";
    return rpcError(null, -32603, message, 502);
  }
}
