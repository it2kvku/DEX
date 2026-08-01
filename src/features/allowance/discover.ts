import type { Address, Hex } from "viem";

/**
 * Tìm các cặp (token, spender) mà ví ĐÃ TỪNG approve, bằng cách quét log
 * `Approval(owner, spender, value)` qua Etherscan V2.
 *
 * Vì sao phải quét log thay vì chỉ đọc `allowance()`: allowance là một mapping.
 * Không có cách nào enumerate key của mapping từ ngoài — muốn biết ví đã cấp
 * quyền cho ai thì phải nhìn lại lịch sử event. Log cho biết "đã từng approve
 * cho ai"; giá trị hiện tại vẫn phải đọc lại bằng `allowance()` vì log không
 * biết token đã bị tiêu hết hay đã bị revoke sau đó.
 *
 * Giới hạn đã kiểm chứng thật với API key trong `.env.local`:
 *   - chainid=1 / 137 / 42161 / 11155111: `module=logs&action=getLogs` trả về
 *     `status: "1"`.
 *   - chainid=56 (BSC): trả về `status: "0"` với thông điệp "Free API access is
 *     not supported for this chain" — module logs là tính năng trả phí ở chain
 *     này. Vì vậy hàm này báo `unsupported` chứ không coi là lỗi, và UI chuyển
 *     sang chế độ dò danh sách spender đã biết.
 *   - `sort=desc` bị bỏ qua ở endpoint logs (đã thử: thứ tự trả về vẫn tăng dần
 *     theo block), nên phải tự lấy trang cuối nếu muốn log mới nhất.
 */

/** keccak256("Approval(address,address,uint256)") */
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925" as Hex;

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/** Số log mỗi trang (giới hạn của endpoint là 1000). */
const PAGE_SIZE = 1000;

/** Số trang tối đa — chặn trường hợp ví có hàng chục nghìn approve. */
const MAX_PAGES = 3;

export interface ApprovalCandidate {
  token: Address;
  spender: Address;
  /** Block của lần approve gần nhất thấy trong log (hiển thị "cấp quyền lúc nào"). */
  lastBlock: number;
  lastTimestamp: number;
}

export type DiscoveryStatus = "ok" | "unsupported" | "no-key" | "truncated";

export interface DiscoveryResult {
  status: DiscoveryStatus;
  candidates: ApprovalCandidate[];
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
}

/** topic dạng 32 byte -> address 20 byte. */
function topicToAddress(topic: string): Address {
  return `0x${topic.slice(26)}` as Address;
}

/**
 * Chain nào dùng được `module=logs` với free tier. Danh sách này là kết quả
 * thử thật từng chain, không phải suy luận từ tài liệu.
 */
const LOGS_SUPPORTED = new Set([1, 137, 42161, 11155111]);

export function isApprovalScanSupported(chainId: number): boolean {
  return LOGS_SUPPORTED.has(chainId);
}

export async function discoverApprovals(
  chainId: number,
  owner: Address,
  apiKey: string,
): Promise<DiscoveryResult> {
  if (!apiKey) return { status: "no-key", candidates: [] };
  if (!isApprovalScanSupported(chainId)) {
    return { status: "unsupported", candidates: [] };
  }

  // Owner là topic1 (indexed đầu tiên) — lọc ngay tại node thay vì tải hết log
  // của mọi token rồi lọc ở client.
  const ownerTopic = `0x${owner.slice(2).toLowerCase().padStart(64, "0")}`;

  /**
   * Gộp theo cặp (token, spender): một ví approve cùng router 20 lần thì đó vẫn
   * là MỘT allowance đang mở, chỉ khác giá trị.
   */
  const byPair = new Map<string, ApprovalCandidate>();
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      chainid: String(chainId),
      module: "logs",
      action: "getLogs",
      fromBlock: "0",
      toBlock: "latest",
      topic0: APPROVAL_TOPIC,
      topic0_1_opr: "and",
      topic1: ownerTopic,
      page: String(page),
      offset: String(PAGE_SIZE),
      apikey: apiKey,
    });

    const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
    if (!res.ok) throw new Error(`Explorer trả về ${res.status}`);
    const json = (await res.json()) as {
      status: string;
      message: string;
      result: RawLog[] | string;
    };

    if (json.status !== "1" || typeof json.result === "string") {
      const msg = typeof json.result === "string" ? json.result : json.message;
      // Ví chưa approve gì -> "No records found", không phải lỗi.
      if (/no record|no log/i.test(msg)) break;
      if (/not supported for this chain/i.test(msg)) {
        return { status: "unsupported", candidates: [] };
      }
      // Trang đầu lỗi thật thì báo lên; trang sau lỗi thì coi như hết dữ liệu.
      if (page === 1) throw new Error(msg || "Không quét được log approval.");
      break;
    }

    for (const log of json.result) {
      // Approval của ERC-721 (`Approval(owner, approved, tokenId)`) có cùng
      // topic0 nhưng tokenId là indexed -> 4 topic. ERC-20 chỉ có 3.
      if (log.topics.length !== 3) continue;
      const token = log.address.toLowerCase() as Address;
      const spender = topicToAddress(log.topics[2]);
      const key = `${token}:${spender.toLowerCase()}`;
      const block = Number(log.blockNumber);
      const prev = byPair.get(key);
      if (!prev || block >= prev.lastBlock) {
        byPair.set(key, {
          token,
          spender,
          lastBlock: block,
          lastTimestamp: Number(log.timeStamp) * 1000,
        });
      }
    }

    if (json.result.length < PAGE_SIZE) break;
    // Đủ MAX_PAGES mà vẫn còn: nói thẳng là danh sách chưa đầy đủ thay vì
    // hiển thị như thể đã quét hết.
    if (page === MAX_PAGES) truncated = true;
  }

  return {
    status: truncated ? "truncated" : "ok",
    candidates: [...byPair.values()],
  };
}
