import { describe, expect, it } from "vitest";
import {
  recoverTypedDataAddress,
  serializeSignature,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PERMIT_TYPES,
  buildPermitTypedData,
  splitSignature,
} from "./permit";

/**
 * Vòng đời chữ ký permit chỉ hỏng theo một kiểu: người dùng ký xong, tx gửi lên,
 * `ecrecover` trong token trả ra địa chỉ khác và tx revert — nghĩa là lỗi chỉ lộ
 * ra sau khi đã trả gas. Nên test ở đây khép kín cả vòng: dựng typed data → ký
 * bằng khoá thật → tách (r, s, v) → ghép lại → recover và đối chiếu địa chỉ.
 * Recover thành công tức là (r, s, v) mà `selfPermit` nhận được là đúng.
 */

/** Khoá test #2 của Anvil — công khai, chỉ dùng để ký offline trong test. */
const PK =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const account = privateKeyToAccount(PK);

const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;
const ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;

/** Domain thật của USDC Sepolia (đã xác nhận bằng eth_call: có `version: "2"`). */
const domain = {
  name: "USDC",
  version: "2",
  chainId: 11155111,
  verifyingContract: USDC_SEPOLIA,
};

const baseArgs = {
  domain,
  owner: account.address,
  spender: ROUTER,
  value: 1_000_000n,
  nonce: 0n,
  deadline: 1_893_456_000n,
};

describe("splitSignature", () => {
  it("tách đúng r (32 byte), s (32 byte), v của chữ ký 65 byte", () => {
    // Chữ ký thật do viem sinh cho `baseArgs` — pin lại để phát hiện thay đổi
    // trong cách encode typed data, không chỉ trong hàm tách.
    const sig =
      "0xa7ae24ca2f84b9f7eb6cc4424a7df862af6dd4bb619953a9b3be0a1675293e10289faf6e552987c5ec60021dbe49c9f469a7400980789f4aa72ad631bd8de96b1b" as Hex;
    const { r, s, v } = splitSignature(sig);
    expect(r).toBe(
      "0xa7ae24ca2f84b9f7eb6cc4424a7df862af6dd4bb619953a9b3be0a1675293e10",
    );
    expect(s).toBe(
      "0x289faf6e552987c5ec60021dbe49c9f469a7400980789f4aa72ad631bd8de96b",
    );
    expect(v).toBe(27);
    expect(r.length).toBe(66);
    expect(s.length).toBe(66);
  });

  it("chuẩn hoá v = 0/1 thành 27/28", () => {
    // Một số ví (và một số thư viện cũ) trả recovery id thô. Token dùng
    // `ecrecover` nên v = 0 sẽ recover ra địa chỉ rác thay vì báo lỗi.
    const body = "11".repeat(64);
    expect(splitSignature(`0x${body}00` as Hex).v).toBe(27);
    expect(splitSignature(`0x${body}01` as Hex).v).toBe(28);
  });

  it("giữ nguyên v đã ở dạng 27/28", () => {
    const body = "11".repeat(64);
    expect(splitSignature(`0x${body}1b` as Hex).v).toBe(27);
    expect(splitSignature(`0x${body}1c` as Hex).v).toBe(28);
  });
});

describe("buildPermitTypedData", () => {
  it("dùng đúng kiểu EIP-712 của ERC-2612, thứ tự field không đổi", () => {
    // Thứ tự field quyết định typehash. Đảo hai field là đổi hash, chữ ký sai.
    expect(PERMIT_TYPES.Permit.map((f) => f.name)).toEqual([
      "owner",
      "spender",
      "value",
      "nonce",
      "deadline",
    ]);
    const td = buildPermitTypedData(baseArgs);
    expect(td.primaryType).toBe("Permit");
    expect(td.types).toBe(PERMIT_TYPES);
    expect(td.message).toEqual({
      owner: account.address,
      spender: ROUTER,
      value: 1_000_000n,
      nonce: 0n,
      deadline: 1_893_456_000n,
    });
  });

  it("chữ ký ký từ typed data này recover đúng về owner", async () => {
    const td = buildPermitTypedData(baseArgs);
    const signature = await account.signTypedData(td);
    const { r, s, v } = splitSignature(signature);

    // Ghép lại từ (r, s, v) — đúng ba giá trị được nhúng vào `selfPermit`.
    const recovered = await recoverTypedDataAddress({
      ...td,
      signature: serializeSignature({ r, s, v: BigInt(v) }),
    });
    expect(recovered).toBe(account.address);
  });

  it("domain sai (thiếu `version`) làm chữ ký recover ra địa chỉ khác", async () => {
    // Đây chính là cái bẫy mà `probePermitDomain` tồn tại để tránh: USDC cần
    // `version: "2"`, UNI thì không có field này. Ký sai domain không throw —
    // nó chỉ recover ra một địa chỉ khác, và token revert.
    const signed = await account.signTypedData(buildPermitTypedData(baseArgs));
    const wrongDomain = buildPermitTypedData({
      ...baseArgs,
      domain: { name: "USDC", chainId: 11155111, verifyingContract: USDC_SEPOLIA },
    });
    const recovered = await recoverTypedDataAddress({
      ...wrongDomain,
      signature: signed,
    });
    expect(recovered).not.toBe(account.address);
  });

  it("đổi value hoặc nonce là chữ ký khác hoàn toàn", async () => {
    const a = await account.signTypedData(buildPermitTypedData(baseArgs));
    const b = await account.signTypedData(
      buildPermitTypedData({ ...baseArgs, value: 1_000_001n }),
    );
    const c = await account.signTypedData(
      buildPermitTypedData({ ...baseArgs, nonce: 1n }),
    );
    // Lý do `Swap.tsx` phải coi chữ ký là "stale" khi người dùng tăng số lượng:
    // chữ ký cũ không dùng lại được cho value mới.
    expect(b).not.toBe(a);
    expect(c).not.toBe(a);
  });
});
