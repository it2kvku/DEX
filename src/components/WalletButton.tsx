"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { shortenAddress } from "@/lib/format";

/**
 * Nút ví trên Top Navbar (thay ConnectButton mặc định để kiểm soát style):
 * - Chưa kết nối: pill hồng #FF007A, chữ trắng đậm, bo tròn 999px.
 * - Đã kết nối: pill xám nhạt hiện địa chỉ rút gọn, bấm mở account modal.
 */
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const connected = !!(mounted && account && chain);
        return (
          <div
            {...(!mounted && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const },
            })}
          >
            {connected ? (
              <button
                onClick={openAccountModal}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-mono">
                  {account?.displayName ?? shortenAddress(account?.address)}
                </span>
              </button>
            ) : (
              <button
                onClick={openConnectModal}
                className="group relative overflow-hidden rounded-full bg-accent1 px-4 py-2 text-sm font-bold text-white shadow-glow-sm outline-none transition-all duration-200 hover:brightness-110 hover:shadow-glow focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.97]"
              >
                <span
                  className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100"
                  style={{ animation: "hub-shimmer 1.1s ease infinite" }}
                  aria-hidden
                />
                <span className="relative z-10">Kết nối Ví</span>
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
