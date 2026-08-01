"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { ArrowDown, Settings2 } from "lucide-react";
import { erc20Abi } from "@/lib/abi/erc20";
import { explorerTxUrl } from "@/lib/chains";
import { formatUsd } from "@/lib/format";
import { useAssets } from "@/features/asset/useBalances";
import { Alert, Button, Card, Label, Spinner } from "@/components/ui";
import { Checkmark } from "@/components/anim/Checkmark";
import { Reveal } from "@/components/anim/Reveal";
import { useSwapQuote } from "./useSwapQuote";
import { NATIVE_TOKEN_ADDRESS } from "./lifi";
import {
  isSwapChainSupported,
  SEPOLIA_CHAIN_ID,
} from "./uniswapSepolia";
import { TokenSelect, type TokenChoice } from "./TokenSelect";

const SLIPPAGE_PRESETS = [10, 50, 100]; // bps: 0.1% / 0.5% / 1%

/**
 * Swap token qua DEX Aggregator (LI.FI — tổng hợp 0x/1inch/ParaSwap/OKX...).
 * State machine: idle -> quoting -> quote_ready -> (needs_approval ->
 * approving -> approved) -> signing -> pending -> success/failed.
 */
export function Swap() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { rows, refetch: refetchBalances } = useAssets();

  // ---- Form state ----
  const [tokenIn, setTokenIn] = useState<TokenChoice | null>("native");
  const [tokenOut, setTokenOut] = useState<TokenChoice | null>(null);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  // Reset lựa chọn khi đổi chain (token list khác nhau).
  useEffect(() => {
    setTokenIn("native");
    setTokenOut(null);
    setAmountIn("");
    setSucceeded(false);
  }, [chainId]);

  // ---- Token info ----
  const rowIn = rows.find((r) =>
    tokenIn === "native" ? r.kind === "native" : r.address === tokenIn,
  );
  const rowOut = rows.find((r) =>
    tokenOut === "native" ? r.kind === "native" : r.address === tokenOut,
  );
  const decimalsIn = rowIn?.decimals ?? 18;
  const decimalsOut = rowOut?.decimals ?? 18;

  const addrIn: Address | null =
    tokenIn === "native" ? NATIVE_TOKEN_ADDRESS : (tokenIn as Address | null);
  const addrOut: Address | null =
    tokenOut === "native" ? NATIVE_TOKEN_ADDRESS : (tokenOut as Address | null);

  // ---- Amount (debounce 450ms để không spam aggregator) ----
  const [debouncedAmount, setDebouncedAmount] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(amountIn), 450);
    return () => clearTimeout(t);
  }, [amountIn]);

  const amountInWei = useMemo(() => {
    try {
      return debouncedAmount ? parseUnits(debouncedAmount, decimalsIn) : 0n;
    } catch {
      return 0n;
    }
  }, [debouncedAmount, decimalsIn]);

  const insufficientBalance =
    !!rowIn && amountInWei > 0n && amountInWei > rowIn.balance;

  // ---- Quote (1 call trả về đủ: estimate + approvalAddress + calldata) ----
  const quote = useSwapQuote({
    chainId,
    tokenIn: addrIn,
    tokenOut: addrOut,
    amountInWei,
    fromAddress: address,
    slippageBps,
    enabled: !succeeded && !insufficientBalance,
  });
  const q = quote.data;

  const amountOut = q ? BigInt(q.toAmount) : 0n;
  const amountOutMin = q ? BigInt(q.toAmountMin) : 0n;

  // Price impact = chênh lệch giá trị USD vào/ra (khác slippage).
  const priceImpact = useMemo(() => {
    if (!q || !q.fromAmountUsd) return 0;
    return Math.max(0, ((q.fromAmountUsd - q.toAmountUsd) / q.fromAmountUsd) * 100);
  }, [q]);

  // ---- Allowance (chỉ với ERC-20 in) ----
  const needAllowanceCheck =
    tokenIn !== "native" && !!address && !!q?.approvalAddress && amountInWei > 0n;
  const allowance = useReadContract({
    address: (tokenIn !== "native" ? tokenIn : undefined) as
      | Address
      | undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && q?.approvalAddress ? [address, q.approvalAddress] : undefined,
    query: { enabled: needAllowanceCheck },
  });
  const needsApproval =
    needAllowanceCheck &&
    allowance.data !== undefined &&
    (allowance.data as bigint) < amountInWei;

  // ---- Approve ----
  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      allowance.refetch();
      approveTx.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  const doApprove = () => {
    if (!q?.approvalAddress || tokenIn === "native" || !tokenIn) return;
    // Approve ĐÚNG số lượng cần swap — không dùng infinite approval
    // (an toàn hơn nếu router gặp sự cố).
    approveTx.writeContract({
      address: tokenIn as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [q.approvalAddress, amountInWei],
    });
  };

  // ---- Swap: gửi thẳng transactionRequest từ quote ----
  const swapTx = useSendTransaction();
  const swapReceipt = useWaitForTransactionReceipt({ hash: swapTx.data });
  useEffect(() => {
    if (swapReceipt.isSuccess) {
      setSucceeded(true);
      refetchBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapReceipt.isSuccess]);

  const doSwap = () => {
    if (!q) return;
    swapTx.sendTransaction({
      to: q.txRequest.to,
      data: q.txRequest.data,
      value: q.txRequest.value,
      gas: q.txRequest.gasLimit ?? undefined,
    });
  };

  const reverse = () => {
    if (!tokenOut) return;
    const inPrev = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(inPrev);
    setAmountIn("");
  };

  const resetAll = () => {
    setAmountIn("");
    setSucceeded(false);
    swapTx.reset();
  };

  // ---- Guard: chain không hỗ trợ ----
  if (!isSwapChainSupported(chainId)) {
    return (
      <Card>
        <Alert variant="info">Chain hiện tại chưa hỗ trợ swap.</Alert>
      </Card>
    );
  }

  // ---- Success screen ----
  if (succeeded && swapTx.data) {
    const url = explorerTxUrl(chainId, swapTx.data);
    return (
      <Reveal>
        <Card className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <Checkmark />
            <p className="font-display text-lg font-semibold text-emerald-300">
              Swap thành công
            </p>
            <p className="text-sm text-neutral-400">
              {debouncedAmount} {rowIn?.symbol} →{" "}
              {formatUnits(amountOut, decimalsOut).slice(0, 12)}{" "}
              {rowOut?.symbol}
            </p>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-accent1 transition-all hover:brightness-125"
            >
              Xem trên block explorer →
            </a>
          )}
          <Button onClick={resetAll} className="w-full">
            Swap tiếp
          </Button>
        </Card>
      </Reveal>
    );
  }

  const errorText =
    (swapTx.error ? mapError(swapTx.error.message) : "") ||
    (approveTx.error ? mapError(approveTx.error.message) : "") ||
    (swapReceipt.isError ? "Giao dịch bị revert trên mạng." : "") ||
    (quote.error && amountInWei > 0n
      ? mapError((quote.error as Error).message)
      : "");

  return (
    <div className="space-y-3">
      {/* Header: tiêu đề + settings slippage */}
      <div className="flex items-center justify-between px-1">
        <h3 className="font-display text-sm font-semibold text-white">
          Hoán đổi
        </h3>
        <button
          onClick={() => setShowSettings((s) => !s)}
          title="Cài đặt slippage"
          className={`flex h-8 w-8 items-center justify-center rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 ${
            showSettings
              ? "border-accent1/40 bg-accent1/10 text-accent1"
              : "border-white/[0.08] bg-white/[0.04] text-neutral-400 hover:text-white"
          }`}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Slippage settings */}
      {showSettings && (
        <Card className="!p-4">
          <Label>Dung sai trượt giá (slippage)</Label>
          <div className="mt-1 flex items-center gap-1.5">
            {SLIPPAGE_PRESETS.map((bps) => (
              <button
                key={bps}
                onClick={() => {
                  setSlippageBps(bps);
                  setCustomSlippage("");
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  slippageBps === bps && !customSlippage
                    ? "bg-accent1 text-white"
                    : "bg-white/[0.05] text-neutral-400 hover:text-white"
                }`}
              >
                {(bps / 100).toFixed(1)}%
              </button>
            ))}
            <div className="relative flex-1">
              <input
                value={customSlippage}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomSlippage(v);
                  const parsed = Math.round(Number(v) * 100);
                  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5000) {
                    setSlippageBps(parsed);
                  }
                }}
                placeholder="Tùy chỉnh"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent1/60"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                %
              </span>
            </div>
          </div>
          {slippageBps >= 300 && (
            <p className="mt-2 text-xs text-amber-400">
              Slippage cao dễ bị sandwich attack (MEV). Cân nhắc giảm xuống.
            </p>
          )}
        </Card>
      )}

      {/* Box Bán */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs text-neutral-500">Bán</span>
          {rowIn && (
            <span className="text-xs text-neutral-500">
              Số dư:{" "}
              <span className="font-mono">
                {formatUnits(rowIn.balance, decimalsIn).slice(0, 10)}
              </span>{" "}
              <button
                onClick={() =>
                  setAmountIn(formatUnits(rowIn.balance, decimalsIn))
                }
                className="ml-1 font-semibold text-accent1 hover:brightness-125"
              >
                Max
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0"
            type="number"
            min="0"
            className="w-full bg-transparent font-display text-3xl font-semibold text-white outline-none placeholder:text-neutral-700"
          />
          <TokenSelect
            value={tokenIn}
            onChange={setTokenIn}
            rows={rows}
            exclude={tokenOut}
          />
        </div>
        {q && q.fromAmountUsd > 0 && (
          <p className="mt-1 text-xs text-neutral-500">
            ≈ {formatUsd(q.fromAmountUsd)}
          </p>
        )}
        {insufficientBalance && (
          <p className="mt-1 text-xs text-rose-400">Số dư không đủ.</p>
        )}
      </div>

      {/* Nút đảo chiều */}
      <div className="relative z-10 -my-5 flex justify-center">
        <button
          onClick={reverse}
          disabled={!tokenOut}
          title="Đảo chiều"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-neutral-300 outline-none transition-all hover:rotate-180 hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-40"
          style={{ transitionDuration: "300ms" }}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>

      {/* Box Mua */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs text-neutral-500">Mua (ước tính)</span>
          {quote.isFetching && <Spinner className="!h-3 !w-3" />}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-full truncate font-display text-3xl font-semibold text-white">
            {q
              ? Number(formatUnits(amountOut, decimalsOut)).toLocaleString(
                  "en-US",
                  { maximumFractionDigits: 6 },
                )
              : "0"}
          </div>
          <TokenSelect
            value={tokenOut}
            onChange={setTokenOut}
            rows={rows}
            exclude={tokenIn}
          />
        </div>
        {q && q.toAmountUsd > 0 && (
          <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
            ≈ {formatUsd(q.toAmountUsd)}
            {priceImpact > 0.05 && (
              <span
                className={
                  priceImpact > 5
                    ? "text-rose-400"
                    : priceImpact > 2
                      ? "text-amber-400"
                      : "text-neutral-500"
                }
              >
                (-{priceImpact.toFixed(2)}%)
              </span>
            )}
          </p>
        )}
      </div>

      {/* Chi tiết quote */}
      {q && (
        <div className="space-y-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs">
          <Row
            label="Tỷ giá"
            value={`1 ${rowIn?.symbol} ≈ ${rate(
              amountInWei,
              decimalsIn,
              amountOut,
              decimalsOut,
            )} ${rowOut?.symbol}`}
          />
          <Row
            label="Nhận tối thiểu"
            value={`${Number(
              formatUnits(amountOutMin, decimalsOut),
            ).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${
              rowOut?.symbol
            }`}
          />
          <Row
            label="Phí gas ước tính"
            value={q.gasUsd ? formatUsd(q.gasUsd) : "—"}
          />
          <Row label="Slippage" value={`${(slippageBps / 100).toFixed(2)}%`} />
          <Row label="Router" value={`LI.FI (qua ${q.tool})`} />
        </div>
      )}

      {/* Ghi chú Sepolia */}
      {chainId === SEPOLIA_CHAIN_ID && q && (
        <p className="text-center text-xs text-neutral-600">
          Swap trực tiếp qua pool Uniswap V3 trên Sepolia — thanh khoản testnet
          mỏng, tỷ giá không phản ánh giá thật.
        </p>
      )}

      {/* Cảnh báo price impact lớn */}
      {priceImpact > 5 && (
        <Alert variant="warning">
          Price impact {priceImpact.toFixed(2)}% — lệnh của bạn đẩy giá pool
          đáng kể, có thể nhận về ít hơn nhiều so với giá thị trường.
        </Alert>
      )}

      {errorText && <Alert variant="error">{errorText}</Alert>}

      {/* Nút hành động theo state machine */}
      <SwapButton
        isConnected={isConnected}
        hasTokenOut={!!tokenOut}
        hasAmount={amountInWei > 0n}
        insufficientBalance={insufficientBalance}
        quoting={quote.isLoading}
        hasQuote={!!q}
        needsApproval={!!needsApproval}
        approving={approveTx.isPending || approveReceipt.isLoading}
        signing={swapTx.isPending}
        pending={swapReceipt.isLoading}
        symbolIn={rowIn?.symbol ?? ""}
        onApprove={doApprove}
        onSwap={doSwap}
      />

      {needsApproval && !approveTx.isPending && !approveReceipt.isLoading && (
        <p className="text-center text-xs text-neutral-600">
          Approve đúng số lượng cần swap (không phải vô hạn) — an toàn hơn.
        </p>
      )}
    </div>
  );
}

/** Nút chính: label + hành động thay đổi theo trạng thái swap. */
function SwapButton(props: {
  isConnected: boolean;
  hasTokenOut: boolean;
  hasAmount: boolean;
  insufficientBalance: boolean;
  quoting: boolean;
  hasQuote: boolean;
  needsApproval: boolean;
  approving: boolean;
  signing: boolean;
  pending: boolean;
  symbolIn: string;
  onApprove: () => void;
  onSwap: () => void;
}) {
  const p = props;
  let label = "Swap";
  let action: (() => void) | undefined = p.onSwap;
  let disabled = false;
  let busy = false;

  if (!p.isConnected) {
    label = "Kết nối ví để swap";
    disabled = true;
  } else if (!p.hasTokenOut) {
    label = "Chọn token nhận";
    disabled = true;
  } else if (!p.hasAmount) {
    label = "Nhập số lượng";
    disabled = true;
  } else if (p.insufficientBalance) {
    label = "Số dư không đủ";
    disabled = true;
  } else if (p.quoting) {
    label = "Đang lấy quote…";
    disabled = true;
    busy = true;
  } else if (!p.hasQuote) {
    label = "Không có route khả dụng";
    disabled = true;
  } else if (p.pending) {
    label = "Đang chờ xác nhận trên mạng…";
    disabled = true;
    busy = true;
  } else if (p.signing) {
    label = "Chờ ký trong ví…";
    disabled = true;
    busy = true;
  } else if (p.approving) {
    label = `Đang approve ${p.symbolIn}…`;
    disabled = true;
    busy = true;
  } else if (p.needsApproval) {
    label = `Approve ${p.symbolIn}`;
    action = p.onApprove;
  }

  return (
    <Button
      onClick={action}
      disabled={disabled}
      className="w-full !py-3 text-base"
    >
      {busy && <Spinner />}
      {label}
    </Button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className="truncate font-mono text-neutral-300">{value}</span>
    </div>
  );
}

function rate(
  amountIn: bigint,
  decIn: number,
  amountOut: bigint,
  decOut: number,
): string {
  const a = Number(formatUnits(amountIn, decIn));
  const b = Number(formatUnits(amountOut, decOut));
  if (!a || !b) return "—";
  return (b / a).toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

/** Map lỗi kỹ thuật -> thông báo dễ hiểu. */
function mapError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("user rejected") || m.includes("user denied")) {
    return "Bạn đã từ chối giao dịch trong ví.";
  }
  if (m.includes("insufficient funds")) {
    return "Không đủ token bản địa để trả phí gas.";
  }
  if (
    m.includes("insufficient liquidity") ||
    m.includes("no available quotes") ||
    m.includes("no route")
  ) {
    return "Không đủ thanh khoản / không có route cho cặp token này.";
  }
  if (m.includes("slippage") || m.includes("return amount is not enough")) {
    return "Giá trượt quá dung sai — thử tăng slippage hoặc giảm số lượng.";
  }
  if (m.includes("expired")) {
    return "Quote đã hết hạn — nhập lại số lượng để lấy quote mới.";
  }
  if (m.includes("allowance") || m.includes("transferhelper")) {
    return "Approve chưa đủ — hãy approve lại rồi swap.";
  }
  return msg.split("\n")[0].slice(0, 140);
}
