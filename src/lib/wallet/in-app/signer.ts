/**
 * Signer cho in-app wallet.
 *
 * Nguyên tắc bảo mật: seed phrase chỉ được giải mã tạm trong RAM ngay lúc
 * cần ký, tạo account rồi để biến cục bộ tiêu biến. Không giữ seed/private key
 * ở state toàn cục lâu dài.
 */

import {
  mnemonicToAccount,
  generateMnemonic,
  english,
  type HDAccount,
} from "viem/accounts";
import {
  createWalletClient,
  http,
  type Address,
  type Chain,
  type WalletClient,
} from "viem";
import { decryptSeed, encryptSeed } from "./keystore";
import type { EncryptedVault } from "./keystore";
import { buildTransports } from "@/lib/chains";

/** Sinh mnemonic 12 từ mới (BIP-39, wordlist tiếng Anh chuẩn). */
export function createMnemonic(): string {
  return generateMnemonic(english);
}

/** Lấy địa chỉ từ mnemonic mà không lộ key ra ngoài. */
export function addressFromMnemonic(mnemonic: string): Address {
  return mnemonicToAccount(mnemonic).address;
}

/** Mã hóa mnemonic để lưu (wrapper quanh keystore). */
export function encryptMnemonic(
  mnemonic: string,
  password: string,
): Promise<EncryptedVault> {
  return encryptSeed(mnemonic, password);
}

/**
 * Tạo WalletClient cho một chain bằng cách giải mã vault tạm thời.
 * Client này ký giao dịch bằng account dẫn xuất từ mnemonic.
 */
export async function createInAppWalletClient(
  vault: EncryptedVault,
  password: string,
  chain: Chain,
): Promise<WalletClient> {
  const mnemonic = await decryptSeed(vault, password);
  const account = mnemonicToAccount(mnemonic);
  // mnemonic ra khỏi scope sau hàm này; account giữ private key trong bộ nhớ
  // của chính nó (cần thiết để ký), không expose ra state React.

  const transports = buildTransports();
  return createWalletClient({
    account,
    chain,
    transport: transports[chain.id] ?? http(),
  });
}

/** Kiểm tra mật khẩu mở khóa được vault không (dùng khi unlock). */
export async function verifyPassword(
  vault: EncryptedVault,
  password: string,
): Promise<boolean> {
  try {
    await decryptSeed(vault, password);
    return true;
  } catch {
    return false;
  }
}

/**
 * Giải mã vault và trả về HDAccount (LocalAccount) để nạp vào connector.
 * Chỉ gọi khi đã xác thực mật khẩu; account chứa private key trong RAM.
 */
export async function accountFromVault(
  vault: EncryptedVault,
  password: string,
): Promise<HDAccount> {
  const mnemonic = await decryptSeed(vault, password);
  return mnemonicToAccount(mnemonic);
}
