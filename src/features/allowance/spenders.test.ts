import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { describeSpender, PROBE_SPENDERS } from "./spenders";
import { isApprovalScanSupported } from "./discover";

/**
 * Nhãn spender là thứ quyết định người dùng thấy "Uniswap SwapRouter02" hay
 * "contract không nhận diện được" — và dòng thứ hai là dòng họ nên thu hồi. Sai
 * một ký tự trong địa chỉ là dán nhãn tin cậy cho một contract lạ, nên test khoá
 * lại đúng những địa chỉ đã tra `ContractName` trên Etherscan.
 */

describe("describeSpender", () => {
  it("nhận diện router Uniswap trên mainnet và Sepolia", () => {
    expect(
      describeSpender("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address),
    ).toEqual({ label: "Uniswap SwapRouter02", kind: "dex" });
    expect(
      describeSpender("0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address),
    ).toEqual({ label: "Uniswap SwapRouter02 (Sepolia)", kind: "dex" });
  });

  it("Permit2 được xếp riêng, không lẫn vào nhóm dex", () => {
    // Permit2 giữ allowance thay cho token nên ý nghĩa rủi ro khác router
    // thường; UI hiển thị badge riêng dựa vào `kind` này.
    expect(
      describeSpender("0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address),
    ).toEqual({ label: "Permit2 (Uniswap)", kind: "permit2" });
  });

  it("LI.FI Diamond được xếp là bridge", () => {
    expect(
      describeSpender("0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as Address),
    ).toEqual({ label: "LI.FI Diamond", kind: "bridge" });
  });

  it("tra cứu không phân biệt chữ hoa/thường", () => {
    // Log Etherscan trả địa chỉ lowercase, còn hằng số trong app là checksum.
    const lower = "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45" as Address;
    const upper = "0x68B3465833FB72A70ECDF485E0E4C7BD8665FC45" as Address;
    expect(describeSpender(lower)?.label).toBe("Uniswap SwapRouter02");
    expect(describeSpender(upper)?.label).toBe("Uniswap SwapRouter02");
  });

  it("spender lạ trả null — đây chính là nhóm được đánh dấu cảnh báo", () => {
    expect(
      describeSpender("0x1111111111111111111111111111111111111111" as Address),
    ).toBeNull();
  });
});

describe("PROBE_SPENDERS", () => {
  it("toàn bộ là địa chỉ 20 byte viết thường", () => {
    // Danh sách này dùng làm khoá tra cứu và làm args cho multicall; địa chỉ
    // méo sẽ làm cả batch `allowance()` fail chứ không chỉ một dòng.
    expect(PROBE_SPENDERS.length).toBeGreaterThan(5);
    for (const s of PROBE_SPENDERS) {
      expect(s).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("không trùng lặp", () => {
    expect(new Set(PROBE_SPENDERS).size).toBe(PROBE_SPENDERS.length);
  });

  it("mọi địa chỉ dò đều có nhãn (nếu không thì hiện 'không rõ' cho chính DEX)", () => {
    for (const s of PROBE_SPENDERS) {
      expect(describeSpender(s)).not.toBeNull();
    }
  });
});

describe("isApprovalScanSupported", () => {
  it("bật cho các chain đã thử thật thành công với free tier", () => {
    // Kết quả gọi thật `module=logs&action=getLogs` bằng key trong .env.local.
    for (const id of [1, 137, 42161, 11155111]) {
      expect(isApprovalScanSupported(id)).toBe(true);
    }
  });

  it("tắt cho BSC — free tier trả NOTOK cho module logs", () => {
    // Đã xác nhận: chainid=56 trả status "0". Nếu để true thì UI báo lỗi thay vì
    // chuyển sang chế độ dò danh sách spender đã biết.
    expect(isApprovalScanSupported(56)).toBe(false);
  });

  it("tắt cho chain chưa kiểm chứng", () => {
    expect(isApprovalScanSupported(999_999)).toBe(false);
  });
});
