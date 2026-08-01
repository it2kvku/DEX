import { test, expect } from "@playwright/test";
import { mockChain } from "./fixtures/rpc-mock";

/**
 * Smoke test luồng vào app: landing render, CTA điều hướng sang /app, và app
 * dựng được ở trạng thái CHƯA kết nối ví.
 *
 * Đây là bài test rẻ nhất mà giá trị cao nhất: nó chết ngay khi provider chain
 * (Wagmi → QueryClient → RainbowKit → InAppWallet → TxCenter) bị hỏng thứ tự,
 * khi một client component thiếu "use client", hoặc khi CSP mới chặn chính
 * bundle của app.
 */
test.beforeEach(async ({ page }) => {
  await mockChain(page);
});

test("landing hiển thị hero và điều hướng sang /app", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /Ví Web3 đa chain/ }),
  ).toBeVisible();

  // Nút trên navbar (không phải CTA trong hero) — lấy cái đầu tiên.
  await page.getByRole("button", { name: "Mở ứng dụng" }).first().click();

  await expect(page).toHaveURL(/\/app$/);
});

test("app dựng được khi chưa kết nối ví", async ({ page }) => {
  await page.goto("/app");

  // Empty state: chỉ hiện khi toàn bộ provider chain khởi tạo xong.
  await expect(
    page.getByText("Kết nối ví để xem tài sản và thực hiện giao dịch."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Kết nối ví để bắt đầu/ }),
  ).toBeVisible();

  // Navbar: nút ví + network selector.
  await expect(page.getByRole("button", { name: "Kết nối Ví" })).toBeVisible();
  await expect(
    page.locator('button[aria-haspopup="listbox"]'),
  ).toBeVisible();
});

test("đổi tab không cần ví: mỗi tab render nội dung riêng", async ({ page }) => {
  await page.goto("/app");
  await expect(
    page.getByRole("button", { name: /Kết nối ví để bắt đầu/ }),
  ).toBeVisible();

  // Tab "Ví" là tab duy nhất hoạt động khi chưa kết nối — nó chính là nơi tạo ví.
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Tạo ví mới" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import ví" })).toBeVisible();

  // Quay lại tab Tài sản: về đúng empty state, không mắc kẹt ở panel ví.
  await page
    .getByRole("button", { name: "Tài sản", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: /Kết nối ví để bắt đầu/ }),
  ).toBeVisible();
});

test("network selector đổi được sang Sepolia", async ({ page }) => {
  await page.goto("/app");
  await expect(
    page.getByRole("button", { name: /Kết nối ví để bắt đầu/ }),
  ).toBeVisible();

  const trigger = page.locator('button[aria-haspopup="listbox"]');
  await trigger.click();

  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  // 5 chain trong supportedChains.
  await expect(listbox.getByRole("option")).toHaveCount(5);

  await listbox.getByRole("option", { name: /Sepolia/ }).click();

  // wagmi đổi chain trong store dù chưa có ví -> label navbar phải theo.
  await expect(trigger).toContainText("Sepolia");
});
