import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import healthWorkerConfig from "./health-worker.config.ts";

// Build vinext (deploy Cloudflare Worker) LUÔN bật RPC proxy same-origin:
// client gọi /rpc/{chainId}, Worker giữ Alchemy key trong secret server-side
// (src/app/rpc/[chainId]/route.ts). vinext quét process.env lúc chạy plugin
// config hook — muộn hơn module scope này — nên flag được inline vào bundle
// client đúng như một biến NEXT_PUBLIC_ thông thường.
// Build Next (next dev/next build) không đọc file này → flag tắt → RPC trực tiếp.
process.env.NEXT_PUBLIC_RPC_PROXY ||= "1";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
      // Worker phụ: health-check cron (src/health-worker.ts) — deploy cùng
      // bản chính, không route công khai.
      auxiliaryWorkers: [{ config: healthWorkerConfig }],
    }),
  ],
});
