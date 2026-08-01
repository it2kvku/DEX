/**
 * Dịch lỗi kỹ thuật (revert reason, lỗi RPC, lỗi ví) sang thông báo tiếng Việt.
 *
 * Tách ra khỏi component để dùng được cho cả 3 nguồn lỗi khác nhau — lỗi ký
 * trong ví, lỗi quote, và revert reason lấy từ eth_call preflight — và để
 * test được như một hàm thuần.
 */
export function mapSwapError(msg: string): string {
  const m = msg.toLowerCase();

  if (m.includes("user rejected") || m.includes("user denied")) {
    return "Bạn đã từ chối giao dịch trong ví.";
  }
  if (m.includes("insufficient funds")) {
    return "Không đủ token bản địa để trả phí gas.";
  }
  if (
    m.includes("insufficient liquidity") ||
    m.includes("no available quotes") ||
    m.includes("no route") ||
    m.includes("không có pool")
  ) {
    return "Không đủ thanh khoản / không có route cho cặp token này.";
  }
  if (
    m.includes("slippage") ||
    m.includes("too little received") ||
    m.includes("return amount is not enough")
  ) {
    return "Giá trượt quá dung sai — thử tăng slippage hoặc giảm số lượng.";
  }
  if (m.includes("transaction too old") || m.includes("expired")) {
    return "Quote đã hết hạn (quá deadline) — nhập lại số lượng để lấy quote mới.";
  }
  // "STF" = SafeTransferFrom thất bại: allowance hoặc balance không đủ.
  if (
    m.includes("allowance") ||
    m.includes("transferhelper") ||
    m.includes("stf") ||
    m.includes("transfer amount exceeds")
  ) {
    return "Approve chưa đủ — hãy approve lại rồi swap.";
  }
  if (m.includes("eip2612") || m.includes("invalid signature")) {
    return "Chữ ký permit không hợp lệ — ví này cần approve theo cách thường.";
  }
  if (m.includes("st") && m.includes("safetransfer")) {
    return "Chuyển token thất bại — kiểm tra lại số dư.";
  }
  if (m.includes("spl") || m.includes("sqrtprice")) {
    return "Giá pool vượt giới hạn cho phép trong lệnh — thử giảm số lượng.";
  }
  if (m.includes("out-of-gas") || m.includes("out of gas")) {
    return "Giao dịch hết gas — thử lại với gas limit cao hơn.";
  }
  if (m.includes("as1")) {
    return "Pool chưa được khởi tạo.";
  }

  return msg.split("\n")[0].slice(0, 140);
}
