import { createConfig } from "wagmi";
import {
  connectorsForWallets,
  type WalletList,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { supportedChains, buildTransports } from "./chains";
import { inAppWalletConnector } from "./wallet/in-app/connector";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

if (!projectId && typeof window !== "undefined") {
  console.warn(
    "[wagmi] Thiếu NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. " +
      "Kết nối qua WalletConnect (QR) sẽ không dùng được. " +
      "Lấy Project ID tại https://cloud.reown.com",
  );
}

// Ví injected/extension do RainbowKit cung cấp.
const walletList: WalletList = [
  {
    groupName: "Phổ biến",
    wallets: [
      metaMaskWallet,
      walletConnectWallet,
      coinbaseWallet,
      injectedWallet,
    ],
  },
];

const rainbowConnectors = connectorsForWallets(walletList, {
  appName: "Web3 Wallet",
  projectId: projectId || "MISSING_PROJECT_ID",
});

/**
 * Config hợp nhất cả hai mô hình ví:
 * - Connect-only: các connector của RainbowKit (MetaMask, WalletConnect...).
 * - In-app: connector tự viết bọc LocalAccount.
 * Toàn bộ tầng Asset/Send/History dùng chung wagmi hooks, không phân nhánh.
 */
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [...rainbowConnectors, inAppWalletConnector()],
  transports: buildTransports(),
  ssr: true,
});
