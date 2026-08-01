"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Send,
  QrCode,
  LineChart,
  Clock,
  type LucideIcon,
} from "lucide-react";

interface Slide {
  icon: LucideIcon;
  title: string;
  desc: string;
  gradient: string;
}

const SLIDES: Slide[] = [
  {
    icon: Send,
    title: "Gửi token",
    desc: "Validate địa chỉ + ENS, ước tính phí EIP-1559 kèm quy đổi USD trước khi ký.",
    gradient: "from-[#ff007a]/40 via-fuchsia-500/25 to-transparent",
  },
  {
    icon: QrCode,
    title: "Nhận an toàn",
    desc: "QR code + copy một chạm, cảnh báo đúng mạng để không mất tài sản.",
    gradient: "from-[#4c82fb]/40 via-sky-500/25 to-transparent",
  },
  {
    icon: LineChart,
    title: "Phân tích tài sản",
    desc: "Tổng danh mục quy đổi USD, biến động 24h theo thời gian thực từ CoinGecko.",
    gradient: "from-[#b478ff]/40 via-violet-500/25 to-transparent",
  },
  {
    icon: Clock,
    title: "Lịch sử minh bạch",
    desc: "Mọi giao dịch in/out kèm trạng thái và link block explorer từng hash.",
    gradient: "from-emerald-500/35 via-teal-500/25 to-transparent",
  },
];

/** Carousel kéo-thả (framer drag) giới thiệu các năng lực chính của ví. */
export function FeatureCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragLimit, setDragLimit] = useState(0);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;
      setDragLimit(Math.max(0, track.scrollWidth - viewport.offsetWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={viewportRef} className="overflow-hidden">
      <motion.div
        ref={trackRef}
        drag="x"
        dragConstraints={{ left: -dragLimit, right: 0 }}
        dragElastic={0.08}
        className="flex cursor-grab gap-4 active:cursor-grabbing"
      >
        {SLIDES.map((s) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              whileHover={{ scale: 1.01 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="relative h-48 w-[300px] shrink-0 overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-5 backdrop-blur-xl sm:w-[340px]"
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.gradient}`}
                aria-hidden
              />
              <div className="relative flex h-full flex-col justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/30 backdrop-blur">
                  <Icon className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-300">
                    {s.desc}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
