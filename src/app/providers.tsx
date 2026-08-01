"use client";

import { useState, type ReactNode } from "react";
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
