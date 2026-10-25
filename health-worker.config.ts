import { defineWorker, triggers } from "cf/config";

/**
 * Health-check auxiliary worker — cron 10 phút/lần, không route công khai.
 * Bật alert dead-man switch:
 *   cf workers secrets update HEALTH_PING_URL --worker elytramc-dex-health
 */
export default defineWorker({
  name: "elytramc-dex-health",
  entrypoint: "./src/health-worker.ts",
  compatibilityDate: "2026-10-23",
  compatibilityFlags: ["nodejs_compat"],
  observability: { enabled: true },
  triggers: [triggers.scheduled({ schedule: "*/10 * * * *" })],
});
