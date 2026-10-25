import { describe, expect, it } from "vitest";
import { parseLifiStatus, fetchLifiStatus } from "./lifi";

/**
 * LI.FI /status là nguồn DUY NHẤT biết bridge đã xong chưa — sai parse ở đây
 * là sai trạng thái tiền của người dùng: báo xong khi chưa xong (tệ nhất) hoặc
 * treo "receiving" mãi. Shape API đã đổi nhiều lần nên parse phải nuốt mọi
 * hình dạng mà không ném — unit test khóa hành vi đó.
 */

describe("parseLifiStatus", () => {
  it("DONE → done kèm tx đích", () => {
    const out = parseLifiStatus({
      status: "DONE",
      substatus: "COMPLETED",
      receiving: { txHash: "0xabc", chainId: 42161 },
    });
    expect(out.status).toBe("done");
    expect(out.receivingTxHash).toBe("0xabc");
    expect(out.receivingChainId).toBe(42161);
  });

  it("thường/trống/lợn lọc: DONE/PENDING/NOT_FOUND không phân biệt hoa thường", () => {
    expect(parseLifiStatus({ status: "pending" }).status).toBe("pending");
    expect(parseLifiStatus({ status: "Not_Found" }).status).toBe("pending");
    expect(parseLifiStatus({}).status).toBe("unknown");
    expect(parseLifiStatus(null).status).toBe("unknown");
  });

  it("FAILED/INVALID → failed, giữ substatus (REFUNDED…)", () => {
    expect(parseLifiStatus({ status: "FAILED", substatus: "REFUNDED" })).toEqual({
      status: "failed",
      substatus: "REFUNDED",
      receivingTxHash: null,
      receivingChainId: null,
    });
    expect(parseLifiStatus({ status: "INVALID" }).status).toBe("failed");
  });

  it("receiving thiếu/thái shape lạ không ném — trả null", () => {
    expect(parseLifiStatus({ status: "PENDING", receiving: null }).receivingTxHash).toBeNull();
    expect(parseLifiStatus({ status: "PENDING", receiving: {} }).receivingTxHash).toBeNull();
  });
});

/**
 * fetchLifiStatus: lỗi HTTP phải là "unknown" (hạ tầng), KHÔNG được là
 * "failed" (thất bại thật) — mock fetch 500 để khóa.
 */
describe("fetchLifiStatus — lỗi hạ tầng", () => {
  it("HTTP 500 → unknown, không phán quyết bridge thất bại", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("server error", { status: 500 })) as typeof fetch;
    try {
      const out = await fetchLifiStatus({
        bridge: "across",
        fromChain: 1,
        toChain: 42161,
        txHash: "0xdeadbeef",
      });
      expect(out.status).toBe("unknown");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("mạng ném exception → unknown (caller tự retry)", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    try {
      const out = await fetchLifiStatus({
        bridge: "across",
        fromChain: 1,
        toChain: 42161,
        txHash: "0xdeadbeef",
      });
      expect(out.status).toBe("unknown");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
