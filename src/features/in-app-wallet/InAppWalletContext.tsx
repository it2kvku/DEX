"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Address } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  loadVault,
  saveVault,
  deleteVault,
  type StoredAccount,
  type StoredVault,
} from "@/lib/wallet/in-app/storage";
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
  /** Địa chỉ của tài khoản đang chọn (kể cả khi đang khóa vẫn biết địa chỉ). */
  address: Address | null;
  /** Đã mở khóa (mật khẩu đã xác thực trong phiên này). */
  isUnlocked: boolean;
  /** Vault đã mã hóa (để signer dùng khi ký). */
  vault: EncryptedVault | null;
  /** Mật khẩu phiên — chỉ giữ trong RAM khi đã mở khóa, để ký lại không cần nhập lại. */
  sessionPassword: string | null;
  loading: boolean;
  /** Các tài khoản đã tạo từ mnemonic của vault. */
  accounts: StoredAccount[];
  /** Index HD của tài khoản đang chọn. */
  activeIndex: number;
  /** Số phút rảnh trước khi tự khóa (0 = tắt). */
  autolockMinutes: number;
}

interface InAppWalletActions {
  /** Tạo ví mới: trả về mnemonic để người dùng ghi lại. */
  create: (password: string) => Promise<string>;
  /** Import từ mnemonic có sẵn. */
  importFromMnemonic: (mnemonic: string, password: string) => Promise<void>;
  /** Mở khóa ví đã lưu (tài khoản đang chọn). */
  unlock: (password: string) => Promise<boolean>;
  /** Khóa lại (xóa mật khẩu phiên khỏi RAM). */
  lock: () => Promise<void>;
  /** Xóa ví khỏi thiết bị. */
  remove: () => Promise<void>;
  /** Thêm tài khoản HD kế tiếp (cần đã mở khóa). Trả về địa chỉ mới. */
  addAccount: () => Promise<Address | null>;
  /** Chuyển sang tài khoản khác theo index HD (cần đã mở khóa để kết nối lại). */
  switchAccount: (index: number) => Promise<void>;
  /** Số phút rảnh trước khi tự khóa; 0 = không tự khóa. */
  setAutolockMinutes: (minutes: number) => void;
}

/** localStorage key cho cấu hình tự khóa. */
const AUTOLOCK_KEY = "in-app-autolock-minutes";
const AUTOLOCK_DEFAULT_MINUTES = 10;

function loadAutolockMinutes(): number {
  try {
    const raw = localStorage.getItem(AUTOLOCK_KEY);
    const parsed = raw === null ? AUTOLOCK_DEFAULT_MINUTES : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : AUTOLOCK_DEFAULT_MINUTES;
  } catch {
    return AUTOLOCK_DEFAULT_MINUTES;
  }
}

const Ctx = createContext<(InAppWalletState & InAppWalletActions) | null>(null);

