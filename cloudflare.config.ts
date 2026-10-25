import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "elytramc-dex",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-23",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["elytramc.tech"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    // Workers Logs: exception + console.log của Worker hiện trong dashboard
    // (cf workers tail / observability) — lỗi phía server (vd RPC proxy)
    // từ đây không còn vô hình.
    observability: { enabled: true },
    env: {
      ASSETS: bindings.assets(),
      // Secret server-side cho RPC proxy (/rpc/{chainId}). KHÔNG dùng biến
      // NEXT_PUBLIC_* cho việc này — biến public bị inline vào bundle client.
      // Set trước khi deploy:  cf workers secrets update ALCHEMY_API_KEY
      // (hoặc dashboard). Local dev không có secret → proxy fallback sang
      // RPC công khai, chỉ warn.
      ALCHEMY_API_KEY: bindings.secret(),
    },
  }),
});
