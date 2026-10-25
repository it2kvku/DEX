"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/lib/wagmi";
import { InAppWalletProvider } from "@/features/in-app-wallet/InAppWalletContext";
import { TxCenterProvider } from "@/features/tx/TxCenter";

import "@rainbow-me/rainbowkit/styles.css";

export function Providers({ children }: { children: ReactNode }) {
  // Tạo QueryClient một lần cho mỗi phiên (tránh tạo lại khi re-render).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000, // dữ liệu blockchain: coi là "tươi" trong 10s
            retry: 2,
          },
        },
      }),
  );

  // Sentry chỉ nạp khi có DSN — không có thì KHÔNG tốn byte nào thêm (dynamic
  // import tách chunk riêng và không bao giờ được fetch). Lỗi production từ
  // đây tự về Sentry thay vì vô hình (đã từng có bug GeckoTerminal đổi shape
  // response chỉ phát hiện được bằng smoke test tay).
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    void import("@sentry/react").then((Sentry) => {
      Sentry.init({
        dsn,
        // Chỉ bắt lỗi — không trace hiệu năng (tiết kiệm quota, đủ mục đích).
        tracesSampleRate: 0,
        // Môi trường: production vs preview deployment.
        environment: process.env.NODE_ENV,
      });
    });
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#ff007a",
            accentColorForeground: "white",
            borderRadius: "large",
          })}
          modalSize="compact"
        >
          <InAppWalletProvider>
            {/* TxCenter nằm ngoài mọi tab để tx đang chờ không mất khi đổi tab.
                Phải ở trong WagmiProvider + QueryClientProvider vì nó dùng
                config để lấy client và invalidate query sau khi tx vào block. */}
            <TxCenterProvider>{children}</TxCenterProvider>
          </InAppWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
