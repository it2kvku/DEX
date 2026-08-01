"use client";

import { useEffect, useRef, type ReactNode } from "react";
import anime from "animejs";

/**
 * Hiệu ứng xuất hiện lần lượt (stagger fade-up) cho các phần tử con.
 * Đổi `watch` (vd: tab đang chọn) để chạy lại hiệu ứng khi nội dung đổi.
 */
export function Reveal({
  children,
  watch,
  className = "",
}: {
  children: ReactNode;
  watch?: unknown;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.children.length === 0) return;
    const animation = anime({
      targets: el.children,
      opacity: [0, 1],
      translateY: [16, 0],
      delay: anime.stagger(70),
      duration: 550,
      easing: "easeOutCubic",
    });
    return () => animation.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
