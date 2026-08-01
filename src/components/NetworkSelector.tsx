"use client";

import { useEffect, useRef, useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { supportedChains } from "@/lib/chains";
import { ChainIcon } from "./CryptoIcon";

/**
 * Dropdown chọn mạng ở Top Navbar, icon chain màu từ bộ cryptocurrency-color.
 * Hoạt động cả khi chưa kết nối ví (wagmi đổi chain trong store;
 * khi có ví thì yêu cầu ví switch).
 */
export function NetworkSelector() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = supportedChains.find((c) => c.id === chainId);

  // Đóng dropdown khi click ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ChainIcon chainId={chainId} size={20} />
        <span className="hidden sm:inline">
          {current?.name ?? `Chain ${chainId}`}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="glass absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl py-1.5 shadow-xl"
          role="listbox"
        >
          {supportedChains.map((c) => {
            const active = c.id === chainId;
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  switchChain({ chainId: c.id });
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? "bg-white/[0.08] text-white"
                    : "text-neutral-300 hover:bg-white/[0.05]"
                }`}
              >
                <ChainIcon chainId={c.id} size={20} />
                <span className="flex-1 truncate">{c.name}</span>
                {active && <span className="text-accent1">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
