"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/**
 * Error boundary ở tầng route (App Router tự bọc `page.tsx` bằng file này).
 *
 * Bắt được: lỗi render trong Client Component, lỗi throw từ Server Component
 * của route này. KHÔNG bắt được lỗi trong `layout.tsx` cùng cấp — đó là việc
 * của `global-error.tsx`.
 *
 * `reset()` re-mount lại cây component của route. Nó chỉ chữa được lỗi thoáng
 * qua (RPC chớp nhoáng, response méo một lần); lỗi do bug thì render lại vẫn
 * throw, nên có thêm đường về trang chủ.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-zinc-950/70 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
        </div>

        <h1 className="mt-4 font-display text-lg font-semibold text-white">
          Có lỗi xảy ra
        </h1>
        <p className="mt-1.5 text-sm text-[#98a1c0]">
          Giao diện ví gặp lỗi không mong đợi. Tài sản của bạn không bị ảnh
          hưởng — khoá riêng tư vẫn nằm trong ví, ứng dụng chỉ đọc dữ liệu
          on-chain.
        </p>

        <p className="mt-3 break-words rounded-xl border border-white/[0.06] bg-black/40 p-2.5 font-mono text-[11px] text-neutral-500">
          {error.message.slice(0, 300)}
          {/* digest là mã Next sinh ra cho lỗi phía server — hữu ích khi tra log. */}
          {error.digest && (
            <span className="mt-1 block text-neutral-600">
              digest: {error.digest}
            </span>
          )}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={reset}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent1 px-4 py-2.5 text-sm font-semibold text-white outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Thử lại
          </button>
          {/* Cố tình dùng <a> chứ không phải <Link>: ở đây ta ĐANG ở trong một
              cây component đã lỗi. <Link> điều hướng client-side, giữ nguyên
              toàn bộ state cũ (wagmi store, QueryClient, provider có thể đã
              hỏng) — đúng thứ vừa gây lỗi. <a> nạp lại cả document nên mọi
              state được dựng từ đầu, đó mới là "đường thoát" thật. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-2.5 text-sm font-semibold text-neutral-200 outline-none transition-colors hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <Home className="h-3.5 w-3.5" /> Trang chủ
          </a>
        </div>
      </div>
    </main>
  );
}
