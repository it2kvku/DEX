import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { discoverApprovals } from "./discover";

/**
 * `discoverApprovals` là nơi duy nhất biết ví đã từng approve cho ai. Nó đọc dữ
 * liệu của bên thứ ba (Etherscan V2), nên mọi nhánh xử lý ở đây đều là xử lý
 * "response không như mong đợi" — và đó chính là phần cần test:
 *
 *  - Log `Approval` của ERC-721 có CÙNG topic0 với ERC-20 (`tokenId` cũng
 *    indexed), chỉ khác số topic. Không lọc thì UI hiện NFT như một quyền chi
 *    tiêu token và nút "thu hồi" gọi `approve(spender, 0)` sai chuẩn.
 *  - "No records found" là ví sạch, KHÔNG phải lỗi.
 *  - BSC trả `status: "0"` với thông điệp riêng — phải báo `unsupported` để UI
 *    chuyển sang chế độ dò spender đã biết thay vì hiện lỗi.
 *
 * Response ở đây mô phỏng đúng shape đã gọi thật bằng key trong `.env.local`.
 */

const OWNER = "0x3B61aBEE91852714E4e99b09a1af3e9C13893ef1" as Address;
const USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
const ROUTER = "0x8ed94b8dad2dc5453862ea5e316a8e71aaed9782";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

const ownerTopic = `0x${OWNER.slice(2).toLowerCase().padStart(64, "0")}`;
const pad32 = (addr: string) => `0x${addr.slice(2).padStart(64, "0")}`;

function erc20Log(token: string, spender: string, block: number, ts: number) {
  return {
    address: token,
    topics: [APPROVAL_TOPIC, ownerTopic, pad32(spender)],
    data: "0x" + "f".repeat(64),
    blockNumber: `0x${block.toString(16)}`,
    timeStamp: `0x${ts.toString(16)}`,
  };
}

/** Log approve NFT: có thêm topic tokenId -> 4 topic. */
function erc721Log(collection: string, operator: string, tokenId: number) {
  return {
    address: collection,
    topics: [
      APPROVAL_TOPIC,
      ownerTopic,
      pad32(operator),
      `0x${tokenId.toString(16).padStart(64, "0")}`,
    ],
    data: "0x",
    blockNumber: "0x1",
    timeStamp: "0x1",
  };
}

function mockOnce(body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => vi.unstubAllGlobals());

describe("discoverApprovals", () => {
  it("không có API key -> báo no-key, không gọi mạng", async () => {
    const fetchMock = mockOnce({ status: "1", result: [] });
    const r = await discoverApprovals(11155111, OWNER, "");
    expect(r).toEqual({ status: "no-key", candidates: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chain không hỗ trợ log (BSC) -> báo unsupported trước khi gọi mạng", async () => {
    const fetchMock = mockOnce({ status: "1", result: [] });
    const r = await discoverApprovals(56, OWNER, "key");
    expect(r.status).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gộp nhiều lần approve cùng (token, spender) thành MỘT dòng, giữ block mới nhất", async () => {
    mockOnce({
      status: "1",
      message: "OK",
      result: [
        erc20Log(USDC, ROUTER, 0x4cc094, 1_700_000_000),
        erc20Log(USDC, ROUTER, 0x4e896d, 1_700_100_000),
        erc20Log(USDC, ROUTER, 0x4cc0ce, 1_700_050_000),
      ],
    });
    const r = await discoverApprovals(11155111, OWNER, "key");
    expect(r.status).toBe("ok");
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].token).toBe(USDC);
    expect(r.candidates[0].spender.toLowerCase()).toBe(ROUTER);
    expect(r.candidates[0].lastBlock).toBe(0x4e896d);
    // timeStamp của explorer là giây; UI dùng ms.
    expect(r.candidates[0].lastTimestamp).toBe(1_700_100_000 * 1000);
  });

  it("bỏ log Approval của ERC-721 (4 topic) dù cùng topic0", async () => {
    mockOnce({
      status: "1",
      result: [
        erc721Log("0xaaaa000000000000000000000000000000000001", ROUTER, 7),
        erc20Log(USDC, ROUTER, 100, 1),
      ],
    });
    const r = await discoverApprovals(11155111, OWNER, "key");
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].token).toBe(USDC);
  });

  it("token khác nhau hoặc spender khác nhau là các dòng riêng", async () => {
    const other = "0x2bccae3ac0bc305736c3c4a4d69fef29ea90bc52";
    mockOnce({
      status: "1",
      result: [
        erc20Log(USDC, ROUTER, 10, 1),
        erc20Log(other, ROUTER, 11, 2),
        erc20Log(USDC, "0xb97acd27b378a857692a09dc7733a291131fdba6", 12, 3),
      ],
    });
    const r = await discoverApprovals(11155111, OWNER, "key");
    expect(r.candidates.length).toBe(3);
  });

  it('"No records found" là ví sạch, không phải lỗi', async () => {
    mockOnce({
      status: "0",
      message: "No records found",
      result: "No records found",
    });
    const r = await discoverApprovals(11155111, OWNER, "key");
    expect(r).toEqual({ status: "ok", candidates: [] });
  });

  it("thông điệp free-tier của explorer -> unsupported, không throw", async () => {
    mockOnce({
      status: "0",
      message: "NOTOK",
      result: "Free API access is not supported for this chain",
    });
    const r = await discoverApprovals(1, OWNER, "key");
    expect(r).toEqual({ status: "unsupported", candidates: [] });
  });

  it("lỗi thật ở trang đầu thì throw để UI báo cho người dùng", async () => {
    // Im lặng trả rỗng ở đây là tệ hơn: người dùng sẽ tin rằng mình không có
    // quyền nào đang mở.
    mockOnce({ status: "0", message: "NOTOK", result: "Invalid API Key" });
    await expect(discoverApprovals(1, OWNER, "key")).rejects.toThrow(
      "Invalid API Key",
    );
  });

  it("HTTP lỗi -> throw kèm mã trạng thái", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })),
    );
    await expect(discoverApprovals(1, OWNER, "key")).rejects.toThrow("502");
  });

  it("truyền owner làm topic1 để node lọc sẵn, không tải log của mọi ví", async () => {
    const fetchMock = mockOnce({ status: "1", result: [] });
    await discoverApprovals(11155111, OWNER, "my-key");
    const url = String(
      (fetchMock as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
    );
    expect(url).toContain(`topic0=${APPROVAL_TOPIC}`);
    expect(url).toContain(`topic1=${ownerTopic}`);
    expect(url).toContain("chainid=11155111");
    expect(url).toContain("apikey=my-key");
  });

  it("trang đầy 1000 log -> đọc tiếp trang sau; quá 3 trang thì báo truncated", async () => {
    const full = Array.from({ length: 1000 }, (_, i) =>
      erc20Log(`0x${i.toString(16).padStart(40, "0")}`, ROUTER, i + 1, i + 1),
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "1", result: full }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await discoverApprovals(11155111, OWNER, "key");
    // Dừng ở MAX_PAGES = 3 và nói thẳng danh sách chưa đầy đủ, thay vì hiển thị
    // như thể đã quét hết lịch sử.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.status).toBe("truncated");
    expect(r.candidates.length).toBe(1000);
  });

  it("trang chưa đầy -> dừng luôn, không gọi thêm", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "1", result: [erc20Log(USDC, ROUTER, 1, 1)] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await discoverApprovals(11155111, OWNER, "key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("ok");
  });
});
