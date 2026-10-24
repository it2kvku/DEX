import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  sepolia,
  type Chain,
} from "wagmi/chains";
import { http, fallback, type Transport } from "viem";

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";

/**
 * Danh sách chain được hỗ trợ.
 * Sepolia để test luồng gửi/nhận bằng token miễn phí từ faucet.
 */
export const supportedChains = [
  mainnet,
  bsc,
  polygon,
  arbitrum,
  sepolia,
] as const satisfies readonly [Chain, ...Chain[]];

export type SupportedChainId = (typeof supportedChains)[number]["id"];

/**
 * URL RPC của Alchemy theo từng chain. Chỉ dùng khi có API key.
 * Alchemy chưa hỗ trợ BSC public, nên BSC sẽ dựa vào RPC mặc định + fallback.
 */
function alchemyUrl(chainId: number): string | null {
  if (!ALCHEMY_KEY) return null;
  const subdomain: Record<number, string> = {
    [mainnet.id]: "eth-mainnet",
    [polygon.id]: "polygon-mainnet",
    [arbitrum.id]: "arb-mainnet",
    [sepolia.id]: "eth-sepolia",
  };
  const prefix = subdomain[chainId];
  return prefix ? `https://${prefix}.g.alchemy.com/v2/${ALCHEMY_KEY}` : null;
}

/**
 * RPC công khai dự phòng cho mỗi chain (nguồn thứ hai khi Alchemy nghẽn/sập).
 */
// Chỉ dùng các RPC cho phép CORS từ browser (llamarpc/ankr chặn origin lạ).
// Exported cho RPC proxy trên Worker (src/app/rpc/[chainId]/route.ts) —
// danh sách upstream phải đồng bộ với transport phía client.
export const publicFallbackRpc: Record<number, string[]> = {
  [mainnet.id]: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.drpc.org",
    "https://1rpc.io/eth",
  ],
  [bsc.id]: [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed1.binance.org",
    "https://bsc.drpc.org",
  ],
  [polygon.id]: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon-rpc.com",
    "https://polygon.drpc.org",
  ],
  [arbitrum.id]: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.drpc.org",
  ],
  [sepolia.id]: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.drpc.org",
  ],
};

/**
 * Build vinext/Cloudflare bật RPC proxy same-origin (vite.config.ts set flag
 * này lúc build). Khi bật, transport đầu tiên của mọi chain là `/rpc/{chainId}`
 * do Worker serve — Alchemy key nằm trong secret server-side thay vì trong
 * bundle client. Build Next (next dev/next build) không set flag → dùng
 * NEXT_PUBLIC_ALCHEMY_API_KEY trực tiếp như cũ.
 */
const RPC_PROXY_ENABLED = process.env.NEXT_PUBLIC_RPC_PROXY === "1";

function proxyRpcUrl(chainId: number): string {
  // Browser cần URL tuyệt đối (fetch không có base khi SSR); phía server
  // transport không bao giờ được gọi (mọi query chạy client-side) nên URL
  // tương đối ở đó vô hại.
  if (typeof window !== "undefined") {
    return new URL(`/rpc/${chainId}`, window.location.origin).toString();
  }
  return `/rpc/${chainId}`;
}

/**
 * Tạo transport có fallback cho từng chain:
 * - Build vinext: Worker proxy đứng trước, rồi tới các RPC công khai.
 * - Build Next: Alchemy (nếu có key) đứng trước, rồi tới các RPC công khai.
 * Nếu một node lỗi/nghẽn, viem tự chuyển sang node kế tiếp.
 */
export function buildTransports(): Record<number, Transport> {
  const transports: Record<number, Transport> = {};
  for (const chain of supportedChains) {
    const urls: string[] = [];
    if (RPC_PROXY_ENABLED) {
      // Proxy đã nắm Alchemy key server-side — không nhân đôi key client.
      urls.push(proxyRpcUrl(chain.id));
    } else {
      const primary = alchemyUrl(chain.id);
      if (primary) urls.push(primary);
    }
    urls.push(...(publicFallbackRpc[chain.id] ?? []));

    transports[chain.id] = fallback(
      urls.map((url) => http(url, { timeout: 10_000 })),
      { rank: false },
    );
  }
  return transports;
}

/** URL block explorer cho một tx hash (dùng ở History module + màn hình xác nhận). */
export function explorerTxUrl(chainId: number, hash: string): string | null {
  const chain = supportedChains.find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

/** URL block explorer cho một địa chỉ. */
export function explorerAddressUrl(
  chainId: number,
  address: string,
): string | null {
  const chain = supportedChains.find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : null;
}
