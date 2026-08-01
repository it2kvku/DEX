import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
  type TypedDataDomain,
} from "viem";

/**
 * ERC-2612 permit: thay giao dịch `approve` bằng một chữ ký off-chain.
 *
 * Người dùng ký một message `Permit`, chữ ký đó được nhúng vào chính giao dịch
 * swap qua `SwapRouter02.selfPermit`. Kết quả: 1 tx thay vì 2, không mất gas cho
 * approve, và allowance chỉ tồn tại trong đúng tx đó nếu ký `value` vừa đủ.
 *
 * Ba điểm đã kiểm chứng bằng eth_call trên Sepolia, mỗi điểm là một cái bẫy:
 *
 *  1. **Không thể suy ra domain từ ABI.** USDC dùng `{name:"USDC", version:"2"}`,
 *     UNI dùng `{name:"Uniswap"}` KHÔNG có trường `version`. Ký sai domain thì
 *     tx revert sau khi người dùng đã ký — trải nghiệm tệ hơn cả approve. Nên
 *     `probePermitDomain` xác nhận domain trước bằng eth_call.
 *  2. **Không thể dò `permit` bằng cách quét selector trong bytecode.** USDC
 *     Sepolia là proxy: selector nằm ở implementation, không nằm ở proxy.
 *  3. **`permit` fail nếu địa chỉ chủ ví có bytecode** (smart account hoặc EOA
 *     đã delegate theo EIP-7702) vì token dùng `ecrecover` thuần. Phải fallback
 *     về approve — xem `canUsePermit`.
 */

/** Ví có bytecode thì không ký ecrecover được -> phải approve. */
export async function isPlainEoa(
  client: PublicClient,
  owner: Address,
): Promise<boolean> {
  try {
    const code = await client.getCode({ address: owner });
    return !code || code === "0x";
  } catch {
    return false; // Không xác định được -> chọn đường an toàn (approve).
  }
}

const permitReadAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "permit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** Kiểu EIP-712 của ERC-2612 — cố định theo chuẩn. */
export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface PermitCapability {
  /** Domain EIP-712 đã xác nhận đúng bằng eth_call. */
  domain: TypedDataDomain;
  nonce: bigint;
}

/** Cache theo chain + token: domain là hằng số của contract. */
const domainCache = new Map<string, TypedDataDomain | null>();

/**
 * Xác nhận token hỗ trợ ERC-2612 VÀ tìm ra domain EIP-712 đúng.
 *
 * Cách làm: sinh một private key dùng một lần, ký permit `nonce: 0, value: 1`
 * với địa chỉ của key đó rồi `eth_call` `token.permit(...)`. Không revert nghĩa
 * là domain đúng. Vì owner là địa chỉ hoàn toàn mới nên nonce chắc chắn bằng 0
 * và không cần số dư — hoàn toàn không chạm vào ví thật của người dùng, và
 * không bắt người dùng ký thử.
 *
 * Trả về null nếu token không có permit hoặc không tìm được domain nào khớp.
 */
export async function probePermitDomain(
  client: PublicClient,
  token: Address,
  spender: Address,
): Promise<TypedDataDomain | null> {
  const chainId = client.chain?.id;
  if (!chainId) return null;
  const cacheKey = `${chainId}:${token.toLowerCase()}`;
  const cached = domainCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const resolved = await resolvePermitDomain(client, token, spender, chainId);
  domainCache.set(cacheKey, resolved);
  return resolved;
}

async function resolvePermitDomain(
  client: PublicClient,
  token: Address,
  spender: Address,
  chainId: number,
): Promise<TypedDataDomain | null> {
  // Không có nonces() thì chắc chắn không phải ERC-2612 (vd WETH Sepolia).
  const [name, version] = await Promise.all([
    client
      .readContract({ address: token, abi: permitReadAbi, functionName: "name" })
      .catch(() => null),
    client
      .readContract({
        address: token,
        abi: permitReadAbi,
        functionName: "version",
      })
      .catch(() => null),
    client
      .readContract({
        address: token,
        abi: permitReadAbi,
        functionName: "nonces",
        args: [spender],
      })
      .catch(() => {
        throw new Error("no-nonces");
      }),
  ]).catch(() => [null, null] as const);

  if (!name) return null;

  // Thứ tự thử: version on-chain trước (đúng nhất), rồi không có version
  // (kiểu UNI/COMP), rồi "1"/"2" là hai giá trị phổ biến nhất.
  const candidates: TypedDataDomain[] = [];
  const push = (v?: string) =>
    candidates.push(
      v === undefined
        ? { name, chainId, verifyingContract: token }
        : { name, version: v, chainId, verifyingContract: token },
    );
  if (version) push(version);
  push(undefined);
  if (version !== "1") push("1");
  if (version !== "2") push("2");

  const { privateKeyToAccount, generatePrivateKey } = await import(
    "viem/accounts"
  );
  const probe = privateKeyToAccount(generatePrivateKey());
  const deadline = (1n << 48n) - 1n;

  for (const domain of candidates) {
    try {
      const signature = await probe.signTypedData({
        domain,
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: probe.address,
          spender,
          value: 1n,
          nonce: 0n,
          deadline,
        },
      });
      const { r, s, v } = splitSignature(signature);
      await client.call({
        to: token,
        data: encodeFunctionData({
          abi: permitReadAbi,
          functionName: "permit",
          args: [probe.address, spender, 1n, deadline, v, r, s],
        }),
      });
      return domain;
    } catch {
      // Domain sai -> thử ứng viên tiếp theo.
    }
  }
  return null;
}

/**
 * Kiểm tra trọn bộ điều kiện dùng permit cho token này + ví này.
 * Trả null khi phải fallback sang approve.
 */
export async function checkPermitCapability(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<PermitCapability | null> {
  const [eoa, domain] = await Promise.all([
    isPlainEoa(client, owner),
    probePermitDomain(client, token, spender),
  ]);
  if (!eoa || !domain) return null;

  try {
    const nonce = await client.readContract({
      address: token,
      abi: permitReadAbi,
      functionName: "nonces",
      args: [owner],
    });
    return { domain, nonce };
  } catch {
    return null;
  }
}

/** Tách chữ ký 65 byte thành (r, s, v) cho ABI kiểu ERC-2612. */
export function splitSignature(signature: Hex): {
  r: Hex;
  s: Hex;
  v: number;
} {
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = parseInt(signature.slice(130, 132), 16);
  // Một số ví trả v = 0/1 thay vì 27/28.
  if (v < 27) v += 27;
  return { r, s, v };
}

export interface SignedPermit {
  token: Address;
  value: bigint;
  deadline: bigint;
  r: Hex;
  s: Hex;
  v: number;
}

/** Message EIP-712 để ví hiển thị & ký. */
export function buildPermitTypedData(args: {
  domain: TypedDataDomain;
  owner: Address;
  spender: Address;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: args.domain,
    types: PERMIT_TYPES,
    primaryType: "Permit" as const,
    message: {
      owner: args.owner,
      spender: args.spender,
      value: args.value,
      nonce: args.nonce,
      deadline: args.deadline,
    },
  };
}
