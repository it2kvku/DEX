"use client";

import dynamic from "next/dynamic";

/**
 * Nạp Three.js background bằng dynamic import (client-only, không SSR)
 * để bundle chính nhẹ và first paint nhanh — three.js chỉ tải sau khi
 * trang đã hiển thị.
 */
const Background = dynamic(() => import("./Background"), {
  ssr: false,
  loading: () => null,
});

export function BackgroundCanvas() {
  return <Background />;
}
