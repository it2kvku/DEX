import { describe, expect, it } from "vitest";
import { formatBalance, formatGwei, formatUsd, shortenAddress } from "./format";

/**
 * Format số dư là chỗ dễ sinh ra lỗi hiển thị nghiêm trọng nhất trong một ví:
 * `Number(formatUnits(...))` mất chính xác với số lớn, và số rất nhỏ bị làm tròn
 * về "0" khiến người dùng tưởng mình đã mất token. Hai trường hợp đó được khoá
 * lại ở đây.
 */

describe("shortenAddress", () => {
  it("giữ 6 ký tự đầu và 4 cuối", () => {
    expect(shortenAddress("0x3B61aBEE91852714E4e99b09a1af3e9C13893ef1")).toBe(
      "0x3B61...3ef1",
    );
  });

  it("không có địa chỉ -> dấu gạch, không phải 'undefined'", () => {
    expect(shortenAddress(undefined)).toBe("—");
    expect(shortenAddress("")).toBe("—");
  });
});

describe("formatBalance", () => {
  it("số dư thường: 18 decimals", () => {
    expect(formatBalance(1_000_000_000_000_000_000n, 18)).toBe("1");
    expect(formatBalance(1_500_000_000_000_000_000n, 18)).toBe("1.5");
  });

  it("USDC 6 decimals", () => {
    expect(formatBalance(1_234_560_000n, 6)).toBe("1,234.56");
  });

  it("số dư 0 hiện '0' chứ không phải '0.000000'", () => {
    expect(formatBalance(0n, 18)).toBe("0");
  });

  it("số dư nhỏ hơn ngưỡng hiển thị -> '< 0.000001' thay vì '0'", () => {
    // 1 wei không phải là 0. Hiện "0" ở đây làm người dùng tưởng đã mất token.
    expect(formatBalance(1n, 18)).toBe("< 0.000001");
    expect(formatBalance(999_999_999_999n, 18)).toBe("< 0.000001");
  });

  it("vừa đúng ngưỡng thì hiện số thật", () => {
    expect(formatBalance(1_000_000_000_000n, 18)).toBe("0.000001");
  });

  it("cắt số lẻ theo maxFractionDigits, không làm tròn phần nguyên", () => {
    expect(formatBalance(1_234_567_890_123_456_789n, 18)).toBe("1.234568");
    expect(formatBalance(1_234_567_890_123_456_789n, 18, 2)).toBe("1.23");
  });

  it("số dư rất lớn vẫn có dấu phân cách, không dùng ký hiệu khoa học", () => {
    // Number('1e21').toLocaleString() ra "1,000,000,000,000,000,000,000" —
    // kiểm tra để chắc không lọt "1e+21" ra UI.
    const out = formatBalance(10n ** 39n, 18);
    expect(out).not.toContain("e");
    expect(out.startsWith("1,000,000,000,000,000,000,000")).toBe(true);
  });
});

describe("formatUsd", () => {
  it("thêm ký hiệu $ và tối đa 2 số lẻ", () => {
    expect(formatUsd(1234.567)).toBe("$1,234.57");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("giá trị không xác định -> gạch ngang thay vì '$NaN'", () => {
    // Xảy ra thật khi CoinGecko không có giá cho token testnet.
    expect(formatUsd(NaN)).toBe("—");
    expect(formatUsd(Infinity)).toBe("—");
  });
});

describe("formatGwei", () => {
  it("quy đổi wei sang gwei", () => {
    expect(formatGwei(1_000_000_000n)).toBe("1 Gwei");
    expect(formatGwei(1_500_000_000n)).toBe("1.5 Gwei");
  });

  it("gas price rất nhỏ vẫn hiện được (Sepolia có lúc dưới 1 gwei)", () => {
    expect(formatGwei(1_234_567n)).toBe("0.0012 Gwei");
  });

  it("0 wei", () => {
    expect(formatGwei(0n)).toBe("0 Gwei");
  });
});
