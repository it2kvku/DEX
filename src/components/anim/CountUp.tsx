"use client";

import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * Số chạy mượt từ giá trị cũ lên giá trị mới (Anime.js).
 * Dùng cho tổng tài sản, số dư lớn.
 */
export function CountUp({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const counter = { v: prevRef.current };
    const animation = anime({
      targets: counter,
      v: value,
      duration,
      easing: "easeOutExpo",
      update: () => {
        el.textContent = formatRef.current(counter.v);
      },
    });
    prevRef.current = value;
    return () => animation.pause();
  }, [value, duration]);

  // Nội dung khởi tạo để tránh nhấp nháy trước khi effect chạy.
  return <span ref={ref}>{format(0)}</span>;
}
