import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest chạy trong môi trường `node`, KHÔNG phải jsdom.
 *
 * Lý do: phần được test ở đây là tầng logic thuần — encode path Uniswap V3,
 * tính địa chỉ pool bằng CREATE2, quy đổi sqrtPriceX96 sang tỷ giá, dịch revert
 * reason, tách chữ ký EIP-712. Không có component nào trong danh sách này, nên
 * thêm jsdom chỉ làm test chậm mà không kiểm được gì thêm. Component/luồng
 * người dùng thuộc phần Playwright (chạy trên app thật, có ví thật).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
