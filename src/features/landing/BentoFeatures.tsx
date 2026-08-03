"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  ArrowLeftRight,
  Fuel,
  ArrowRight,
} from "lucide-react";
import { CryptoIcon } from "@/components/CryptoIcon";
import { CountUp } from "@/components/anim/CountUp";

/** Ảnh NFT mẫu (PFP) minh họa cho thẻ NFT Portfolio ở landing. */
const NFT_PREVIEWS = [
  { src: "/nft/nft01.jpg", alt: "NFT pixel punk" },
  { src: "/nft/nft02.jpg", alt: "NFT bored ape" },
  { src: "/nft/nft03.jpg", alt: "NFT anime samurai" },
  { src: "/nft/nft04.jpg", alt: "NFT rainbow character" },
] as const;

/**
 * Bento Grid 4 tính năng chính — bố cục bất đối xứng,
 * stagger fade-in khi cuộn tới (whileInView).
 */
export function BentoFeatures() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      className="grid grid-cols-1 gap-4 md:grid-cols-6"
    >
      {/* 1. Non-custodial security — viền gradient glow */}
      <BentoCard className="grad-ring md:col-span-4">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent1/15">
            <ShieldCheck className="h-5 w-5 text-accent1" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold text-white">
              Non-Custodial — khóa của bạn, tiền của bạn
            </h3>
            <p className="mt-1.5 text-sm text-neutral-400">
              Seed phrase mã hóa AES-GCM bằng Web Crypto API, chỉ giải mã tạm
              trong RAM khi ký. Không máy chủ nào giữ tài sản của bạn.
            </p>
            {/* Mnemonic chips minh họa (mock, làm mờ) */}
            <div className="mt-4 flex flex-wrap gap-1.5 opacity-60 blur-[2px]">
              {["ocean", "pilot", "ember", "quartz", "lunar", "drift"].map(
                (w, i) => (
                  <span
                    key={w}
                    className="rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1 font-mono text-[10px] text-neutral-400"
                  >
                    {i + 1}. {w}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </BentoCard>

      {/* 2. Multi-chain swaps — icon token màu */}
      <BentoCard className="md:col-span-2">
        <h3 className="font-display text-base font-bold text-white">
          Swap đa chain tức thì
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          Route tốt nhất qua DEX aggregator.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <CryptoIcon symbol="eth" size={28} />
          <ArrowRight className="h-3.5 w-3.5 text-neutral-600" />
          <CryptoIcon symbol="usdt" size={28} />
          <ArrowRight className="h-3.5 w-3.5 text-neutral-600" />
          <CryptoIcon symbol="bnb" size={28} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
          <ArrowLeftRight className="h-3 w-3 text-accent1" />
          Ethereum · BNB · Polygon · Arbitrum
        </div>
      </BentoCard>

      {/* 3. NFT visualizer — lưới preview */}
      <BentoCard className="md:col-span-2">
        <h3 className="font-display text-base font-bold text-white">
          NFT Portfolio
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          Bộ sưu tập ERC-721/1155 trực quan.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {NFT_PREVIEWS.map((nft) => (
            <div
              key={nft.src}
              className="relative aspect-square overflow-hidden rounded-xl border border-white/[0.08] bg-black/40"
            >
              <Image
                src={nft.src}
                alt={nft.alt}
                fill
                sizes="(min-width: 768px) 120px, 40vw"
                className="object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </BentoCard>

      {/* 4. Gas optimization — stats counter động */}
      <BentoCard className="md:col-span-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-bold text-white">
              Tối ưu phí gas
            </h3>
            <p className="mt-1.5 max-w-sm text-sm text-neutral-400">
              EIP-1559 chuẩn xác, ước tính trước khi ký, RPC fallback tự động
              khi node nghẽn.
            </p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent1/15">
            <Fuel className="h-5 w-5 text-accent1" />
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-4">
          <Stat value={5} suffix=" chain" label="Mạng hỗ trợ" />
          <Stat value={99.9} suffix="%" label="Uptime RPC" decimals={1} />
          <Stat value={20} prefix="~" suffix="s" label="Quote refresh" />
        </div>
      </BentoCard>
    </motion.div>
  );
}

function BentoCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 22 },
        show: { opacity: 1, y: 0 },
      }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={`rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-6 backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_0_36px_rgba(255,0,122,0.12)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

function Stat({
  value,
  label,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <div>
      <p className="font-display text-2xl font-bold text-white">
        {prefix}
        <CountUp
          value={value}
          format={(n) => n.toFixed(decimals)}
          duration={1400}
        />
        {suffix}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
    </div>
  );
}
