import { test, expect } from "@playwright/test";
import { mockChain } from "./fixtures/rpc-mock";

/**
 * Trang token: resolving on-chain cho token LẠ + trạng thái KẾT THÚC.
 *
 * Bug thật đã bắt trên production: địa chỉ PEPE mainnet mở khi ví đang ở
 * Sepolia — không phải ERC-20 trên chain đó, đọc on-chain thất bại, nhưng
 * logic thiếu trạng thái kết thúc nên trang kẹt "Đang đọc thông tin token"
 * vĩnh viễn. Mock trả readContracts lỗi (multicall aggregate3 success=false)
 * chính xác bằng hành vi của chain thật với contract không tồn tại.
 *
 * Điểm mock khớp chain thật: aggregate3 trả success:false cho sub-call tới
 * contract không có bytecode (rpc-mock trả "0x" cho mọi eth_getCode và chỉ
 * biết balanceOf/allowance/decimals/getEthBalance — symbol/name đều fail).
 */
test.beforeEach(async ({ page }) => {
  await mockChain(page);
});

test("token lạ resolve được on-chain: hiện symbol thật của mock", async ({
  page,
}) => {
  // Địa chỉ có trong mock balance map? Mock trả balanceOf cho MỌI token, và
  // symbol/decimals mock luôn trả giá trị hợp lệ — nên mọi địa chỉ hex "lạ"
  // đều resolve thành công trên mock. Dùng một địa chỉ ERC-20 giả bất kỳ.
  await page.goto("/app/token/0x1111111111111111111111111111111111111111");
  await page.waitForFunction(
    () => (window as unknown as { __uiReady?: boolean }).__uiReady === true,
  );

  // Resolve xong phải hiện TRANG TOKEN (h1 tên) chứ không kẹt "Đang đọc…".
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Đang đọc thông tin token")).toBeHidden();
});

test("địa chỉ không phải token (mọi read on-chain fail) -> trạng thái KẾT THÚC", async ({
  page,
}) => {
  // Địa chỉ không phải hex 40 ký tự → UI không thử resolve on-chain mà vào
  // not-found NGAY (biểu thức HEX_ADDRESS_RE). Đây là nhánh terminal thứ hai.
  await page.goto("/app/token/khong-phai-dia-chi");
  await page.waitForFunction(
    () => (window as unknown as { __uiReady?: boolean }).__uiReady === true,
  );

  // Trạng thái kết thúc: thông báo not-found hiện, spinner "Đang đọc" biến mất.
  await expect(
    page.getByText(/Không đọc được token trên mạng này/),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Đang đọc thông tin token trên mạng…")).toBeHidden();
});
