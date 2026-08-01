"use client";

import { useRef, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { CryptoIcon } from "@/components/CryptoIcon";
import { Send, QrCode, ArrowLeftRight } from "lucide-react";

const MOCK_TOKENS = [
  { symbol: "ETH", name: "Ethereum", amount: "1.2847", usd: "$4,120.55" },
  { symbol: "USDT", name: "Tether USD", amount: "5,230.00", usd: "$5,230.00" },
  { symbol: "USDC", name: "USD Coin", amount: "3,108.35", usd: "$3,108.35" },
];

/**
 * Mockup giao diện ví dạng glass card nghiêng 3D theo chuột
 * (perspective + rotateX/rotateY spring) + trôi nhẹ khi idle.
 * Dữ liệu mock — chỉ để minh họa trên landing.
 */
export function TiltMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 160, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 160, damping: 18 });

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ry.set(px * 14);
    rx.set(-py * 12);
  };

  const reset = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={reset}
      style={{ perspective: 1100 }}
      className="relative mx-auto w-full max-w-sm"
    >
      {/* Glow phía sau mockup */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent1/[0.12] blur-[100px]"
        aria-hidden
      />

      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="rounded-3xl border border-white/[0.1] bg-zinc-950/70 p-5 shadow-2xl backdrop-blur-xl"
      >
        {/* Header mock */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, #ff007a, #b478ff 60%, #4c82fb)",
              }}
            />
            <span className="font-display text-sm font-bold text-white">
              Web3 Wallet
            </span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            0x8f3...c21A
          </span>
        </div>

        {/* Tổng tài sản */}
        <div className="mt-5">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">
            Tổng tài sản
          </p>
          <p className="mt-1 font-display text-3xl font-bold text-white">
            $12,458.90
          </p>
          <p className="mt-0.5 text-xs text-emerald-400">+2.34% hôm nay</p>
        </div>

        {/* Quick actions */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { icon: Send, label: "Gửi" },
            { icon: QrCode, label: "Nhận" },
            { icon: ArrowLeftRight, label: "Swap" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.04] py-2.5"
            >
              <Icon className="h-4 w-4 text-accent1" />
              <span className="text-[10px] text-neutral-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Token rows */}
        <div className="mt-4 space-y-2">
          {MOCK_TOKENS.map((t) => (
            <div
              key={t.symbol}
              className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
            >
              <CryptoIcon symbol={t.symbol} size={26} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">{t.symbol}</p>
                <p className="truncate text-[10px] text-neutral-500">
                  {t.name}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs text-white">{t.amount}</p>
                <p className="text-[10px] text-neutral-500">{t.usd}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
