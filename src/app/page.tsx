import type { Metadata } from "next";
import { Landing } from "@/features/landing/Landing";

export const metadata: Metadata = {
  title: "Web3 Wallet — Ví đa chain thế hệ mới",
  description:
    "Ví Web3 non-custodial: quản lý tài sản, gửi nhận, swap và NFT trên Ethereum, BNB Chain, Polygon, Arbitrum và Sepolia.",
};

export default function LandingPage() {
  return <Landing />;
}
