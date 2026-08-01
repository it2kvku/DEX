/**
 * Wagmi connector cho in-app wallet.
 *
 * Ý tưởng: bọc một viem LocalAccount (dẫn xuất từ mnemonic đã giải mã) thành
 * một EIP-1193 provider tối giản, rồi đăng ký như một connector của wagmi.
 * Nhờ đó TOÀN BỘ tầng Asset/Send/History (viết trên wagmi hooks) hoạt động
 * y hệt với ví injected — không phải phân nhánh code theo loại ví.
 *
 * Bảo mật: account (chứa private key) chỉ nằm trong RAM khi ví đã mở khóa.
 * Khi khóa/đăng xuất, gọi clearInAppAccount() để xóa khỏi bộ nhớ.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
  type LocalAccount,
} from "viem";
import { createConnector } from "wagmi";
import { supportedChains, buildTransports } from "@/lib/chains";

// Holder giữ account đã mở khóa. Context set khi unlock, clear khi lock.
let currentAccount: LocalAccount | null = null;
let currentChainId: number = supportedChains[0].id;

export function setInAppAccount(account: LocalAccount) {
  currentAccount = account;
}
export function clearInAppAccount() {
  currentAccount = null;
}
export function hasInAppAccount() {
  return currentAccount !== null;
}

const transports = buildTransports();

function chainById(id: number): Chain {
  return supportedChains.find((c) => c.id === id) ?? supportedChains[0];
}

function publicClientFor(chainId: number) {
  const chain = chainById(chainId);
  return createPublicClient({
    chain,
    transport: transports[chainId] ?? http(),
  });
}

interface RequestArgs {
  method: string;
  params?: unknown;
}

/**
 * EIP-1193 request handler: các method ký dùng LocalAccount,
 * các method đọc proxy sang public client của chain hiện tại.
 */
async function request({ method, params }: RequestArgs): Promise<unknown> {
  const pub = publicClientFor(currentChainId);

  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts":
      return currentAccount ? [currentAccount.address] : [];

    case "eth_chainId":
      return `0x${currentChainId.toString(16)}`;

    case "wallet_switchEthereumChain": {
      const target = (params as [{ chainId: string }])[0];
      currentChainId = Number(target.chainId);
      return null;
    }

    case "personal_sign": {
      if (!currentAccount) throw new Error("Ví chưa mở khóa");
      const [message] = params as [`0x${string}`, string];
      return currentAccount.signMessage({ message: { raw: message } });
    }

    case "eth_signTypedData_v4": {
      if (!currentAccount) throw new Error("Ví chưa mở khóa");
      const [, json] = params as [string, string];
      return currentAccount.signTypedData(JSON.parse(json));
    }

    case "eth_sendTransaction": {
      if (!currentAccount) throw new Error("Ví chưa mở khóa");
      const [tx] = params as [Record<string, `0x${string}`>];
      const chain = chainById(currentChainId);
      const walletClient = createWalletClient({
        account: currentAccount,
        chain,
        transport: transports[currentChainId] ?? http(),
      });
      // wagmi/viem đã điền gas/nonce/fees trước khi tới đây khi cần;
      // sendTransaction sẽ tự bổ sung phần còn thiếu theo EIP-1559.
      return walletClient.sendTransaction({
        account: currentAccount,
        chain,
        to: tx.to,
        value: tx.value ? BigInt(tx.value) : undefined,
        data: tx.data,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
    }

    // Mọi method đọc còn lại: proxy sang RPC của chain.
    default:
      return pub.request({ method, params } as Parameters<
        typeof pub.request
      >[0]);
  }
}

const provider = { request };

/** Tạo connector in-app wallet cho wagmi config. */
export function inAppWalletConnector() {
  return createConnector((config) => ({
    id: "in-app-wallet",
    name: "Ví in-app",
    type: "in-app-wallet",

    async connect(params?: {
      chainId?: number;
      isReconnecting?: boolean;
      withCapabilities?: boolean;
    }) {
      if (!currentAccount) throw new Error("Ví in-app chưa mở khóa");
      if (params?.chainId) currentChainId = params.chainId;
      // wagmi dùng conditional return type (withCapabilities); ví local chỉ
      // trả danh sách address đơn giản nên cast để khớp overload generic.
      return {
        accounts: [currentAccount.address],
        chainId: currentChainId,
      } as never;
    },

    async disconnect() {
      clearInAppAccount();
    },

    async getAccounts() {
      return currentAccount ? [currentAccount.address] : [];
    },

    async getChainId() {
      return currentChainId;
    },

    async getProvider() {
      return provider;
    },

    async isAuthorized() {
      return currentAccount !== null;
    },

    async switchChain({ chainId }) {
      currentChainId = chainId;
      const chain = chainById(chainId);
      config.emitter.emit("change", { chainId });
      return chain;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      clearInAppAccount();
    },
  }));
}
