import { test, expect } from "@playwright/test";
import { mockChain } from "./fixtures/rpc-mock";

/**
 * Command palette ⌘K: mở bằng phím, fuzzy filter, điều hướng ↑/↓ + Enter,
 * Esc đóng.
 *
 * Đáng test end-to-end vì nó là component duy nhất nghe keydown ở tầng
 * `window` và phải nhường phím cho input đang focus — loại logic mà unit test
 * trên jsdom kiểm được rất hình thức, còn bug thật chỉ lộ ra trên trình duyệt
 * thật (thứ tự event, preventDefault, focus).
 */
test.beforeEach(async ({ page }) => {
  await mockChain(page);
  await page.goto("/app");
  await expect(
    page.getByRole("button", { name: /Kết nối ví để bắt đầu/ }),
  ).toBeVisible();
});

const palette = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Command palette" });

test("Ctrl+K mở palette, Esc đóng", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
});

test('phím "/" mở palette, nhưng không mở khi đang gõ trong input', async ({
  page,
}) => {
  await page.keyboard.press("/");
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();

  // Sang tab Ví để có input thật (ô mật khẩu) rồi gõ "/" vào đó.
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();
  await page.getByRole("button", { name: "Tạo ví mới" }).click();

  const pwd = page.locator('input[type="password"]').first();
  await pwd.click();
  await pwd.type("a/b");

  await expect(palette(page)).toBeHidden();
  await expect(pwd).toHaveValue("a/b");
});

test("fuzzy filter thu hẹp danh sách theo từ khoá", async ({ page }) => {
  await page.keyboard.press("Control+k");
  const dialog = palette(page);

  const searchBox = dialog.getByPlaceholder(/Tìm thao tác/);
  await searchBox.fill("sepolia");

  // Chỉ còn đúng một hành động: chuyển mạng Sepolia.
  await expect(dialog.getByText("Chuyển sang Sepolia")).toBeVisible();
  await expect(dialog.getByText("Chuyển sang Ethereum")).toBeHidden();

  await searchBox.fill("xyzkhongtontai");
  await expect(dialog.getByText("Không tìm thấy thao tác.")).toBeVisible();
});

test("Enter chạy hành động đang chọn: điều hướng sang tab Swap", async ({
  page,
}) => {
  await page.keyboard.press("Control+k");
  const dialog = palette(page);

  await dialog.getByPlaceholder(/Tìm thao tác/).fill("hoán đổi");
  await page.keyboard.press("Enter");

  // Palette đóng và tab Swap được chọn. Chưa kết nối ví -> vẫn là empty state,
  // nên xác nhận qua trạng thái "đang chọn" của tab.
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Swap", exact: true }).first(),
  ).toHaveClass(/text-white/);
});

test("↓ di chuyển lựa chọn trong palette", async ({ page }) => {
  await page.keyboard.press("Control+k");
  const dialog = palette(page);

  // Mục đầu tiên (Tài sản) được chọn sẵn: nó có icon Enter ở cuối hàng.
  const rows = dialog.locator("button", { hasText: "Tài sản" });
  await expect(rows.first()).toHaveClass(/bg-white\/\[0\.08\]/);

  await page.keyboard.press("ArrowDown");
  await expect(
    dialog.locator("button", { hasText: "Hoán đổi (Swap)" }).first(),
  ).toHaveClass(/bg-white\/\[0\.08\]/);
});
