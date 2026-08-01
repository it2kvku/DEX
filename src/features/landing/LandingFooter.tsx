"use client";

import { Code2, MessageCircle, Globe } from "lucide-react";
import { ChainIcon } from "@/components/CryptoIcon";

const NETWORK_STATUS = [
  { chainId: 1, name: "Ethereum" },
  { chainId: 56, name: "BNB Chain" },
  { chainId: 137, name: "Polygon" },
  { chainId: 42161, name: "Arbitrum" },
];

/** Footer glass tối giản: brand + trạng thái mạng lưới + social links. */
export function LandingFooter() {
  return (
    <footer className="rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-6 backdrop-blur-xl">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, #ff007a, #b478ff 60%, #4c82fb)",
            }}
            aria-hidden
          />
          <div>
            <p className="font-display text-sm font-bold text-white">
              Web3 Wallet
            </p>
            <p className="text-[11px] text-neutral-500">
              Non-custodial · đa chain · mã nguồn đồ án
            </p>
          </div>
        </div>

        {/* Network status badges */}
        <div className="flex flex-wrap items-center gap-2">
          {NETWORK_STATUS.map((n) => (
            <span
              key={n.chainId}
              className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-neutral-300"
            >
              <ChainIcon chainId={n.chainId} size={14} />
              {n.name}
              <span className="relative ml-0.5 flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </span>
          ))}
        </div>

        {/* Social */}
        <div className="flex items-center gap-1.5">
          {[Code2, MessageCircle, Globe].map((Icon, i) => (
            <a
              key={i}
              href="#"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-400 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <Icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
