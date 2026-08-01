"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Address } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { loadVault, saveVault, deleteVault } from "@/lib/wallet/in-app/storage";
import type { EncryptedVault } from "@/lib/wallet/in-app/keystore";
import {
  accountFromVault,
  addressFromMnemonic,
  createMnemonic,
  encryptMnemonic,
} from "@/lib/wallet/in-app/signer";
import {
  setInAppAccount,
  clearInAppAccount,
} from "@/lib/wallet/in-app/connector";

interface InAppWalletState {
  /** Có vault đã lưu trong IndexedDB không. */
  hasVault: boolean;
  /** Địa chỉ ví (kể cả khi đang khóa vẫn biết địa chỉ). */
  address: Address | null;
  /** Đã mở khóa (mật khẩu đã xác thực trong phiên này). */
  isUnlocked: boolean;
  /** Vault đã mã hóa (để signer dùng khi ký). */
  vault: EncryptedVault | null;
  /** Mật khẩu phiên — chỉ giữ trong RAM khi đã mở khóa, để ký lại không cần nhập lại. */
  sessionPassword: string | null;
  loading: boolean;
}

interface InAppWalletActions {
  /** Tạo ví mới: trả về mnemonic để người dùng ghi lại. */
  create: (password: string) => Promise<string>;
  /** Import từ mnemonic có sẵn. */
  importFromMnemonic: (mnemonic: string, password: string) => Promise<void>;
  /** Mở khóa ví đã lưu. */
  unlock: (password: string) => Promise<boolean>;
  /** Khóa lại (xóa mật khẩu phiên khỏi RAM). */
  lock: () => Promise<void>;
  /** Xóa ví khỏi thiết bị. */
  remove: () => Promise<void>;
}

const Ctx = createContext<(InAppWalletState & InAppWalletActions) | null>(null);

export function InAppWalletProvider({ children }: { children: ReactNode }) {
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { connector: activeConnector } = useAccount();

  // Chỉ ngắt kết nối wagmi khi connector đang active là ví in-app —
  // tránh vô tình ngắt MetaMask/WalletConnect của người dùng.
  const disconnectIfInApp = useCallback(async () => {
    if (activeConnector?.id === "in-app-wallet") {
      await disconnectAsync().catch(() => {});
    }
  }, [activeConnector, disconnectAsync]);

  // Nạp account vào connector rồi kết nối wagmi để toàn app nhận diện ví.
  const activateConnector = useCallback(
    async (vault: EncryptedVault, password: string) => {
      const account = await accountFromVault(vault, password);
      setInAppAccount(account);
      const connector = connectors.find((c) => c.id === "in-app-wallet");
      if (connector) {
        // Ngắt kết nối ví đang có (vd MetaMask) trước, nếu không wagmi sẽ
        // ném ConnectorAlreadyConnectedError.
        await disconnectAsync().catch(() => {});
        await connectAsync({ connector });
      }
    },
    [connectAsync, connectors, disconnectAsync],
  );

  const [state, setState] = useState<InAppWalletState>({
    hasVault: false,
    address: null,
    isUnlocked: false,
    vault: null,
    sessionPassword: null,
    loading: true,
  });

  // Nạp vault đã lưu lúc khởi động.
  useEffect(() => {
    loadVault()
      .then((stored) => {
        setState((s) => ({
          ...s,
          hasVault: !!stored,
          address: stored?.address ?? null,
          vault: stored?.vault ?? null,
          loading: false,
        }));
      })
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, []);

  const persist = useCallback(
    async (mnemonic: string, password: string) => {
      const vault = await encryptMnemonic(mnemonic, password);
      const address = addressFromMnemonic(mnemonic);
      await saveVault({ vault, address, createdAt: Date.now() });
      await activateConnector(vault, password);
      setState({
        hasVault: true,
        address,
        isUnlocked: true,
        vault,
        sessionPassword: password,
        loading: false,
      });
    },
    [activateConnector],
  );

  const create = useCallback(
    async (password: string) => {
      const mnemonic = createMnemonic();
      await persist(mnemonic, password);
      return mnemonic;
    },
    [persist],
  );

  const importFromMnemonic = useCallback(
    async (mnemonic: string, password: string) => {
      // Validate: mnemonicToAccount sẽ ném lỗi nếu mnemonic sai.
      addressFromMnemonic(mnemonic.trim());
      await persist(mnemonic.trim(), password);
    },
    [persist],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!state.vault) return false;
      try {
        // accountFromVault ném lỗi nếu sai mật khẩu (AES-GCM auth fail).
        await activateConnector(state.vault, password);
      } catch {
        return false;
      }
      setState((s) => ({
        ...s,
        isUnlocked: true,
        sessionPassword: password,
      }));
      return true;
    },
    [state.vault, activateConnector],
  );

  const lock = useCallback(async () => {
    clearInAppAccount();
    await disconnectIfInApp();
    setState((s) => ({ ...s, isUnlocked: false, sessionPassword: null }));
  }, [disconnectIfInApp]);

  const remove = useCallback(async () => {
    clearInAppAccount();
    await disconnectIfInApp();
    await deleteVault();
    setState({
      hasVault: false,
      address: null,
      isUnlocked: false,
      vault: null,
      sessionPassword: null,
      loading: false,
    });
  }, [disconnectIfInApp]);

  return (
    <Ctx.Provider
      value={{ ...state, create, importFromMnemonic, unlock, lock, remove }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useInAppWallet() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useInAppWallet phải dùng trong InAppWalletProvider");
  return ctx;
}
