/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Có nhiều lockfile trên máy; ghim root về đúng thư mục dự án.
  outputFileTracingRoot: import.meta.dirname,
  // WalletConnect / các thư viện Web3 dùng một số module tối ưu cho browser.
  // externalizuong hóa 'pino-pretty' để tránh lỗi bundle không cần thiết.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // MetaMask SDK reference module React Native này; web không cần.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

/**
 * Content Security Policy cho ví Web3.
 *
 * - script-src: KHÔNG cho 'unsafe-eval'. Next dev cần 'unsafe-inline' cho
 *   hydration; production dùng nonce lý tưởng hơn nhưng cần custom server —
 *   ở đây giữ 'unsafe-inline' để tương thích, đánh đổi có ý thức.
 * - connect-src: chỉ mở cho RPC/API thật sự dùng (Alchemy, RPC công khai,
 *   CoinGecko, Etherscan, WalletConnect). Hạn chế exfiltrate dữ liệu.
 * - frame-ancestors 'none': chống clickjacking (song song X-Frame-Options).
 * - object-src 'none', base-uri 'self': giảm bề mặt injection.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" +
    (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://*.g.alchemy.com",
    "https://*.publicnode.com",
    "https://*.drpc.org",
    "https://1rpc.io",
    "https://*.binance.org",
    "https://polygon-rpc.com",
    "https://arb1.arbitrum.io",
    "https://api.coingecko.com",
    "https://api.etherscan.io",
    "https://li.quest",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
  ].join(" "),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default nextConfig;
