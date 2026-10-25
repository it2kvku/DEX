"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { ExternalLink, Loader2 } from "lucide-react";
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { explorerTxUrl } from "@/lib/chains";
import { formatBalance, formatCompactUsd } from "@/lib/format";
import { poolSlot0Abi, npmWriteAbi } from "@/lib/abi/uniswapV3Npm";
import { withdrawAmounts } from "@/lib/lp/fees";
import { TokenLogo } from "@/components/TokenLogo";
import { Alert, Badge, Card, Skeleton } from "@/components/ui";
import { useTxCenter, useTrackedTx } from "@/features/tx/TxCenter";
import { mapSwapError } from "@/features/swap/errors";
import { NPM_BY_CHAIN, useLpPositions } from "./useLpPositions";

/**
 * Tab LP: position thanh khoản Uniswap V3 (NFT) của ví — pair, fee tier,
 * range, trạng thái in/out-of-range, PHÍ CHƯA THU HỒI (công thức protocol),
 * và hai hành động ghi: Thu hồi phí (collect) + Rút thanh khoản
 * (decreaseLiquidity + collect trong MỘT tx qua NPM.multicall).
 *
 * An toàn: cả hai là call owner-only của NPM (không cần allowance nên
 * preflight là eth_call thuần từ ví); rút thanh khoản kèm amount0Min/1Min
 * từ toán withdrawAmounts × (1 − slippage 0.5%) + deadline 20 phút — giá
 * chạy xấu hơn 0.5% là tx tự revert thay vì ăn lỗ.
 */
export function LpList() {
  const chainId = useChainId();
  const { positions, total, capped, isLoading, isError, supported, refetch } =
    useLpPositions();

  if (!supported) {
    return (
      <Card>
        <Alert variant="info">
          Chain này chưa hỗ trợ xem LP (chỉ Ethereum, Polygon, Arbitrum, Base).
        </Alert>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="space-y-3">
        <Alert variant="error">Không đọc được LP positions — thử lại.</Alert>
      </Card>
    );
  }

  const uniswapChain =
    chainId === 1
      ? "mainnet"
      : chainId === 137
        ? "polygon"
        : chainId === 42161
          ? "arbitrum"
          : "base";

  return (
    <div className="space-y-2">
      {total === 0 ? (
        <Card className="space-y-3 text-center">
          <p className="text-sm text-neutral-400">
            Bạn chưa có position thanh khoản Uniswap V3 trên mạng này.
          </p>
          <p className="text-xs text-neutral-600">
            Position LP là NFT — mở trang Uniswap để thêm thanh khoản, position
            sẽ hiện tại đây.
          </p>
        </Card>
      ) : (
        <>
          <p className="px-1 text-xs text-neutral-500">
            {capped
              ? `Hiển thị ${positions.length}/${total} position đầu tiên (giới hạn đọc 50)`
              : `${positions.length} position`}
          </p>
          {positions.map((p) => (
            <LpCard
              key={p.tokenId.toString()}
              position={p}
              uniswapChain={uniswapChain}
              npm={NPM_BY_CHAIN[chainId]!}
              onDone={refetch}
            />
          ))}
          <p className="pt-1 text-center text-[10px] text-neutral-600">
            Phí tính từ feeGrowth delta của pool (công thức protocol) — ước tính
            lúc đọc; giá trị thật do contract trả khi thu hồi.
          </p>
        </>
      )}
    </div>
  );
}

type LpPosition = Awaited<ReturnType<typeof useLpPositions>>["positions"][number];

