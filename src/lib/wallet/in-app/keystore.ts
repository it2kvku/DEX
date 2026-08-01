/**
 * Keystore cho in-app wallet.
 *
 * Mã hóa seed phrase bằng Web Crypto API (native, chạy ngoài JS engine):
 *   - Derive key từ mật khẩu bằng PBKDF2-SHA256, 310_000 vòng.
 *   - Mã hóa bằng AES-GCM 256-bit (có xác thực tính toàn vẹn).
 *   - Salt + IV ngẫu nhiên riêng cho mỗi lần mã hóa.
 *
 * KHÔNG dùng crypto-js. KHÔNG lưu key/seed dưới dạng thô ở bất kỳ đâu.
 * Blob mã hóa được lưu trong IndexedDB (xem storage.ts).
 */

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedVault {
  /** version schema để migrate sau này. */
  version: 1;
  /** ciphertext + auth tag, base64. */
  ciphertext: string;
  salt: string; // base64
  iv: string; // base64
  iterations: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Mã hóa seed phrase bằng mật khẩu người dùng. */
export async function encryptSeed(
  seedPhrase: string,
  password: string,
): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(seedPhrase),
  );

  return {
    version: 1,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    salt: toBase64(salt),
    iv: toBase64(iv),
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Giải mã seed phrase. Sai mật khẩu => AES-GCM ném lỗi (auth tag không khớp).
 * Chuỗi trả về nên được dùng ngay rồi bỏ; không lưu lại.
 */
export async function decryptSeed(
  vault: EncryptedVault,
  password: string,
): Promise<string> {
  const salt = fromBase64(vault.salt);
  const iv = fromBase64(vault.iv);
  const key = await deriveKey(password, salt, vault.iterations);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(vault.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Sai mật khẩu hoặc dữ liệu ví bị hỏng.");
  }
}
