"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { Wallet, Lock, Command } from "lucide-react";
import { supportedChains } from "@/lib/chains";
import { AssetList } from "@/features/asset/AssetList";
import { Swap } from "@/features/swap/Swap";
import { Send } from "@/features/transaction/Send";
import { Receive } from "@/features/transaction/Receive";
import { History } from "@/features/history/History";
import { NftGallery } from "@/features/nft/NftGallery";
import { InAppWalletPanel } from "@/features/in-app-wallet/InAppWalletPanel";
import { NetworkSelector } from "@/components/NetworkSelector";
import { WalletButton } from "@/components/WalletButton";
import { CryptoIcon } from "@/components/CryptoIcon";
import { BoxesBackground } from "@/components/BoxesBackground";
import { HoverButton } from "@/components/HoverButton";
import { Toast } from "@/components/Toast";
import {
  WalletCommandPalette,
  type WalletTab,
} from "@/components/WalletCommandPalette";
import { Alert } from "@/components/ui";

const TABS: { id: WalletTab; label: string }[] = [
  { id: "assets", label: "Tài sản" },
  { id: "swap", label: "Swap" },
  { id: "send", label: "Gửi" },
  { id: "receive", label: "Nhận" },
  { id: "history", label: "Lịch sử" },
  { id: "nft", label: "NFT" },
  { id: "wallet", label: "Ví" },
];

export default function AppPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [tab, setTab] = useState<WalletTab>("assets");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentChain = supportedChains.find((c) => c.id === chainId);
  const unsupportedChain = isConnected && !currentChain;

  // ⌘K / Ctrl+K hoặc "/" mở command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "/") {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  return (
    <main className="pointer-events-none relative min-h-screen">
      {/* Nền lưới boxes tương tác (hover đổi màu ô) */}
      <BoxesBackground />

      <WalletCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPickTab={setTab}
        showToast={showToast}
      />

      {/* ===== Top Navbar: logo trái — Tubelight tabs giữa — ví phải ===== */}
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="pointer-events-auto fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#0a0a10]/70 backdrop-blur-xl"
      >
        <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div
              className="h-7 w-7 rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, #ff007a, #b478ff 60%, #4c82fb)",
              }}
              aria-hidden
            />
            <span className="hidden font-display text-sm font-bold tracking-tight text-white lg:inline">
              Web3 Wallet
            </span>
          </div>

          {/* Tubelight tabs giữa header (desktop) */}
          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
            <TubelightTabs tab={tab} setTab={setTab} idPrefix="top" />
          </div>

          {/* Cụm phải */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              title="Command palette (Ctrl+K hoặc /)"
              className="hidden items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-xs text-neutral-400 outline-none transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-white/20 sm:flex"
            >
              <Command className="h-3 w-3" />K
            </button>
            <NetworkSelector />
            <WalletButton />
          </div>
        </div>
      </motion.header>

      {/* Tabs cho mobile — pill tubelight nổi ở đáy màn hình */}
      <div className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2 md:hidden">
        <TubelightTabs tab={tab} setTab={setTab} idPrefix="bottom" boxed />
      </div>

      {/* ===== Khu trung tâm: một Card nội dung ===== */}
      <div className="pointer-events-auto relative mx-auto w-full max-w-[480px] px-4 pb-28 pt-24 sm:pt-28 md:pb-16">
        {/* Glow hồng mờ sau card */}
        <div
          className="pointer-events-none absolute left-1/2 top-32 -z-10 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-accent1/[0.07] blur-[120px]"
          aria-hidden
        />

        {unsupportedChain && (
          <div className="mb-4">
            <Alert variant="warning">
              Mạng hiện tại (id {chainId}) không được hỗ trợ. Chọn mạng khác ở
              góc trên bên phải.
            </Alert>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
          className="rounded-3xl border border-white/[0.08] bg-zinc-950/60 shadow-2xl backdrop-blur-xl"
        >
          <div className="p-4 sm:p-5">
            {tab === "wallet" ? (
              <InAppWalletPanel />
            ) : !isConnected ? (
              <EmptyConnect />
            ) : (
              <>
                {tab === "assets" && <AssetList />}
                {tab === "swap" && <Swap />}
                {tab === "send" && <Send />}
                {tab === "receive" && <Receive />}
                {tab === "history" && <History />}
                {tab === "nft" && <NftGallery />}
              </>
            )}
          </div>
        </motion.div>
      </div>

      <Toast message={toast} />
    </main>
  );
}

/**
 * Tubelight Tabs: tab active có "đèn tuýp" neon hồng phía trên — vệt sáng
 * nhỏ + 2 lớp glow blur, chạy mượt theo tab bằng framer-motion layoutId.
 * `boxed` bọc trong pill glass (thanh nổi mobile).
 */
function TubelightTabs({
  tab,
  setTab,
  idPrefix,
  boxed = false,
}: {
  tab: WalletTab;
  setTab: (t: WalletTab) => void;
  idPrefix: string;
  boxed?: boolean;
}) {
  return (
    <div
      className={
        boxed
          ? "flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-zinc-950/75 p-1.5 shadow-2xl backdrop-blur-xl"
          : "flex items-center gap-0.5"
      }
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`relative rounded-full px-2.5 py-1.5 text-xs font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/20 lg:px-3 lg:text-sm ${
            tab === t.id ? "text-white" : "text-[#98a1c0] hover:text-white"
          }`}
        >
          {tab === t.id && (
            <motion.span
              layoutId={`${idPrefix}-tubelight`}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="absolute inset-0 rounded-full bg-white/[0.06]"
              aria-hidden
            >
              {/* Đèn tuýp neon phía trên tab */}
              <span className="absolute -top-[7px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-accent1">
                <span className="absolute -left-2 -top-2.5 h-7 w-11 rounded-full bg-accent1/25 blur-md" />
                <span className="absolute -left-0.5 -top-1 h-5 w-8 rounded-full bg-accent1/30 blur-sm" />
              </span>
            </motion.span>
          )}
          <span className="relative z-10">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Empty state khi chưa kết nối: minh họa ví + ổ khóa, dải icon crypto mờ,
 * CTA chính full-width dùng HoverButton (magnetic + shimmer).
 */
function EmptyConnect() {
  const { openConnectModal } = useConnectModal();
  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          <Wallet className="h-7 w-7 text-[#98a1c0]" strokeWidth={1.6} />
        </div>
        <div className="absolute -bottom-1.5 -right-1.5 rounded-full border border-white/10 bg-zinc-900 p-1.5">
          <Lock className="h-3 w-3 text-[#98a1c0]" strokeWidth={2} />
        </div>
      </div>

      <div className="flex items-center gap-2.5 opacity-40">
        {["eth", "bnb", "matic", "usdt", "usdc"].map((s) => (
          <CryptoIcon key={s} symbol={s} size={22} />
        ))}
      </div>

      <p className="text-sm text-[#98a1c0]">
        Kết nối ví để xem tài sản và thực hiện giao dịch.
      </p>

      <HoverButton onClick={() => openConnectModal?.()} className="w-full">
        Kết nối ví để bắt đầu
      </HoverButton>

      <p className="text-xs text-neutral-600">
        Chưa có ví? Sang tab &quot;Ví&quot; để tạo ví ngay trong trình duyệt.
      </p>
    </div>
  );
}
