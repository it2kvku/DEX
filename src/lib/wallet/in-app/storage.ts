/**
 * Lưu trữ vault đã mã hóa trong IndexedDB.
 *
 * Chọn IndexedDB thay LocalStorage: LocalStorage đồng bộ và bất kỳ script XSS
 * nào cũng đọc được trong một dòng. IndexedDB không loại bỏ hoàn toàn rủi ro
 * nhưng giảm bề mặt tấn công, và chỉ lưu blob ĐÃ mã hóa (không bao giờ seed thô).
 */

import type { EncryptedVault } from "./keystore";

const DB_NAME = "web3-wallet";
const DB_VERSION = 1;
const STORE = "vault";
const VAULT_KEY = "default"; // hiện chỉ hỗ trợ 1 in-app wallet (1 mnemonic)

/** Một tài khoản dẫn xuất từ mnemonic (path m/44'/60'/0'/0/{index}). */
export interface StoredAccount {
  /** Index HD — vị trí trong cây dẫn xuất, không phải thứ tự hiển thị. */
  index: number;
  /** Địa chỉ của index này — lưu sẵn vì phải giải mã mnemonic mới tính được. */
  address: `0x${string}`;
  /** Tên hiển thị tuỳ chọn (vd "Ví lạnh"), mặc định "Tài khoản {i+1}". */
  label?: string;
}

export interface StoredVault {
  vault: EncryptedVault;
  /**
   * Địa chỉ tài khoản đầu tiên — GIỮ LẠI để tương thích vault cũ; bản mới
   * luôn là accounts[0].address.
   */
  address: `0x${string}`;
  /** Các tài khoản đã tạo từ mnemonic này. Thiếu ở vault cũ -> migrate. */
  accounts: StoredAccount[];
  /** Index của tài khoản đang chọn lần cuối. */
  activeIndex: number;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Vault cũ (trước đa tài khoản) không có accounts/activeIndex — bổ sung từ
 * trường `address` cũ ở tầng đọc, để code phía trên luôn thấy shape mới mà
 * không cần migration ghi lại.
 */
function migrate(raw: StoredVault | (Omit<StoredVault, "accounts" | "activeIndex"> & { accounts?: StoredAccount[]; activeIndex?: number })): StoredVault {
  const accounts =
    raw.accounts && raw.accounts.length > 0
      ? raw.accounts
      : [{ index: 0, address: raw.address }];
  const activeIndex = raw.activeIndex ?? accounts[0].index;
  return { ...raw, accounts, activeIndex };
}

export async function saveVault(data: StoredVault): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, VAULT_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadVault(): Promise<StoredVault | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(VAULT_KEY);
    req.onsuccess = () => {
      db.close();
      const raw = req.result as StoredVault | undefined;
      resolve(raw ? migrate(raw) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVault(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(VAULT_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
