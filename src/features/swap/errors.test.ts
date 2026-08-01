import { describe, expect, it } from "vitest";
import { mapSwapError } from "./errors";

/**
 * `mapSwapError` là lớp duy nhất giữa revert reason của contract và câu người
 * dùng đọc được. Test ở đây dùng ĐÚNG chuỗi mà viem/wallet/router thực sự trả về
 * (không phải chuỗi rút gọn cho đẹp), vì hàm này match theo substring — đổi cách
 * viết thông báo là mất nhánh mà không ai biết.
 */
describe("mapSwapError", () => {
  it("người dùng bấm huỷ trong ví -> không phải lỗi kỹ thuật", () => {
    expect(
      mapSwapError("User rejected the request. Details: MetaMask Tx Signature"),
    ).toBe("Bạn đã từ chối giao dịch trong ví.");
    expect(mapSwapError("user denied transaction signature")).toBe(
      "Bạn đã từ chối giao dịch trong ví.",
    );
  });

  it("thiếu native token trả phí gas", () => {
    expect(
      mapSwapError(
        "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.\n\nDetails: insufficient funds for gas * price + value",
      ),
    ).toBe("Không đủ token bản địa để trả phí gas.");
  });

  it("không có route / thanh khoản", () => {
    const expected =
      "Không đủ thanh khoản / không có route cho cặp token này.";
    expect(mapSwapError("No available quotes for the requested transfer")).toBe(
      expected,
    );
    expect(
      mapSwapError(
        "Không có pool Uniswap V3 nào đủ thanh khoản cho cặp token này.",
      ),
    ).toBe(expected);
  });

  it("trượt giá quá dung sai", () => {
    const expected =
      "Giá trượt quá dung sai — thử tăng slippage hoặc giảm số lượng.";
    expect(mapSwapError("execution reverted: Too little received")).toBe(expected);
    expect(mapSwapError("Return amount is not enough")).toBe(expected);
  });

  it("quá deadline nhúng trong multicall", () => {
    expect(mapSwapError("execution reverted: Transaction too old")).toBe(
      "Quote đã hết hạn (quá deadline) — nhập lại số lượng để lấy quote mới.",
    );
  });

  it("STF của TransferHelper -> hướng người dùng đi approve", () => {
    // Đây là revert reason thật khi router chưa có allowance.
    expect(mapSwapError("execution reverted: STF")).toBe(
      "Approve chưa đủ — hãy approve lại rồi swap.",
    );
    expect(
      mapSwapError("execution reverted: ERC20: transfer amount exceeds allowance"),
    ).toBe("Approve chưa đủ — hãy approve lại rồi swap.");
  });

  it("chữ ký permit sai -> nói rõ phải quay lại approve", () => {
    expect(mapSwapError("execution reverted: EIP2612: invalid signature")).toBe(
      "Chữ ký permit không hợp lệ — ví này cần approve theo cách thường.",
    );
  });

  it("giá pool vượt giới hạn (SPL)", () => {
    expect(mapSwapError("execution reverted: SPL")).toBe(
      "Giá pool vượt giới hạn cho phép trong lệnh — thử giảm số lượng.",
    );
  });

  it("pool chưa khởi tạo (AS1)", () => {
    expect(mapSwapError("execution reverted: AS1")).toBe(
      "Pool chưa được khởi tạo.",
    );
  });

  it("lỗi lạ: giữ nguyên dòng đầu, cắt 140 ký tự, bỏ phần stack", () => {
    const msg = `Something totally unexpected happened\nVersion: viem@2.37.6\n  at foo`;
    expect(mapSwapError(msg)).toBe("Something totally unexpected happened");

    const long = "x".repeat(300);
    expect(mapSwapError(long).length).toBe(140);
  });

  it("không bao giờ trả chuỗi rỗng cho input rỗng", () => {
    // UI dùng chính giá trị trả về làm điều kiện hiển thị Alert; trả undefined
    // hay throw ở đây sẽ làm mất hẳn thông báo lỗi.
    expect(mapSwapError("")).toBe("");
    expect(typeof mapSwapError("???")).toBe("string");
  });

  it("nhận diện không phân biệt chữ hoa/thường", () => {
    expect(mapSwapError("USER REJECTED THE REQUEST")).toBe(
      "Bạn đã từ chối giao dịch trong ví.",
    );
  });
});
