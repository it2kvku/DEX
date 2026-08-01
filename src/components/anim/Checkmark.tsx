"use client";

import { useEffect, useRef } from "react";
import anime from "animejs";

/** Dấu tick vẽ dần (stroke animation) khi giao dịch thành công. */
export function Checkmark({ size = 64 }: { size?: number }) {
  const circleRef = useRef<SVGCircleElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const targets = [circleRef.current, pathRef.current].filter(Boolean);
    if (targets.length === 0) return;
    const animation = anime({
      targets,
      strokeDashoffset: [anime.setDashoffset, 0],
      duration: 800,
      delay: anime.stagger(250),
      easing: "easeOutCubic",
    });
    return () => animation.pause();
  }, []);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      aria-label="Thành công"
    >
      <circle
        ref={circleRef}
        cx="26"
        cy="26"
        r="23"
        stroke="url(#ckgrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        ref={pathRef}
        d="M15 27l7.5 7.5L37 20"
        stroke="url(#ckgrad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="ckgrad" x1="0" y1="0" x2="52" y2="52">
          <stop stopColor="#34d399" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}
