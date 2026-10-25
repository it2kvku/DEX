import { test, expect } from "@playwright/test";
import { mockChain } from "./fixtures/rpc-mock";

/**
 * Luồng ví in-app: tạo ví → sao lưu mnemonic → connector wagmi tự kết nối →
 * app chuyển sang trạng thái "đã có ví" và đọc được số dư.
 *
 * Đây là bài test quan trọng nhất trong bộ e2e, vì nó là bài DUY NHẤT chứng
 * minh mắt xích kiến trúc chính hoạt động: một viem LocalAccount được bọc thành
 * EIP-1193 provider và đăng ký như connector wagmi, nhờ đó toàn bộ tầng
 * Asset/Send/History (viết trên wagmi hooks) chạy y hệt với ví extension.
 * Unit test không kiểm được điều đó — nó nằm ở chỗ Web Crypto + IndexedDB +
 * wagmi store gặp nhau, tức là chỉ có trong trình duyệt thật.
 */

const PASSWORD = "matkhau-test-123";

test.beforeEach(async ({ page }) => {
  await mockChain(page);
  await page.goto("/app");
  // Chờ hydration trước khi click tab — click vào nút SSR trước khi React
  // gắn handler là click vô tác dụng (đã từng bắt gặp ở command palette).
  await page.waitForFunction(() =>
    (window as unknown as { __appReady?: boolean }).__appReady === true,
  );
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();
});

test("tạo ví mới: mật khẩu → 12 từ → kết nối", async ({ page }) => {
  await page.getByRole("button", { name: "Tạo ví mới" }).click();

  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(PASSWORD);

  // Chưa nhập lại mật khẩu -> nút vẫn khoá.
  await expect(page.getByRole("button", { name: "Tạo ví" })).toBeDisabled();

  await passwords.nth(1).fill(PASSWORD);
  await expect(page.getByRole("button", { name: "Tạo ví" })).toBeEnabled();
  await page.getByRole("button", { name: "Tạo ví" }).click();

  // Mnemonic 12 từ hiện ra trong lưới.
  const words = page.locator("div.grid > div", { hasText: /^\d+\./ });
  await expect(words).toHaveCount(12, { timeout: 15_000 });

  // "Hoàn tất" bị khoá tới khi tick xác nhận đã sao lưu — chống mất ví.
  const done = page.getByRole("button", { name: "Hoàn tất" });
  await expect(done).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(done).toBeEnabled();
  await done.click();

  // Ví đã mở khoá + wagmi đã kết nối: panel hiện địa chỉ rút gọn.
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeVisible();
  // Lấy span ngay cạnh nhãn "Địa chỉ" trong panel — KHÔNG dùng
  // span.font-mono đầu trang vì navbar (WalletButton) cũng có một span
  // font-mono do RainbowKit format (4 ký tự + "…"), format khác app.
  await expect(
    page
      .getByText("Địa chỉ", { exact: true })
      .locator("..")
      .locator("span.font-mono"),
  ).toHaveText(/^0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/);
});

