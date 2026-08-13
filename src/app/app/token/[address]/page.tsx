"use client";

import { useParams } from "next/navigation";
import { TokenPage } from "@/features/token/TokenPage";

/** Client page — tránh SSR wagmi/RainbowKit (giống /app). */
export default function TokenDetailPage() {
  const params = useParams();
  const address = params.address as string;
  return <TokenPage addressParam={decodeURIComponent(address)} />;
}
