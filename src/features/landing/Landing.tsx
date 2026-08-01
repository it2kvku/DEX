"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { AuroraBackground } from "@/components/AuroraBackground";
import { HoverButton } from "@/components/HoverButton";
import { TiltMockup } from "./TiltMockup";
import { BentoFeatures } from "./BentoFeatures";
import { FeatureCarousel } from "./FeatureCarousel";
import { LandingFooter } from "./LandingFooter";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

/**
 * Landing page: Hero aurora + mockup 3D, Bento 4 tính năng,
 * carousel năng lực, footer trạng thái mạng. CTA "Mở ứng dụng" -> /app.
 */
export function Landing() {
  const router = useRouter();

  return (
    <div className="min-h-screen text-white">
      <AuroraBackground />

      {/* ===== Navbar landing tối giản ===== */}
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, #ff007a, #b478ff 60%, #4c82fb)",
            }}
            aria-hidden
          />
          <span className="font-display text-sm font-bold tracking-tight">
            Web3 Wallet
          </span>
        </div>
        <button
          onClick={() => router.push("/app")}
          className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/20"
        >
          Mở ứng dụng
        </button>
      </nav>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        {/* ===== Hero ===== */}
        <section className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.09 } } }}
          >
            <motion.p
              variants={fadeUp}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-neutral-300 backdrop-blur"
            >
              <Sparkles className="h-3 w-3 text-accent1" />
              Non-custodial · 5 chain · DEX aggregator
            </motion.p>

            <motion.h1
              variants={fadeUp}
              className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Ví Web3 đa chain{" "}
              <span className="bg-gradient-to-r from-[#ff007a] via-[#b478ff] to-[#4c82fb] bg-clip-text text-transparent">
                thế hệ mới
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400 sm:text-base"
            >
              Quản lý tài sản, gửi nhận, swap và NFT trên Ethereum, BNB Chain,
              Polygon, Arbitrum và Sepolia — khóa riêng luôn thuộc về bạn.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-7 flex flex-wrap gap-3">
              <HoverButton onClick={() => router.push("/app")}>
                Mở ứng dụng <ArrowRight className="h-4 w-4" />
              </HoverButton>
              <a
                href="#features"
                className="inline-flex items-center rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-neutral-200 outline-none backdrop-blur-xl transition-colors hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Khám phá tính năng
              </a>
            </motion.div>
          </motion.div>

          {/* Hero visual: mockup ví nghiêng 3D */}
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
          >
            <TiltMockup />
          </motion.div>
        </section>

        {/* ===== Bento features ===== */}
        <section id="features" className="scroll-mt-24 py-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Mọi thứ một ví cần có
            </h2>
            <p className="mt-1.5 text-sm text-neutral-400">
              Bảo mật là mặc định — trải nghiệm là ưu tiên.
            </p>
          </motion.div>
          <BentoFeatures />
        </section>

        {/* ===== Carousel năng lực ===== */}
        <section className="py-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-6 flex items-center justify-between"
          >
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Khả năng của ví
            </h2>
            <span className="text-xs text-neutral-500">Kéo để xem thêm →</span>
          </motion.div>
          <FeatureCarousel />
        </section>

        {/* ===== CTA cuối + Footer ===== */}
        <section className="py-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grad-ring mb-10 rounded-3xl border border-white/[0.08] bg-zinc-950/60 p-10 text-center backdrop-blur-xl"
          >
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Sẵn sàng trải nghiệm?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
              Kết nối MetaMask/WalletConnect hoặc tạo ví ngay trong trình duyệt
              — miễn phí trên Sepolia testnet.
            </p>
            <div className="mt-6 flex justify-center">
              <HoverButton onClick={() => router.push("/app")}>
                Mở ứng dụng ngay <ArrowRight className="h-4 w-4" />
              </HoverButton>
            </div>
          </motion.div>

          <LandingFooter />
        </section>
      </main>
    </div>
  );
}
