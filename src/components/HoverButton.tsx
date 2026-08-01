"use client";

import { useRef, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Interactive Hover Button cho CTA chính của ví: hút nhẹ theo chuột
 * (magnetic pull, spring) + vệt gradient shimmer quét ngang khi hover.
 */
export function HoverButton({
  children,
  onClick,
  disabled,
  className = "",
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: "primary" | "glass";
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 320, damping: 22 });
  const y = useSpring(my, { stiffness: 320, damping: 22 });

  const onMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Kéo tối đa ±5px về phía con trỏ.
    mx.set(((e.clientX - rect.left) / rect.width - 0.5) * 10);
    my.set(((e.clientY - rect.top) / rect.height - 0.5) * 10);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.button
      ref={ref}
      style={{ x, y }}
      onMouseMove={onMouseMove}
      onMouseLeave={reset}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "bg-accent1 text-white shadow-glow-sm hover:shadow-glow"
          : "border border-white/[0.08] bg-white/[0.05] text-neutral-200 backdrop-blur-xl hover:bg-white/[0.09]",
        className,
      )}
    >
      {/* Vệt shimmer quét ngang khi hover */}
      <span
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100"
        style={{ animation: "hub-shimmer 1.1s ease infinite" }}
        aria-hidden
      />
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
    </motion.button>
  );
}