function LpCard({
  position: p,
  uniswapChain,
  npm,
  onDone,
}: {
  position: LpPosition;
  uniswapChain: string;
  npm: Address;
  onDone: () => void;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient();
  const { track } = useTxCenter();
  const tx = useWriteContract();
  const tracked = useTrackedTx(tx.data);
  const [confirm, setConfirm] = useState<"none" | "collect" | "remove">("none");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // publicClient luôn có trên chain supported — guard sau TOÀN BỘ hooks
  // (early return giữa chừng là vi phạm rules-of-hooks).
  if (!client) {
    return (
      <Card>
        <Alert variant="error">Không có RPC client cho chain này.</Alert>
      </Card>
    );
  }

  const inRange = p.status === "in-range";
  const href = `https://app.uniswap.org/positions/${p.tokenId}?chain=${uniswapChain}`;
  const fmtPrice = (v: number) =>
    v >= 10000
      ? formatCompactUsd(v)
      : v.toLocaleString("en-US", { maximumSignificantDigits: 6 });

  const fee0 = p.fees0 !== null ? formatBalance(p.fees0, p.decimals0, 6) : null;
  const fee1 = p.fees1 !== null ? formatBalance(p.fees1, p.decimals1, 6) : null;
  const hasFees =
    p.fees0 !== null && p.fees1 !== null && (p.fees0 > 0n || p.fees1 > 0n);

  /** Preflight eth_call (owner-only, không cần override) rồi gửi qua TxCenter. */
  const send = async (calls: readonly Hex[], title: string) => {
    if (!address) return;
    setError("");
    setBusy(true);
    try {
      const data = encodeFunctionData({
        abi: npmWriteAbi,
        functionName: "multicall",
        args: [calls],
      });
      await client.call({ account: address, to: npm, data });
      tx.writeContract(
        {
          address: npm,
          abi: npmWriteAbi,
          functionName: "multicall",
          args: [calls],
        },
        {
          onSuccess: (hash) => {
            track({
              hash,
              chainId,
              from: address,
              kind: "lp",
              title,
            });
          },
        },
      );
    } catch (e) {
      setError(
        `Mô phỏng thất bại: ${mapSwapError((e as Error).message)} — đã chặn để bạn không mất gas.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const doCollect = async () => {
    const MAX_UINT128 = (1n << 128n) - 1n;
    await send(
      [
        encodeFunctionData({
          abi: npmWriteAbi,
          functionName: "collect",
          args: [
            {
              tokenId: p.tokenId,
              recipient: address!,
              amount0Max: MAX_UINT128,
              amount1Max: MAX_UINT128,
            },
          ],
        }),
      ],
      `Thu hồi phí LP #${p.tokenId.toString()}`,
    );
    setConfirm("none");
  };

  const doRemove = async () => {
    // Ước tính lượng nhận từ liquidity (TickMath port) → min sau slippage.
    const slot0 = await client.call({
      account: address!,
      to: p.poolAddress,
      data: encodeFunctionData({ abi: poolSlot0Abi, functionName: "slot0" }),
    });
    const { decodeFunctionResult } = await import("viem");
    const currentTick = Number(
      decodeFunctionResult({
        abi: poolSlot0Abi,
        functionName: "slot0",
        data: slot0.data as Hex,
      })[1],
    );
    const est = withdrawAmounts(
      p.tickLower,
      p.tickUpper,
      currentTick,
      p.liquidity,
    );
    const amount0Min = (est.amount0 * 9_950n) / 10_000n; // slippage 0.5%
    const amount1Min = (est.amount1 * 9_950n) / 10_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const MAX_UINT128 = (1n << 128n) - 1n;

    await send(
      [
        encodeFunctionData({
          abi: npmWriteAbi,
          functionName: "decreaseLiquidity",
          args: [
            {
              tokenId: p.tokenId,
              liquidity: p.liquidity,
              amount0Min,
              amount1Min,
              deadline,
            },
          ],
        }),
        // Collect với amountMax: sau decrease, cả phí lẫn phần rút đều sẵn
        // sàng trong tokensOwed — collect đẩy hết về ví.
        encodeFunctionData({
          abi: npmWriteAbi,
          functionName: "collect",
          args: [
            {
              tokenId: p.tokenId,
              recipient: address!,
              amount0Max: MAX_UINT128,
              amount1Max: MAX_UINT128,
            },
          ],
        }),
      ],
      `Rút thanh khoản LP #${p.tokenId.toString()}`,
    );
    setConfirm("none");
  };

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          <TokenLogo chainId={chainId} address={p.token0} symbol={p.symbol0} size={24} />
          <TokenLogo chainId={chainId} address={p.token1} symbol={p.symbol1} size={24} />
        </div>
        <span className="font-display text-sm font-semibold text-white">
          {p.symbol0}/{p.symbol1}
        </span>
        <Badge>{(p.fee / 10_000).toFixed(2)}%</Badge>
        <Badge tone={inRange ? "indigo" : undefined}>
          {inRange
            ? "Trong range"
            : p.status === "below"
              ? "Giá dưới range"
              : "Giá trên range"}
        </Badge>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded-lg p-1 text-neutral-500 outline-none transition-colors hover:text-accent1 focus-visible:ring-2 focus-visible:ring-white/20"
          aria-label="Mở position trên Uniswap"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          Range:{" "}
          <span className="font-mono text-neutral-300">
            {fmtPrice(p.priceLower)} – {fmtPrice(p.priceUpper)}
          </span>{" "}
          {p.symbol1}/{p.symbol0}
        </span>
        <span className="font-mono">#{p.tokenId.toString()}</span>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs">
        <span className="text-neutral-500">Phí chưa thu hồi</span>
        {p.fees0 === null || p.fees1 === null ? (
          <span className="text-neutral-500">—</span>
        ) : hasFees ? (
          <span className="font-mono text-emerald-400">
            {fee0} {p.symbol0} · {fee1} {p.symbol1}
          </span>
        ) : (
          <span className="text-neutral-500">0</span>
        )}
      </div>

      {p.liquidity === 0n && !hasFees && (
        <p className="text-xs text-amber-400">
          Position trống (đã rút hết thanh khoản) — có thể thu hồi NFT trên
          Uniswap.
        </p>
      )}

      {(hasFees || p.liquidity > 0n) && (
        <div className="flex gap-2">
          {hasFees && confirm !== "collect" && (
            <button
              onClick={() => setConfirm("collect")}
              className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 outline-none transition-colors hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Thu hồi phí
            </button>
          )}
          {p.liquidity > 0n && confirm !== "remove" && (
            <button
              onClick={() => setConfirm("remove")}
              className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 outline-none transition-colors hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Rút thanh khoản
            </button>
          )}
          {confirm !== "none" && (
            <button
              onClick={() => setConfirm("none")}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Hủy
            </button>
          )}
        </div>
      )}
      {confirm === "collect" && (
        <ConfirmStrip
          text={`Thu hồi ${fee0} ${p.symbol0} + ${fee1} ${p.symbol1} về ví của bạn?`}
          label="Xác nhận thu hồi"
          disabled={busy || tx.isPending || tracked.isPending}
          onConfirm={() => void doCollect()}
        />
      )}
      {confirm === "remove" && (
        <ConfirmStrip
          text={`Rút TOÀN BỘ thanh khoản position này (${p.symbol0}/${p.symbol1}) + phí về ví? Không đảo ngược được — min bảo vệ 0.5% slippage, giá chạy xấu hơn là tx tự revert.`}
          label="Xác nhận rút toàn bộ"
          disabled={busy || tx.isPending || tracked.isPending}
          onConfirm={() => void doRemove()}
        />
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {tracked.isReverted && (
        <Alert variant="error">Giao dịch LP bị revert trên mạng.</Alert>
      )}
      {tracked.isDropped && (
        <Alert variant="warning">
          Chưa xác nhận được — kiểm tra lại trên explorer.
        </Alert>
      )}
    </Card>
  );
}

function ConfirmStrip({
  text,
  label,
  disabled,
  onConfirm,
}: {
  text: string;
  label: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/30 p-3">
      <p className="text-xs text-neutral-300">{text}</p>
      <button
        onClick={onConfirm}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent1 px-3 py-2 text-xs font-bold text-white outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-50"
      >
        {disabled && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
