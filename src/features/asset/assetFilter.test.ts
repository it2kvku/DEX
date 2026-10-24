import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { visibleAssetRows } from "./assetFilter";

/**
 * Lọc tab Tài sản quyết định người dùng THẤT GÌ sau khi nạp danh sách token
 * chuẩn (~400 token mainnet). Các quy tắc phải khóa bằng test vì sai ở đây
 * là loại bug nhìn thấy ngay: native biến mất, token có tiền bị ẩn, hoặc
 * search trả cả trăm row làm UI đứng.
 */

const erc20 = (o: Partial<{
  symbol: string;
  name: string;
  address: string;
  balance: bigint;
  isCustom: boolean;
}>) => ({
  kind: "erc20" as const,
  symbol: o.symbol ?? "TKN",
  name: o.name ?? "Token",
  address: (o.address ?? "0x0000000000000000000000000000000000000001") as Address,
  balance: o.balance ?? 0n,
  isCustom: o.isCustom,
});

const NATIVE = {
  kind: "native" as const,
  symbol: "ETH",
  name: "Ether",
  balance: 5n * 10n ** 17n,
};

describe("visibleAssetRows — không có query", () => {
  it("native luôn hiện kể cả khi số dư 0 (ví chưa nhận ETH lần nào)", () => {
    const out = visibleAssetRows(
      [{ ...NATIVE, balance: 0n }],
      "",
    );
    expect(out).toHaveLength(1);
  });

  it("token có số dư > 0 hiện, số dư = 0 bị ẩn", () => {
    const rows = [
      { ...NATIVE },
      erc20({ symbol: "USDC", balance: 100n }),
      erc20({ symbol: "DAI", balance: 0n, address: "0x0000000000000000000000000000000000000002" }),
    ];
    const out = visibleAssetRows(rows, "");
    expect(out.map((r) => r.symbol)).toEqual(["ETH", "USDC"]);
  });

  it("token tự import hiện kể cả số dư 0 (người dùng chủ động thêm)", () => {
    const rows = [
      { ...NATIVE },
      erc20({ symbol: "MEME", balance: 0n, isCustom: true, address: "0x0000000000000000000000000000000000000003" }),
    ];
    const out = visibleAssetRows(rows, "");
    expect(out.map((r) => r.symbol)).toEqual(["ETH", "MEME"]);
  });
});

describe("visibleAssetRows — có query", () => {
  it("khớp symbol, tên, và địa chỉ (không phân biệt hoa/thường)", () => {
    const rows = [
      { ...NATIVE },
      erc20({ symbol: "USDC", name: "USD Coin" }),
      erc20({ symbol: "ARB", name: "Arbitrum", address: "0xABCdef0000000000000000000000000000000001" }),
    ];
    expect(visibleAssetRows(rows, "usdc").map((r) => r.symbol)).toEqual(["USDC"]);
    expect(visibleAssetRows(rows, "arbitrum").map((r) => r.symbol)).toEqual(["ARB"]);
    expect(visibleAssetRows(rows, "0xabcdef").map((r) => r.symbol)).toEqual(["ARB"]);
    expect(visibleAssetRows(rows, "eth").map((r) => r.symbol)).toEqual(["ETH"]);
  });

  it("query chỉ toàn khoảng trắng coi như không tìm", () => {
    const rows = [
      { ...NATIVE },
      erc20({ symbol: "DAI", balance: 0n, address: "0x0000000000000000000000000000000000000009" }),
    ];
    expect(visibleAssetRows(rows, "   ").map((r) => r.symbol)).toEqual(["ETH"]);
  });

  it("giới hạn số kết quả để không render cả trăm row", () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      erc20({ symbol: "TKN" + i, address: ("0x" + i.toString(16).padStart(40, "0")) as Address }),
    );
    const out = visibleAssetRows(rows, "TKN");
    expect(out.length).toBeLessThanOrEqual(50);
  });
});
