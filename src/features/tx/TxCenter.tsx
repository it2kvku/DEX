"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConfig } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { waitForTransactionReceipt } from "viem/actions";
import type { Address, Hex } from "viem";
import { explorerTxUrl, type SupportedChainId } from "@/lib/chains";
import { fetchLifiStatus } from "@/features/swap/lifi";
import { loadTxs, saveTxs, PENDING_TTL_MS } from "./storage";
import { isFinal, type TrackedTx, type TxKind, type TxNotice } from "./types";

/**
 * Transaction Center — MỘT store duy nhất cho bốn thứ vốn hay bị làm rời rạc:
 * hàng đợi giao dịch, hồi phục tx pending sau khi reload, thông báo khi tx kết
 * thúc, và làm mới số dư/allowance sau đó.
 *
 * Vì sao gộp: cả bốn đều bắt đầu từ đúng một sự kiện — "một hash chuyển từ
 * pending sang final". Nếu tách thành bốn tính năng thì mỗi tính năng phải tự
 * theo dõi hash một lần, tức 4 vòng polling cho cùng một tx và 4 chỗ có thể lệch
 * trạng thái. Ở đây chỉ có một watcher cho mỗi tx, mọi thứ khác là hệ quả.
 *
 * Điểm khác biệt so với `useWaitForTransactionReceipt` đặt trong component: hook
 * đó chết theo component. Đổi tab hoặc reload là mất dấu tx đang chờ, dù nó vẫn
 * đang chạy trên mạng. Store này sống ở tầng provider và persist hash xuống
 * localStorage, nên tx được theo dõi liên tục cho tới khi vào block.
 */

/** Prefix của query key cần làm mới sau khi một tx vào block. */
const REFETCH_KEYS = [
  "balance", // useBalance (native)
  "readContract", // useReadContract — allowance
  "readContracts", // useReadContracts — balanceOf hàng loạt
  "history", // useHistory (Etherscan)
  "allowances", // Allowance manager
  "permit-capability", // nonce ERC-2612 đã tăng sau khi permit được dùng
  "swap-quote", // state pool đã đổi sau swap
] as const;

/** Nhãn hiển thị theo loại giao dịch. */
const KIND_LABEL: Record<TxKind, string> = {
  swap: "Swap",
  approve: "Approve",
  revoke: "Thu hồi quyền",
  send: "Chuyển token",
  bridge: "Bridge",
};

/** Chu kỳ quét lại hàng đợi — để thử lại watcher đã chết vì lỗi RPC. */
const SWEEP_INTERVAL_MS = 20_000;

/** Thời gian toast tự tắt. */
const NOTICE_TTL_MS = 6_000;

/**
 * Bridge cross-chain có thể mất vài chục phút — không dùng TTL pending 30 phút
 * chung. Sau BRIDGE_TTL: tx nguồn ĐÃ thành công (thật), chỉ là chưa xác nhận
 * được phía đích → đánh success kèm ghi chú, không đổ lỗi cho bridge.
 */
const BRIDGE_TTL_MS = 2 * 60 * 60_000;

/** Chu kỳ poll LI.FI /status cho tx đang "receiving". */
const BRIDGE_POLL_FIRST_MS = 3_000;
const BRIDGE_POLL_INTERVAL_MS = 15_000;

export interface TrackArgs {
  hash: Hex;
  chainId: number;
  from: Address;
  kind: TxKind;
  /** Mô tả ngắn, vd "0.1 ETH → 320 USDC". */
  title: string;
  /** Chỉ kind "bridge": tool name + chain đích để poll LI.FI /status. */
  bridge?: { tool: string; toChainId: number };
}

interface TxCenterValue {
  txs: TrackedTx[];
  pendingCount: number;
  notices: TxNotice[];
  track: (args: TrackArgs) => void;
  dismissNotice: (id: string) => void;
  clearFinished: () => void;
}

const Ctx = createContext<TxCenterValue | null>(null);