export function InAppWalletProvider({ children }: { children: ReactNode }) {
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { connector: activeConnector } = useAccount();

  // Vault mới nhất — ref để các action đọc mà không phụ thuộc render cycle.
  const vaultRef = useRef<StoredVault | null>(null);
  const applyVault = useCallback((v: StoredVault | null) => {
    vaultRef.current = v;
  }, []);

  // Chỉ ngắt kết nối wagmi khi connector đang active là ví in-app —
  // tránh vô tình ngắt MetaMask/WalletConnect của người dùng.
  const disconnectIfInApp = useCallback(async () => {
    if (activeConnector?.id === "in-app-wallet") {
      await disconnectAsync().catch(() => {});
    }
  }, [activeConnector, disconnectAsync]);

  // Nạp account vào connector rồi kết nối wagmi để toàn app nhận diện ví.
  // THỨ TỰ quan trọng: disconnectAsync có thể gọi connector.disconnect() của
  // chính ví in-app (khi đang chuyển tài khoản) và nó clearInAppAccount() —
  // nên phải nạp account SAU khi disconnect, không thì connectAsync gặp
  // "Ví in-app chưa mở khóa".
  const activateConnector = useCallback(
    async (vault: EncryptedVault, password: string, addressIndex: number) => {
      await disconnectAsync().catch(() => {});
      const account = await accountFromVault(vault, password, addressIndex);
      setInAppAccount(account);
      const connector = connectors.find((c) => c.id === "in-app-wallet");
      if (connector) {
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
    accounts: [],
    activeIndex: 0,
    autolockMinutes: AUTOLOCK_DEFAULT_MINUTES,
  });

  // Nạp cấu hình tự khóa từ localStorage sau mount (tránh lệch SSR hydration).
  useEffect(() => {
    setState((s) => ({ ...s, autolockMinutes: loadAutolockMinutes() }));
  }, []);

  const setAutolockMinutes = useCallback((minutes: number) => {
    const safe = Number.isFinite(minutes) && minutes >= 0 ? minutes : 0;
    setState((s) => ({ ...s, autolockMinutes: safe }));
    try {
      localStorage.setItem(AUTOLOCK_KEY, String(safe));
    } catch {
      /* storage đầy — vẫn giữ cấu hình trong phiên */
    }
  }, []);

  // Nạp vault đã lưu lúc khởi động (loadVault tự migrate vault cũ thiếu accounts).
  useEffect(() => {
    loadVault()
      .then((stored) => {
        applyVault(stored);
        if (!stored) {
          setState((s) => ({ ...s, loading: false }));
          return;
        }
        const active =
          stored.accounts.find((a) => a.index === stored.activeIndex) ??
          stored.accounts[0];
        setState((s) => ({
          ...s,
          hasVault: true,
          address: active?.address ?? null,
          vault: stored.vault,
          accounts: stored.accounts,
          activeIndex: active?.index ?? 0,
          loading: false,
        }));
      })
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, [applyVault]);

  /** Ghi lại vault mới nhất xuống IndexedDB + đồng bộ state. */
  const persist = useCallback(
    async (mnemonic: string, password: string) => {
      const vault = await encryptMnemonic(mnemonic, password);
      const address = addressFromMnemonic(mnemonic, 0);
      const stored: StoredVault = {
        vault,
        address,
        accounts: [{ index: 0, address }],
        activeIndex: 0,
        createdAt: Date.now(),
      };
      await saveVault(stored);
      applyVault(stored);
      await activateConnector(vault, password, 0);
      setState((s) => ({
        ...s,
        hasVault: true,
        address,
        isUnlocked: true,
        vault,
        sessionPassword: password,
        loading: false,
        accounts: stored.accounts,
        activeIndex: 0,
      }));
    },
    [activateConnector, applyVault],
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
      addressFromMnemonic(mnemonic.trim(), 0);
      await persist(mnemonic.trim(), password);
    },
    [persist],
  );

  const unlock = useCallback(
    async (password: string) => {
      const stored = vaultRef.current;
      if (!stored) return false;
      try {
        // accountFromVault ném lỗi nếu sai mật khẩu (AES-GCM auth fail).
        await activateConnector(stored.vault, password, stored.activeIndex);
      } catch {
        return false;
      }
      const active =
        stored.accounts.find((a) => a.index === stored.activeIndex) ??
        stored.accounts[0];
      setState((s) => ({
        ...s,
        isUnlocked: true,
        sessionPassword: password,
        address: active?.address ?? s.address,
        activeIndex: active?.index ?? s.activeIndex,
      }));
      return true;
    },
    [activateConnector],
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
    applyVault(null);
    setState((s) => ({
      ...s,
      hasVault: false,
      address: null,
      isUnlocked: false,
      vault: null,
      sessionPassword: null,
      loading: false,
      accounts: [],
      activeIndex: 0,
    }));
  }, [disconnectIfInApp, applyVault]);

  const addAccount = useCallback(async (): Promise<Address | null> => {
    const stored = vaultRef.current;
    // Cần mật khẩu phiên để dẫn xuất account mới từ mnemonic đã giải mã.
    if (!stored || !state.isUnlocked || !state.sessionPassword) return null;

    const nextIndex =
      Math.max(...stored.accounts.map((a) => a.index), -1) + 1;
    // Derive địa chỉ của index mới — giải mã tạm trong RAM như mọi lần ký.
    const account = await accountFromVault(
      stored.vault,
      state.sessionPassword,
      nextIndex,
    );
    const next: StoredAccount = { index: nextIndex, address: account.address };

    const updated: StoredVault = {
      ...stored,
      accounts: [...stored.accounts, next],
      activeIndex: nextIndex,
      // Giữ trường `address` (account 0) cho vault cũ đọc được.
      address: stored.address,
    };
    await saveVault(updated);
    applyVault(updated);
    await activateConnector(stored.vault, state.sessionPassword, nextIndex);
    setState((s) => ({
      ...s,
      accounts: updated.accounts,
      activeIndex: nextIndex,
      address: account.address,
    }));
    return account.address;
  }, [state.isUnlocked, state.sessionPassword, activateConnector, applyVault]);

  const switchAccount = useCallback(
    async (index: number) => {
      const stored = vaultRef.current;
      if (!stored) return;
      if (!stored.accounts.some((a) => a.index === index)) return;

      const updated: StoredVault = { ...stored, activeIndex: index };
      await saveVault(updated);
      applyVault(updated);
      const account = updated.accounts.find((a) => a.index === index)!;
      setState((s) => ({ ...s, activeIndex: index, address: account.address }));

      // Đã mở khóa: kết nối lại ngay bằng account mới (disconnect + connect
      // để wagmi store nhận địa chỉ mới — connector in-app không có event
      // accountsChanged tự sinh).
      if (state.isUnlocked && state.sessionPassword) {
        await activateConnector(stored.vault, state.sessionPassword, index);
      }
    },
    [state.isUnlocked, state.sessionPassword, activateConnector, applyVault],
  );

  // Tự khóa khi rảnh: mật khẩu phiên nằm trong RAM vô hạn là điểm yếu lớn
  // nhất của ví in-app — người dùng mở ví rồi bỏ máy thì key "mở" mãi. Mỗi
  // tương tác (pointer/phím) đặt lại bộ đếm; hết thời gian thì khóa như nút
  // "Khóa ví" (xóa mật khẩu + ngắt kết nối connector).
  useEffect(() => {
    if (!state.isUnlocked || state.autolockMinutes <= 0) return;
    const lockMs = state.autolockMinutes * 60_000;
    let timer = setTimeout(() => void lock(), lockMs);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void lock(), lockMs);
    };
    window.addEventListener("pointerdown", reset, { passive: true });
    window.addEventListener("keydown", reset, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [state.isUnlocked, state.autolockMinutes, lock]);

  return (
    <Ctx.Provider
      value={{
        ...state,
        create,
        importFromMnemonic,
        unlock,
        lock,
        remove,
        addAccount,
        switchAccount,
        setAutolockMinutes,
      }}
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
