"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  Wallet,
  Send,
  QrCode,
  Clock,
  Image as ImageIcon,
  KeyRound,
  Copy,
  Plug,
  Unplug,
  Coins,
  ArrowLeftRight,
  ShieldOff,
} from "lucide-react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { supportedChains } from "@/lib/chains";
import { ChainIcon } from "@/components/CryptoIcon";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

export type WalletTab =
  | "assets"
  | "swap"
  | "send"
  | "receive"
  | "history"
  | "nft"
  | "approvals"
  | "wallet";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: "Điều hướng" | "Mạng lưới" | "Thao tác";
  icon?: ComponentType<{ className?: string }>;
  chainId?: number;
  run: () => void;
}

const TAB_ITEMS: { tab: WalletTab; label: string; icon: PaletteItem["icon"] }[] =
  [
    { tab: "assets", label: "Tài sản", icon: Coins },
    { tab: "swap", label: "Hoán đổi (Swap)", icon: ArrowLeftRight },
    { tab: "send", label: "Gửi token", icon: Send },
    { tab: "receive", label: "Nhận (QR)", icon: QrCode },
    { tab: "history", label: "Lịch sử giao dịch", icon: Clock },
    { tab: "nft", label: "NFT", icon: ImageIcon },
    { tab: "approvals", label: "Quyền chi tiêu (allowance)", icon: ShieldOff },
    { tab: "wallet", label: "Ví in-app", icon: KeyRound },
  ];

/**
 * Command Palette ⌘K của ví (kiểu Raycast): fuzzy search, ↑/↓ + Enter,
 * Esc đóng. Hành động theo ngữ cảnh ví: chuyển tab, đổi mạng,
 * copy địa chỉ, kết nối/ngắt kết nối.
 */
export function WalletCommandPalette({
  open,
  onClose,
  onPickTab,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  onPickTab: (tab: WalletTab) => void;
  showToast: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { address, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const items = useMemo<PaletteItem[]>(() => {
    const tabs: PaletteItem[] = TAB_ITEMS.map((t) => ({
      id: `tab-${t.tab}`,
      label: t.label,
      hint: "Chuyển tab",
      group: "Điều hướng",
      icon: t.icon,
      run: () => onPickTab(t.tab),
    }));

    const chains: PaletteItem[] = supportedChains.map((c) => ({
      id: `chain-${c.id}`,
      label: `Chuyển sang ${c.name}`,
      hint: "Mạng lưới",
      group: "Mạng lưới",
      chainId: c.id,
      run: () => {
        switchChain({ chainId: c.id });
        showToast(`Đã yêu cầu chuyển sang ${c.name}`);
      },
    }));

    const actions: PaletteItem[] = [];
    if (isConnected && address) {
      actions.push({
        id: "copy-address",
        label: "Sao chép địa chỉ ví",
        hint: shortenAddress(address),
        group: "Thao tác",
        icon: Copy,
        run: () => {
          navigator.clipboard
            .writeText(address)
            .then(() => showToast("Đã sao chép địa chỉ"))
            .catch(() => showToast("Không sao chép được"));
        },
      });
      actions.push({
        id: "disconnect",
        label: "Ngắt kết nối ví",
        hint: "Đăng xuất khỏi phiên hiện tại",
        group: "Thao tác",
        icon: Unplug,
        run: () => {
          disconnectAsync().catch(() => {});
          showToast("Đã ngắt kết nối");
        },
      });
    } else {
      actions.push({
        id: "connect",
        label: "Kết nối ví",
        hint: "MetaMask, WalletConnect...",
        group: "Thao tác",
        icon: Plug,
        run: () => openConnectModal?.(),
      });
    }

    const all = [...tabs, ...chains, ...actions];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (i) =>
        i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q),
    );
  }, [
    query,
    address,
    isConnected,
    onPickTab,
    switchChain,
    disconnectAsync,
    openConnectModal,
    showToast,
  ]);

  // Reset khi mở + autofocus.
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  const pick = (item: PaletteItem) => {
    item.run();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[index]) {
      e.preventDefault();
      pick(items[index]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Render có nhóm: chèn tiêu đề nhóm khi đổi group.
  let lastGroup: string | null = null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-auto fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[16vh] backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/85 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-neutral-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm thao tác: gửi, đổi mạng, copy địa chỉ…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
              />
              <kbd className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-neutral-500">
                Esc
              </kbd>
            </div>

            <div className="max-h-[340px] overflow-y-auto p-1.5">
              {items.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-sm text-neutral-500">
                  Không tìm thấy thao tác.
                </p>
              ) : (
                items.map((item, i) => {
                  const showHeader = item.group !== lastGroup;
                  lastGroup = item.group;
                  const Icon = item.icon;
                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <p className="px-3.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                          {item.group}
                        </p>
                      )}
                      <button
                        onClick={() => pick(item)}
                        onMouseEnter={() => setIndex(i)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors",
                          i === index
                            ? "bg-white/[0.08]"
                            : "hover:bg-white/[0.04]",
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                          {item.chainId ? (
                            <ChainIcon chainId={item.chainId} size={16} />
                          ) : Icon ? (
                            <Icon className="h-3.5 w-3.5 text-neutral-400" />
                          ) : (
                            <Wallet className="h-3.5 w-3.5 text-neutral-400" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">
                            {item.label}
                          </span>
                          <span className="block truncate text-xs text-neutral-500">
                            {item.hint}
                          </span>
                        </span>
                        {i === index && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