test("ví đã kết nối: tab Tài sản đọc được số dư qua connector", async ({
  page,
}) => {
  await createWallet(page);

  await page
    .getByRole("button", { name: "Tài sản", exact: true })
    .first()
    .click();

  // Không còn empty state -> connector đã báo "đã kết nối" cho wagmi.
  await expect(
    page.getByText("Kết nối ví để xem tài sản và thực hiện giao dịch."),
  ).toBeHidden();

  await expect(page.getByText("Tổng tài sản")).toBeVisible();
  // useBalance đi qua provider của connector: 0.01 ETH từ mock.
  await expect(page.getByText("ETH", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("khoá ví rồi mở lại bằng mật khẩu", async ({ page }) => {
  await createWallet(page);

  await page.getByRole("button", { name: "Khóa ví" }).click();
  await expect(
    page.getByRole("heading", { name: "Mở khóa ví in-app" }),
  ).toBeVisible();

  // Sai mật khẩu: AES-GCM auth tag không khớp -> báo lỗi, không mở.
  await page.locator('input[type="password"]').fill("sai-mat-khau-roi");
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await expect(page.getByText("Sai mật khẩu.")).toBeVisible({
    timeout: 15_000,
  });

  // Đúng mật khẩu: mở lại được, vault vẫn nằm trong IndexedDB sau khi khoá.
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeVisible({
    timeout: 15_000,
  });
});

test("ví sống sót qua reload (vault trong IndexedDB)", async ({ page }) => {
  await createWallet(page);
  const address = await page.locator("span.font-mono").first().innerText();

  await page.reload();
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();

  // Sau reload, mật khẩu phiên không còn trong RAM -> phải mở khoá lại.
  await expect(
    page.getByRole("heading", { name: "Mở khóa ví in-app" }),
  ).toBeVisible({ timeout: 15_000 });

  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Mở khóa" }).click();

  // Cùng một địa chỉ -> đúng vault cũ, không phải ví mới.
  await expect(page.locator("span.font-mono").first()).toHaveText(address, {
    timeout: 15_000,
  });
});

test("xóa ví cần xác nhận hai bước", async ({ page }) => {
  await createWallet(page);

  await page.getByRole("button", { name: "Xóa ví" }).click();
  // Bước 2: nút đổi nhãn, chưa xoá gì.
  const confirm = page.getByRole("button", { name: "Chắc chắn xóa?" });
  await expect(confirm).toBeVisible();
  await confirm.click();

  // Về menu ban đầu: không còn vault nào.
  await expect(page.getByRole("button", { name: "Tạo ví mới" })).toBeVisible();
});

test("đa tài khoản: thêm tài khoản thứ 2 rồi chuyển qua lại", async ({
  page,
}) => {
  await createWallet(page);

  // Địa chỉ tài khoản 1 (chip trên navbar).
  const chip = page.getByRole("button", { name: /^0x[0-9a-fA-F]/ });
  const addr1 = (await chip.first().textContent()) ?? "";

  // Thêm tài khoản 2 — danh sách có 2 dòng, dòng mới active.
  await page.getByRole("button", { name: "＋ Thêm tài khoản" }).click();
  const rows = page.getByRole("button", { name: /^Tài khoản \d/ });
  await expect(rows).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByText("Tài khoản 2")).toBeVisible();

  // Navbar chip đổi sang địa chỉ khác — connector đã reconnect bằng account 2.
  await expect(chip.first()).not.toHaveText(addr1, { timeout: 15_000 });

  // Chuyển về tài khoản 1: địa chỉ trở lại như ban đầu.
  await page.getByRole("button", { name: /^Tài khoản 1/ }).click();
  await expect(chip.first()).toHaveText(addr1, { timeout: 15_000 });

  // Sống sót qua reload: danh sách tài khoản vẫn 2 (persist trong vault).
  await page.reload();
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeVisible({
    timeout: 15_000,
  });
  await expect(rows).toHaveCount(2);
});

test("tự khóa khi rảnh (idle timeout)", async ({ page }) => {
  // Timeout test mặc định 30s không đủ cho việc đợi timeout 60s thật.
  test.setTimeout(150_000);
  // Cấu hình 1 phút — giá trị nhỏ nhất có thể qua localStorage, set TRƯỚC
  // khi app mount. Test này dài ~70s một cách cố ý: đợi thật hết timeout.
  await page.addInitScript(() =>
    localStorage.setItem("in-app-autolock-minutes", "1"),
  );
  await mockChain(page);
  // beforeEach đã vào /app rồi, nhưng addInitScript chỉ chạy từ navigation
  // KẾ TIẾP — reload để nó có tác dụng, rồi vào lại tab Ví (goto reset tab).
  await page.goto("/app");
  await page.waitForFunction(() =>
    (window as unknown as { __appReady?: boolean }).__appReady === true,
  );
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();
  await createWallet(page);
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeVisible();
  // (Không assert giá trị select: option "1 phút" không có trong danh sách
  // 5/10/30/không — cấu hình 1 phút chỉ dành cho test. Kiểm chứng thật là
  // hành vi tự khóa bên dưới.)

  // Không tương tác gì trong 70 giây (timeout 60s + dư) → tự khóa.
  await expect(page.getByRole("heading", { name: "Mở khóa ví in-app" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeHidden();
});

/** Tạo ví và đi hết luồng sao lưu — dùng cho các test cần ví sẵn sàng. */
async function createWallet(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Tạo ví mới" }).click();
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(PASSWORD);
  await passwords.nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: "Tạo ví" }).click();
  await page.getByRole("checkbox").check({ timeout: 15_000 });
  await page.getByRole("button", { name: "Hoàn tất" }).click();
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeVisible({
    timeout: 15_000,
  });
}
