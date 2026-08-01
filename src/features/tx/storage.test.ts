import { beforeEach, describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { loadTxs, saveTxs, PENDING_TTL_MS } from "./storage";
import { isFinal, type TrackedTx } from "./types";

/**
 * Persist là thứ làm nên "pending recovery": đóng tab lúc swap đang chờ, mở lại
 * là app nối tiếp việc theo dõi từ hash đã lưu. Hai rủi ro cần khoá lại:
 *
 *  1. Bản ghi chứa bigint sẽ làm `JSON.stringify` THROW, và vì `saveTxs` bắt hết
 *     lỗi để không làm sập UI, hỏng kiểu này sẽ im lặng — pending tx đơn giản
 *     không bao giờ được lưu. Test round-trip là cách duy nhất phát hiện.
 *  2. localStorage có thể chứa dữ liệu do phiên bản cũ (hoặc extension) ghi ra.
 *     Đọc bừa rồi truy cập `tx.hash` sẽ throw trong lúc render provider.
 */

const KEY = "tx-center:v1";

/** localStorage tối giản cho môi trường node của Vitest. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  clear() {
    this.map.clear();
  }
}

const store = new MemoryStorage();
// storage.ts đọc `window.localStorage` và tự trả [] khi không có window, nên
// phải gắn window giả trước khi import chạy tới.
(globalThis as unknown as { window: unknown }).window = { localStorage: store };

function tx(overrides: Partial<TrackedTx> = {}): TrackedTx {
  return {
    id: "11155111:0xabc",
    hash: "0xabc" as Hex,
    chainId: 11155111,
    from: "0x3B61aBEE91852714E4e99b09a1af3e9C13893ef1" as Address,
    kind: "swap",
    title: "0.1 ETH → 320 USDC",
    status: "pending",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => store.clear());

describe("saveTxs / loadTxs", () => {
  it("round-trip giữ nguyên mọi field", () => {
    const records = [
      tx(),
      tx({
        id: "1:0xdef",
        hash: "0xdef" as Hex,
        chainId: 1,
        kind: "approve",
        status: "success",
        finalizedAt: 1_700_000_060_000,
      }),
    ];
    saveTxs(records);
    expect(loadTxs()).toEqual(records);
  });

  it("bản ghi có replacement/error vẫn serialize được", () => {
    const record = tx({
      status: "dropped",
      replacedBy: "0xfeed" as Hex,
      replacement: "repriced",
      error: "timeout",
    });
    saveTxs([record]);
    expect(loadTxs()[0]).toEqual(record);
  });

  it("cắt còn 50 bản ghi mới nhất (tx mới đứng đầu)", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      tx({ id: `1:${i}`, hash: `0x${i}` as Hex }),
    );
    saveTxs(many);
    const loaded = loadTxs();
    expect(loaded.length).toBe(50);
    // Giữ phần đầu = giữ tx mới nhất; bỏ đuôi = bỏ tx cũ nhất.
    expect(loaded[0].id).toBe("1:0");
    expect(loaded.at(-1)?.id).toBe("1:49");
  });

  it("chưa có gì trong localStorage -> mảng rỗng, không throw", () => {
    expect(loadTxs()).toEqual([]);
  });

  it("JSON hỏng -> mảng rỗng thay vì throw giữa lúc mount provider", () => {
    store.setItem(KEY, "{not json");
    expect(loadTxs()).toEqual([]);
  });

  it("JSON hợp lệ nhưng không phải mảng -> mảng rỗng", () => {
    store.setItem(KEY, '{"foo":1}');
    expect(loadTxs()).toEqual([]);
  });

  it("lọc bỏ phần tử thiếu field bắt buộc, giữ phần tử hợp lệ", () => {
    const good = tx();
    store.setItem(
      KEY,
      JSON.stringify([
        good,
        null,
        "chuỗi lạ",
        { id: "x" }, // thiếu hash/chainId/from/status/createdAt
        { ...good, id: "y", chainId: "11155111" }, // chainId sai kiểu
      ]),
    );
    expect(loadTxs()).toEqual([good]);
  });
});

describe("isFinal", () => {
  it("chỉ pending là chưa xong", () => {
    expect(isFinal(tx({ status: "pending" }))).toBe(false);
    expect(isFinal(tx({ status: "success" }))).toBe(true);
    expect(isFinal(tx({ status: "reverted" }))).toBe(true);
    // "dropped" cũng là trạng thái cuối: đã hết thời gian theo dõi, không mở
    // watcher lại nữa (nếu không, sweep sẽ theo dõi mãi một hash đã chết).
    expect(isFinal(tx({ status: "dropped" }))).toBe(true);
  });
});

describe("PENDING_TTL_MS", () => {
  it("là 30 phút — dài hơn thời gian một tx Sepolia bị nghẽn hợp lý", () => {
    expect(PENDING_TTL_MS).toBe(30 * 60 * 1000);
  });
});
