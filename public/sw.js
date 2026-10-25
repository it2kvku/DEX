/**
 * Service worker tối giản cho PWA — nguyên tắc AN TOÀN TRƯỚC HẾT với ví Web3:
 *
 * - CHỈ cache-first cho static assets bất biến (_next/static có hash trong
 *   tên, icon, manifest). Hash đổi là key đổi — không có vấn đề version skew.
 * - MỌI request khác (HTML, /rpc/*, JSON-RPC tới RPC/Explorer/CoinGecko,
 *   WalletConnect WebSocket đã ngoài scope fetch) đi THẲNG mạng — không
 *   cache, không stale-while-revalidate. Số dư/quote trả từ cache là nguy
 *   hiểm thật sự cho ví; tuyệt đối không làm.
 * - Không precache HTML shell: app là SPA động qua wagmi state, cache HTML
 *   cũ sau deploy chỉ gây lệch phiên bản client/server (vinext đã có build
 *   id check riêng).
 *
 * Self-hosted trên cùng origin, kích hoạt bằng registration trong layout.
 */

const VERSION = "v1";
const CACHE = `shell-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/manifest.json", "/icon.png", "/icon.svg"]))
      // Không bắt người dùng chờ: SW active ngay cả khi icon lỗi.
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Static bất biến: cache-first. Hash trong tên file là key version.
  const isImmutableStatic =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/manifest.json" ||
      url.pathname.startsWith("/brand/") ||
      url.pathname.startsWith("/nft/"));

  if (!isImmutableStatic) return; // Mọi thứ khác: mạng thuần.

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
