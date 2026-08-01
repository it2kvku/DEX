"use client";

import { Boxes } from "@/components/ui/background-boxes";

/**
 * Nền lưới boxes tương tác toàn trang (hover đổi màu ô ngẫu nhiên).
 *
 * - Mật độ giảm còn 80×48 (~3.800 ô) thay vì 150×100 = 15.000 ô của bản
 *   gốc — đủ phủ màn hình sau skew/scale, nhẹ hơn đáng kể cho nền full-page.
 * - Lớp overlay mask radial phía trên: tâm trong suốt (lộ lưới), mép mờ dần
 *   về màu nền — đúng cách dùng trong demo gốc, hợp phong cách tối giản.
 * - Overlay pointer-events-none nên hover vẫn xuyên xuống lưới.
 */
export function BoxesBackground() {
  return (
    <div className="pointer-events-auto fixed inset-0 z-0 overflow-hidden bg-[#0d0e12]">
      <Boxes rows={80} cols={48} />
      <div
        className="pointer-events-none absolute inset-0 bg-[#0d0e12] [mask-image:radial-gradient(transparent,white)]"
        aria-hidden
      />
    </div>
  );
}
