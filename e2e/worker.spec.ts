import { test, expect } from "@playwright/test";

/**
 * Kiểm hạ tầng triển khai — những thứ chỉ đúng khi server THẬT trả lời:
 *
 * 1. Security headers (CSP, X-Frame-Options…): khai báo trong next.config.mjs
 *    `headers()`. Vinext cũng đọc rule này (chạy trên Cloudflare Worker), nên
 *    cùng một bài test xác nhận header không biến mất khi đổi build pipeline —
 *    đúng loại lỗi "qua được Next nhưng chết trên Worker" mà mắt thường không
 *    thấy vì không ảnh hưởng render.
 *
 * 2. RPC proxy (/rpc/{chainId}): chỉ test các nhánh TỪ CHỐI vì chúng không chạm
 *    upstream thật (test hermetic). Nhánh thành công đã được kiểm bằng tay qua
 *    preview; mock toàn bộ RPC của app nằm ở rpc-mock.ts.
 */

test("security headers có mặt trên mọi response HTML", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);

  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  // script-src phải KHÔNG có 'unsafe-eval' ở production.
  expect(csp).not.toContain("unsafe-eval");

  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(res.headers()["permissions-policy"]).toContain("camera=()");
});

test("RPC proxy từ chối chain không hỗ trợ", async ({ request }) => {
  const res = await request.post("/rpc/999", {
    headers: { "content-type": "application/json" },
    data: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
  });
  expect(res.status()).toBe(404);
});

test("RPC proxy chặn method ngoài allowlist (debug_*)", async ({ request }) => {
  const res = await request.post("/rpc/1", {
    headers: { "content-type": "application/json" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "debug_traceTransaction",
      params: [],
    },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.message).toContain("không cho phép");
});

test("RPC proxy chặn request cross-origin", async ({ request }) => {
  const res = await request.post("/rpc/1", {
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    data: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
  });
  expect(res.status()).toBe(403);
});

test("RPC proxy yêu cầu content-type JSON", async ({ request }) => {
  const res = await request.post("/rpc/1", {
    headers: { "content-type": "text/plain" },
    data: "not json",
  });
  expect(res.status()).toBe(415);
});
