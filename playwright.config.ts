import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright chạy trên bản BUILD PRODUCTION, không phải `next dev`.
 *
 * Lý do: dev server bật React Strict Mode double-render, HMR overlay và không
 * áp header CSP giống production. Một smoke test qua được dev nhưng chết ở
 * production là loại lỗi tệ nhất — nên test luôn đúng thứ sẽ deploy.
 *
 * `webServer` để Playwright tự build + start rồi tự tắt. Trên máy dev,
 * `reuseExistingServer` cho phép dùng server đang chạy sẵn để không phải
 * build lại 30 giây mỗi lần.
 */
export default defineConfig({
  testDir: "./e2e",
  // Mỗi spec chạy tuần tự trong file, các file song song.
  fullyParallel: true,
  // CI không được phép có test.only bị bỏ quên.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 1 worker trên CI: app gọi RPC/CoinGecko thật, nhiều worker dễ bị rate-limit.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://127.0.0.1:3000",
    // Trace chỉ khi retry: đủ để điều tra lỗi flaky mà không phình artifact.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Nền WebGL/canvas + framer-motion khiến screenshot không ổn định;
    // không dùng visual comparison nên chỉ cần viewport cố định.
    viewport: { width: 1280, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run build && npm run start -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    // Build Next lần đầu (không cache) có thể mất hơn 2 phút.
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
