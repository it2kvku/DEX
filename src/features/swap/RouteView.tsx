"use client";

import { ChevronRight } from "lucide-react";
import type { RoutePlan } from "./types";

/**
 * Route Preview: vẽ đường đi thật của lệnh swap.
 *
 * Dữ liệu đến từ hai nguồn khác nhau nên phần chú thích cũng khác:
 * - uniswap-v3: route do engine tự chọn, biết cả fee tier và số route đã
 *   chấm điểm.
 * - aggregator: parse từ includedSteps của LI.FI, biết tên DEX từng chặng
 *   nhưng không biết fee tier của pool bên dưới.
 */
export function RouteView({ route }: { route: RoutePlan }) {
  if (route.hops.length === 0) return null;

  const symbols = [
    route.hops[0].tokenInSymbol,
    ...route.hops.map((h) => h.tokenOutSymbol),
  ];

  return (
    <div className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">Đường đi (route)</span>
        {route.candidatesEvaluated > 0 && (
          <span className="text-[10px] uppercase tracking-wide text-neutral-600">
            chọn từ {route.candidatesEvaluated} route
          </span>
        )}
      </div>

      {/* Chuỗi token: USDC → WETH → UNI */}
      <div className="flex flex-wrap items-center gap-1">
        {symbols.map((sym, i) => (
          <span key={`${sym}-${i}`} className="flex items-center gap-1">
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 py-1 font-mono text-xs font-medium text-neutral-200">
              {sym}
            </span>
            {i < symbols.length - 1 && (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-neutral-600"
                aria-hidden
              />
            )}
          </span>
        ))}
      </div>

      {/* Chi tiết từng hop: DEX + fee tier */}
      <ul className="space-y-1">
        {route.hops.map((hop, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="truncate text-neutral-500">
              {hop.tokenInSymbol} → {hop.tokenOutSymbol}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-neutral-400">
              {hop.dex}
              {hop.feePpm !== null && (
                <span className="rounded bg-accent1/15 px-1.5 py-0.5 text-accent1">
                  {(hop.feePpm / 10_000).toFixed(2)}%
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {route.hops.length > 1 && route.source === "uniswap-v3" && (
        <p className="text-[11px] leading-snug text-neutral-600">
          Route nhiều chặng thắng vì tổng output sau khi trừ phí gas cao hơn
          swap trực tiếp.
        </p>
      )}
    </div>
  );
}
