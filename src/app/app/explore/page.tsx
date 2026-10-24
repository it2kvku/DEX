"use client";

import { ExplorePage } from "@/features/explore/ExplorePage";

/** Client page — tránh SSR wagmi/RainbowKit (giống /app). */
export default function Page() {
  return <ExplorePage />;
}
