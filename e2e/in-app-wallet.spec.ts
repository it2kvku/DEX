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
  await expect(page.locator("span.font-mono").first()).toHaveText(
    /^0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/,
  );
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
