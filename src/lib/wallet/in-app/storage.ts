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
const VAULT_KEY = "default"; // hiện chỉ hỗ trợ 1 in-app wallet

export interface StoredVault {
  vault: EncryptedVault;
  address: `0x${string}`;
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
      resolve((req.result as StoredVault) ?? null);
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
