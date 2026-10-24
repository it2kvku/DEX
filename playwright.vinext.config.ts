import { defineConfig, devices } from "@playwright/test";

/**
 * Bản sao của playwright.config.ts nhưng chạy trên build VINEXT (Vite +
 * Cloudflare Worker) — đúng thứ sẽ deploy lên Cloudflare.
 *
 * Vì sao cần cả hai bộ e2e: hai build pipeline là hai chương trình khác nhau.
 * Next build có thể xanh khi vinext build đỏ (và ngược lại) — ví dụ Worker
 * thiếu binding, route handler không được bundle, hay CSP chặn asset. Đã có
 * lần thực tế: header rule bị "Parsed" nhưng pipeline render bỏ qua.
 *
 * Port 3100 khác hẳn port 3000 của bản Next: `reuseExistingServer` sẽ không
 * bao giờ nhầm server Next đang chạy thành server vinext (loại false-green
 * khó phát hiện nhất).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Luôn 1 worker: khác với server Node của bản Next, `vite preview` chạy
  // workerd cục bộ và nghẽn rõ rệt khi 8 browser cùng tải trang cùng lúc
  // (request treo tới timeout). CI của bản Next cũng đã dùng 1 worker, nên
  // đây giữ nguyên chuẩn đó cho cả hai bộ.
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Build vinext rồi preview: vite preview chạy Worker thật trong workerd
    // (qua @cloudflare/vite-plugin), nên e2e chạm đúng runtime sẽ deploy.
    command:
      "npm run build:vinext && npm run start:vinext -- --host 127.0.0.1 --port 3100 --strictPort",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
