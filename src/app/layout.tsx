import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// next/font tải font lúc build và tự host — không request ngoài lúc runtime,
// tương thích CSP font-src 'self'.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Web3 Wallet",
  description: "Ví Web3 non-custodial đa chain (EVM)",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${inter.variable} ${grotesk.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
        {/* Service worker: chỉ cache static bất biến; RPC/HTML đi thẳng mạng
            (xem public/sw.js — an toàn cho ví). Registration chạy sau paint
            nên không chậm lượt tải đầu. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})',
          }}
        />
      </body>
    </html>
  );
}
