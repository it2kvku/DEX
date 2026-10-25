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
  await page.goto("/app");
  // Chờ hydration toàn cục trước khi click bất kỳ nút nào: trên server lạnh
  // (workerd vinext), text SSR hiện ra trước khi React gắn listener — click
  // vào lúc đó là click vô tác dụng, test đỏ ngẫu nhiên.
  await page.waitForFunction(
    () => (window as unknown as { __uiReady?: boolean }).__uiReady === true,
  );
});

test("landing hiển thị hero và điều hướng sang /app", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /Ví Web3 đa chain/ }),
  ).toBeVisible();

  // goto("/") là navigation mới — chờ hydration lại từ đầu trước khi click.
  await page.waitForFunction(
    () => (window as unknown as { __uiReady?: boolean }).__uiReady === true,
  );

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

  // Navbar: nút ví + network selector. `.first()`: RainbowKit mới render
  // thêm một nút "Kết nối Ví" trùng tên trong modal ẩn phía cuối DOM.
  await expect(
    page.getByRole("button", { name: "Kết nối Ví" }).first(),
  ).toBeVisible();
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
  // 6 chain trong supportedChains (Base được thêm ở P2).
  await expect(listbox.getByRole("option")).toHaveCount(6);

  await listbox.getByRole("option", { name: /Sepolia/ }).click();

  // wagmi đổi chain trong store dù chưa có ví -> label navbar phải theo.
  await expect(trigger).toContainText("Sepolia");
});

test('breakpoint tab: md dùng pill nổi, không đè cụm nút phải', async ({
  page,
}) => {
  // Regression P6: thêm tab LP làm dãy tab giữa dài ra — ở md (768-1023px)
  // absolute centering đè lên nút ⌘K + ví. Giờ md dùng pill nổi dưới,
  // tab giữa chỉ hiện từ lg.
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/app');
  await page.waitForFunction(
    () => (window as unknown as { __uiReady?: boolean }).__uiReady === true,
  );

  // Tab giữa (desktop) ẨN ở md...
  const centerTabs = page.locator('header div.absolute');
  await expect(centerTabs).toBeHidden();
  // ...pill nổi DƯỚI hiện và cuộn được qua 9 tab.
  const pill = page.locator('div.fixed.bottom-4');
  await expect(pill).toBeVisible();
  await expect(pill.getByRole('button', { name: 'LP', exact: true })).toBeVisible();
});