export function TxCenterProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [txs, setTxs] = useState<TrackedTx[]>([]);
  const [notices, setNotices] = useState<TxNotice[]>([]);

  /** Hash đang có watcher chạy — chặn việc theo dõi trùng cùng một tx. */
  const watching = useRef(new Set<string>());

  /** Nạp hàng đợi đã persist (pending recovery) ngay khi mount. */
  useEffect(() => {
    setTxs(loadTxs());
  }, []);

  useEffect(() => {
    saveTxs(txs);
  }, [txs]);

  const pushNotice = useCallback((notice: TxNotice) => {
    setNotices((prev) => [...prev, notice]);
    // Tự tắt sau NOTICE_TTL_MS. Đặt timer ngay tại nơi tạo notice thay vì trong
    // component hiển thị: component có thể unmount (đổi tab) trước khi timer
    // chạy, khi đó notice sẽ nằm lại trong store mãi mãi.
    setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    }, NOTICE_TTL_MS);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /** Cập nhật một bản ghi theo id (hash có thể đã đổi nên không khoá theo hash). */
  const patch = useCallback((id: string, next: Partial<TrackedTx>) => {
    setTxs((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...next } : tx)),
    );
  }, []);

  /**
   * Làm mới dữ liệu on-chain sau khi tx vào block. Chỉ invalidate theo prefix
   * key thay vì `invalidateQueries()` trơn: quét tất cả sẽ kéo lại cả giá
   * CoinGecko và NFT metadata — những thứ swap không hề làm thay đổi.
   */
  const refetchOnChainData = useCallback(() => {
    for (const key of REFETCH_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  /**
   * Poll LI.FI /status cho tx bridge đang "receiving" tới khi DONE/FAILED.
   * Lần đầu sau 3s (bridge nhanh có thể xong trong vài giây), sau đó 15s/lần.
   * Lỗi mạng xen giữa (status unknown) KHÔNG dừng poll — chỉ TTL dừng.
   */
  const watchBridgeDestination = useCallback(
    async (id: string, sourceHash: Hex, tx: TrackedTx) => {
      const bridge = tx.bridge!;
      const deadline = tx.createdAt + BRIDGE_TTL_MS;
      let nextDelay = BRIDGE_POLL_FIRST_MS;

      try {
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, nextDelay));
          nextDelay = BRIDGE_POLL_INTERVAL_MS;

          let status;
          try {
            status = await fetchLifiStatus({
              bridge: bridge.tool,
              fromChain: tx.chainId,
              toChain: bridge.toChainId,
              txHash: sourceHash,
            });
          } catch {
            continue; // Lỗi mạng — thử lại ở vòng sau.
          }

          if (status.status === "done") {
            patch(id, {
              status: "success",
              finalizedAt: Date.now(),
              bridge: {
                ...bridge,
                receivingTxHash: status.receivingTxHash ?? undefined,
              },
            });
            pushNotice({
              id: `${id}:bridge-done`,
              tone: "success",
              message: `Bridge hoàn tất — ${tx.title}`,
              url: status.receivingTxHash
                ? explorerTxUrl(bridge.toChainId, status.receivingTxHash)
                : null,
            });
            refetchOnChainData();
            return;
          }
          if (status.status === "failed") {
            // Tx nguồn thành công nhưng bridge thất bại phía LI.FI (thường là
            // REFUNDED về ví nguồn) — không phải "reverted" của chính tx.
            patch(id, {
              status: "reverted",
              finalizedAt: Date.now(),
              error: `bridge thất bại${status.substatus ? ` (${status.substatus})` : ""}`,
              bridge: { ...bridge, substatus: status.substatus ?? undefined },
            });
            pushNotice({
              id: `${id}:bridge-failed`,
              tone: "error",
              message: `Bridge thất bại${status.substatus ? ` — ${status.substatus}` : ""}. Kiểm tra ví nguồn (thường được refund).`,
              url: explorerTxUrl(tx.chainId, sourceHash),
            });
            refetchOnChainData();
            return;
          }
          // pending / unknown — poll tiếp, và lưu tx đích nếu LI.FI đã lộ.
          if (status.receivingTxHash) {
            patch(id, {
              bridge: {
                ...bridge,
                receivingTxHash: status.receivingTxHash,
              },
            });
          }
        }
        // Hết TTL mà chưa biết kết quả: tx nguồn ĐÃ thành công — không gọi là
        // thất bại, ghi chú để người dùng tự kiểm tra.
        patch(id, {
          status: "success",
          finalizedAt: Date.now(),
          error: "chưa xác nhận được phía đích sau 2 giờ — kiểm tra explorer",
        });
        refetchOnChainData();
      } finally {
        watching.current.delete(id);
      }
    },
    [patch, pushNotice, refetchOnChainData],
  );


  /**
   * Theo dõi một tx tới trạng thái cuối. `waitForTransactionReceipt` của viem tự
   * lo cả trường hợp tx bị thay thế (speed-up/cancel trong ví): nó dò tx cùng
   * nonce trong block mới và gọi `onReplaced` với hash mới — nhờ vậy tx được
   * speed-up không bị báo là "mất tích".
   */
  const watch = useCallback(
    async (tx: TrackedTx) => {
      if (watching.current.has(tx.id)) return;
      watching.current.add(tx.id);

      // Tx đã pending quá lâu: có thể đã bị drop khỏi mempool nên chờ tiếp là
      // treo vô hạn. Đánh dấu dropped và để người dùng tự kiểm tra explorer.
      // Bridge dùng TTL riêng (dài hơn nhiều) phía dưới.
      const age = Date.now() - tx.createdAt;
      const isBridgeTtl = tx.kind === "bridge";
      if (age > (isBridgeTtl ? BRIDGE_TTL_MS : PENDING_TTL_MS)) {
        patch(tx.id, {
          status: isBridgeTtl ? "success" : "dropped",
          finalizedAt: Date.now(),
          error: isBridgeTtl
            ? "đã vào block phía nguồn nhưng chưa xác nhận được phía đích — kiểm tra explorer"
            : undefined,
        });
        watching.current.delete(tx.id);
        return;
      }

      const client = config.getClient({
        chainId: tx.chainId as SupportedChainId,
      });

      let hash = tx.hash;
      try {
        const receipt = await waitForTransactionReceipt(client, {
          hash,
          // Thời gian còn lại của TTL, không phải TTL đầy: tx nạp lại từ
          // localStorage đã "già" sẵn một khoảng.
          timeout: Math.max(
            (isBridgeTtl ? BRIDGE_TTL_MS : PENDING_TTL_MS) - age,
            30_000,
          ),
          onReplaced: (replacement) => {
            hash = replacement.transaction.hash;
            patch(tx.id, {
              hash,
              replacedBy: hash,
              replacement: replacement.reason,
            });
          },
        });

        const reverted = receipt.status === "reverted";

        // Bridge cross-chain: tx nguồn xong CHƯA là hết chuyện — token đang
        // đường sang chain đích. Chuyển "receiving" và poll LI.FI /status.
        if (!reverted && tx.kind === "bridge" && tx.bridge) {
          patch(tx.id, { status: "receiving", hash: receipt.transactionHash });
          refetchOnChainData();
          pushNotice({
            id: `${tx.id}:receiving`,
            tone: "success",
            message: `${KIND_LABEL[tx.kind]} đã xác nhận phía nguồn — đang chờ token sang chain đích.`,
            url: explorerTxUrl(tx.chainId, receipt.transactionHash),
          });
          await watchBridgeDestination(tx.id, receipt.transactionHash, tx);
          return;
        }

        patch(tx.id, {
          hash: receipt.transactionHash,
          status: reverted ? "reverted" : "success",
          finalizedAt: Date.now(),
        });

        const url = explorerTxUrl(tx.chainId, receipt.transactionHash);
        pushNotice({
          id: `${tx.id}:${receipt.status}`,
          tone: reverted ? "error" : "success",
          message: reverted
            ? `${KIND_LABEL[tx.kind]} thất bại: giao dịch bị revert trên mạng.`
            : `${KIND_LABEL[tx.kind]} thành công — ${tx.title}`,
          url,
        });

        // Kể cả khi revert vẫn refetch: gas đã bị trừ nên số dư native đổi.
        refetchOnChainData();
      } catch (e) {
        const message = (e as Error).message ?? "";
        // Hết timeout != thất bại. Tx có thể vẫn đang trong mempool, nên đánh
        // dấu dropped (trạng thái "không biết") chứ không phải reverted.
        patch(tx.id, {
          status: "dropped",
          finalizedAt: Date.now(),
          error: message.split("\n")[0].slice(0, 160),
        });
        pushNotice({
          id: `${tx.id}:dropped`,
          tone: "warning",
          message: `${KIND_LABEL[tx.kind]} chưa xác nhận được sau ${Math.round(
            (isBridgeTtl ? BRIDGE_TTL_MS : PENDING_TTL_MS) / 60_000,
          )} phút — kiểm tra lại trên explorer.`,
          url: explorerTxUrl(tx.chainId, hash),
        });
      } finally {
        watching.current.delete(tx.id);
      }
    },
    [config, patch, pushNotice, refetchOnChainData, watchBridgeDestination],
  );

  /**
   * Gắn watcher cho mọi tx pending chưa được theo dõi. Chạy lại theo chu kỳ để
   * hồi phục các watcher đã chết vì lỗi RPC tạm thời — nếu chỉ dựa vào effect
   * theo `txs`, một watcher thất bại sẽ không bao giờ được thử lại.
   */
  useEffect(() => {
    const sweep = () => {
      for (const tx of txs) {
        if (!isFinal(tx) && !watching.current.has(tx.id)) void watch(tx);
      }
    };
    sweep();
    const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [txs, watch]);

  const track = useCallback((args: TrackArgs) => {
    setTxs((prev) => {
      // Cùng một hash trên cùng chain là cùng một tx — React 18 có thể gọi
      // handler hai lần trong strict mode.
      if (
        prev.some(
          (t) =>
            t.hash.toLowerCase() === args.hash.toLowerCase() &&
            t.chainId === args.chainId,
        )
      ) {
        return prev;
      }
      const record: TrackedTx = {
        id: `${args.chainId}:${args.hash.toLowerCase()}`,
        hash: args.hash,
        chainId: args.chainId,
        from: args.from,
        kind: args.kind,
        title: args.title,
        status: "pending",
        createdAt: Date.now(),
        ...(args.bridge ? { bridge: args.bridge } : {}),
      };
      return [record, ...prev];
    });
  }, []);

  const clearFinished = useCallback(() => {
    setTxs((prev) => prev.filter((t) => !isFinal(t)));
  }, []);

  const value = useMemo<TxCenterValue>(
    () => ({
      txs,
      pendingCount: txs.filter((t) => !isFinal(t)).length,
      notices,
      track,
      dismissNotice,
      clearFinished,
    }),
    [txs, notices, track, dismissNotice, clearFinished],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTxCenter(): TxCenterValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTxCenter phải dùng trong TxCenterProvider");
  return ctx;
}

/**
 * Trạng thái của một hash cụ thể, để component lấy đúng thứ nó cần mà không tự
 * mở thêm một `useWaitForTransactionReceipt` — hash chỉ được theo dõi một lần,
 * ở tầng provider.
 */
export function useTrackedTx(hash: Hex | undefined) {
  const { txs } = useTxCenter();
  const record = hash
    ? txs.find((t) => t.hash.toLowerCase() === hash.toLowerCase())
    : undefined;
  return {
    record,
    // Vừa gửi xong, provider chưa kịp tạo bản ghi -> vẫn coi là đang chờ.
    isPending: !!hash && (!record || record.status === "pending"),
    isSuccess: record?.status === "success",
    isReverted: record?.status === "reverted",
    isDropped: record?.status === "dropped",
  };
}
