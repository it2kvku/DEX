"use client";

/**
 * Nền Aurora + Background Paths cho toàn app ví:
 * - 3 blob gradient blur lớn trôi chậm theo palette ví (hồng/tím/xanh),
 *   transform-only để chạy trên GPU.
 * - Các đường SVG phát sáng chạy chậm (stroke-dashoffset animation).
 * - Vignette radial để Main Card ở trung tâm nổi bật.
 * Toàn bộ pointer-events-none, cố định sau nội dung.
 */
export function AuroraBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0a0a10]"
      aria-hidden
    >
      {/* Aurora blobs — palette ví: accent hồng, tím, xanh */}
      <div
        className="aurora-blob left-[-12%] top-[-18%] h-[460px] w-[620px] bg-[#ff007a]/[0.14]"
        style={{ animation: "aurora-a 26s ease-in-out infinite alternate" }}
      />
      <div
        className="aurora-blob right-[-10%] top-[8%] h-[380px] w-[520px] bg-[#4c82fb]/[0.12]"
        style={{ animation: "aurora-b 32s ease-in-out infinite alternate" }}
      />
      <div
        className="aurora-blob bottom-[-22%] left-[22%] h-[420px] w-[680px] bg-[#b478ff]/[0.11]"
        style={{ animation: "aurora-c 38s ease-in-out infinite alternate" }}
      />

      {/* Background paths — đường routing phát sáng */}
      <svg
        className="absolute inset-0 h-full w-full opacity-25"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient
            id="wallet-line-1"
            x1="0"
            y1="0"
            x2="1440"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ff007a" stopOpacity="0" />
            <stop offset="0.35" stopColor="#ff007a" stopOpacity="0.85" />
            <stop offset="0.7" stopColor="#4c82fb" stopOpacity="0.75" />
            <stop offset="1" stopColor="#4c82fb" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="wallet-line-2"
            x1="1440"
            y1="0"
            x2="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#b478ff" stopOpacity="0" />
            <stop offset="0.4" stopColor="#b478ff" stopOpacity="0.65" />
            <stop offset="1" stopColor="#ff007a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M-60 240 C 280 150, 520 400, 830 310 S 1290 170, 1520 260"
          stroke="url(#wallet-line-1)"
          strokeWidth="1.2"
          strokeDasharray="5 13"
          style={{ animation: "hub-dash 16s linear infinite" }}
        />
        <path
          d="M-40 620 C 340 700, 620 480, 940 560 S 1340 700, 1500 620"
          stroke="url(#wallet-line-2)"
          strokeWidth="1"
          strokeDasharray="4 16"
          style={{ animation: "hub-dash 22s linear infinite" }}
        />
        <path
          d="M-30 430 C 260 380, 560 520, 900 430 S 1320 340, 1490 420"
          stroke="url(#wallet-line-1)"
          strokeWidth="0.8"
          strokeDasharray="3 18"
          style={{ animation: "hub-dash 28s linear infinite" }}
        />
      </svg>

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(1100px_620px_at_50%_-8%,transparent,rgba(10,10,16,0.74))]" />
    </div>
  );
}
