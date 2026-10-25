/**
 * Health-check worker (auxiliary) — chạy cron 10 phút/lần, kiểm sức khỏe
 * production KHÔNG phụ thuộc người dùng nào mở app:
 *
 *   1. RPC proxy: eth_blockNumber trên MỖI chain qua chính /rpc/{id} public
 *      — đo cả trạng thái lẫn độ trễ; một chain chết là lỗi thật.
 *   2. LI.FI /status trả 200 (nguồn theo dõi bridge).
 *   3. Trang /app trả 200 (SSR Worker sống).
 *
 * Kết quả thất bại: console.error (hiện trong Workers Logs — observability
 * đã bật) + ping HEALTH_PING_URL nếu secret được set (healthchecks.io hoặc
 * bất kỳ webhook nào — tín hiệu "không ping đúng hạn" là cảnh báo).
 *
 * Deploy: auxiliary worker trong vite.config.ts (auxiliaryWorkers), không có
 * route công khai — chỉ cron gọi.
 */

interface Env {
  /** Tùy chọn: ping khi chạy xong (thành công hay thất bại) — dead-man switch. */
  HEALTH_PING_URL?: string;
}

const CHAINS = [1, 56, 137, 42161, 8453, 11155111];

async function checkRpc(chainId: number): Promise<string | null> {
  const start = Date.now();
  try {
    const res = await fetch(`https://elytramc.tech/rpc/${chainId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `chain ${chainId}: HTTP ${res.status}`;
    const json = (await res.json()) as { result?: string };
    if (!json.result) return `chain ${chainId}: không có result`;
    return null; // OK
  } catch (e) {
    return `chain ${chainId}: ${e instanceof Error ? e.message : "fetch lỗi"} (${Date.now() - start}ms)`;
  }
}

export default {
  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const failures: string[] = [];

        const rpcResults = await Promise.all(CHAINS.map(checkRpc));
        for (const r of rpcResults) if (r) failures.push(r);

        try {
          const app = await fetch("https://elytramc.tech/app", {
            signal: AbortSignal.timeout(15_000),
          });
          if (app.status !== 200) failures.push(`/app: HTTP ${app.status}`);
        } catch (e) {
          failures.push(`/app: ${e instanceof Error ? e.message : "fetch lỗi"}`);
        }

        try {
          const status = await fetch(
            "https://li.quest/v1/status?bridge=across&fromChain=1&toChain=42161&txHash=0x" +
              "00".repeat(32),
            { signal: AbortSignal.timeout(10_000) },
          );
          // Chỉ quan tâm HTTP-level: body là trạng thái tx giả, không bắt lỗi.
          if (status.status >= 500) failures.push(`li.quest: HTTP ${status.status}`);
        } catch {
          failures.push("li.quest: không gọi được");
        }

        const stamp = new Date().toISOString();
        if (failures.length > 0) {
          console.error(`[health] FAIL @${stamp}: ${failures.join(" | ")}`);
        } else {
          console.log(`[health] OK @${stamp}: 6 chains + app + li.quest`);
        }

        if (env.HEALTH_PING_URL) {
          try {
            await fetch(env.HEALTH_PING_URL, {
              method: failures.length > 0 ? "POST" : "GET",
              body: failures.length > 0 ? failures.join("\n") : undefined,
              signal: AbortSignal.timeout(10_000),
            });
          } catch {
            console.error("[health] ping HEALTH_PING_URL thất bại");
          }
        }
      })(),
    );
  },
};
