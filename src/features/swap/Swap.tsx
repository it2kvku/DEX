"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSendTransaction,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import {
  ArrowDown,
  CheckCircle2,
  PenLine,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import { erc20Abi } from "@/lib/abi/erc20";
import { explorerTxUrl } from "@/lib/chains";
import { formatUsd } from "@/lib/format";
import { useAssets } from "@/features/asset/useBalances";
import { useTxCenter, useTrackedTx } from "@/features/tx/TxCenter";
import { Alert, Button, Card, Label, Spinner } from "@/components/ui";
import { Checkmark } from "@/components/anim/Checkmark";
import { Reveal } from "@/components/anim/Reveal";
import { useSwapQuote } from "./useSwapQuote";
import { useSwapSimulation } from "./useSwapSimulation";
import { usePermit } from "./usePermit";
import { mapSwapError } from "./errors";
import { NATIVE_TOKEN_ADDRESS } from "./types";
import {
  isSwapChainSupported,
  SEPOLIA_CHAIN_ID,
  withSelfPermit,
} from "./uniswapSepolia";
import { RouteView } from "./RouteView";
import type { RouteToken } from "./routing/path";
import { TokenSelect, type TokenChoice } from "./TokenSelect";

const SLIPPAGE_PRESETS = [10, 50, 100]; // bps: 0.1% / 0.5% / 1%

/**
 * Swap token qua DEX Aggregator (LI.FI — tổng hợp 0x/1inch/ParaSwap/OKX...).
 * State machine: idle -> quoting -> quote_ready -> (needs_approval ->
 * approving -> approved) -> signing -> pending -> success/failed.
 */
export function Swap({
  defaultTokenIn = "native",
  defaultTokenOut = null,
  compact = false,
}: {
  defaultTokenIn?: TokenChoice;
  defaultTokenOut?: TokenChoice | null;
  /** Giao diện gọn cho trang token (sidebar swap). */
  compact?: boolean;
} = {}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { rows } = useAssets();
  // Mọi tx gửi từ đây được đăng ký vào Transaction Center: nó lo theo dõi tới
  // trạng thái cuối, thông báo, và refetch số dư/allowance — kể cả khi component
  // này đã unmount vì người dùng đổi tab.
  const { track } = useTxCenter();

  // ---- Form state ----
  const [tokenIn, setTokenIn] = useState<TokenChoice | null>(defaultTokenIn);
  const [tokenOut, setTokenOut] = useState<TokenChoice | null>(defaultTokenOut);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  // Reset lựa chọn khi đổi chain (token list khác nhau).
  useEffect(() => {
    setTokenIn(defaultTokenIn);
    setTokenOut(defaultTokenOut);
    setAmountIn("");
    setSucceeded(false);
  }, [chainId, defaultTokenIn, defaultTokenOut]);

  // ---- Token info ----
  const rowIn = rows.find((r) =>
    tokenIn === "native" ? r.kind === "native" : r.address === tokenIn,
  );
  const rowOut = rows.find((r) =>
    tokenOut === "native" ? r.kind === "native" : r.address === tokenOut,
  );
  const decimalsIn = rowIn?.decimals ?? 18;
  const decimalsOut = rowOut?.decimals ?? 18;

  // Engine routing cần symbol + decimals (không chỉ address) để encode path
  // và tính mid price, nên gói thành RouteToken.
  const tokenInInfo: RouteToken | null = rowIn
    ? {
        address: tokenIn === "native" ? NATIVE_TOKEN_ADDRESS : (tokenIn as Address),
        symbol: rowIn.symbol,
        decimals: rowIn.decimals,
      }
    : null;
  const tokenOutInfo: RouteToken | null = rowOut
    ? {
        address:
          tokenOut === "native" ? NATIVE_TOKEN_ADDRESS : (tokenOut as Address),
        symbol: rowOut.symbol,
        decimals: rowOut.decimals,
      }
    : null;

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
    tokenIn: tokenInInfo,
    tokenOut: tokenOutInfo,
    amountInWei,
    fromAddress: address,
    slippageBps,
    enabled: !succeeded && !insufficientBalance,
  });
  const q = quote.data;

  const amountOut = q ? BigInt(q.toAmount) : 0n;
  const amountOutMin = q ? BigInt(q.toAmountMin) : 0n;

  /**
   * Price impact = độ lệch giữa giá thực thi và mid price của pool, đã tách
   * phí LP ra (engine tính từ sqrtPriceX96). Aggregator không cho mid price
   * nên trả về null — khi đó không bịa số, chỉ ẩn chỉ tiêu này.
   */
  const priceImpact = q?.priceImpactPct ?? null;
  const impactTone =
    priceImpact === null
      ? "text-neutral-500"
      : priceImpact > 5
        ? "text-rose-400"
        : priceImpact > 2
          ? "text-amber-400"
          : "text-neutral-500";

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

  /**
   * Allowance đã chắc chắn đủ chưa. Phân biệt với `!needsApproval`: khi query
   * allowance còn đang chạy thì cả hai đều false, nhưng simulation vẫn phải
   * override — nếu không sẽ revert `STF` và báo lỗi giả cho người dùng.
   */
  const allowanceSufficient =
    allowance.data !== undefined && (allowance.data as bigint) >= amountInWei;

  // ---- Permit (ERC-2612): ký chữ ký thay cho một giao dịch approve ----
  // Điều kiện: token in là ERC-20 có `permit`, ví là EOA thuần (địa chỉ có
  // bytecode thì `ecrecover` không khớp) và router có `selfPermit` để nhúng
  // chữ ký vào chính tx swap. Không thoả -> im lặng fallback về approve.
  const permitToken = tokenIn !== "native" ? (tokenIn as Address) : undefined;
  const permit = usePermit({
    chainId,
    token: permitToken,
    owner: address,
    spender: q?.approvalAddress,
    enabled: !!needsApproval && q?.plan?.supportsSelfPermit === true,
  });
  const { signed: signedPermit, reset: resetPermit } = permit;

  /**
   * Chữ ký gắn chặt với (token, value, deadline). Đổi token hoặc tăng số lượng
   * là chữ ký cũ vô dụng — không phát hiện thì tx revert sau khi đã trả gas.
   */
  const permitStale =
    !!signedPermit &&
    (!permitToken ||
      signedPermit.token.toLowerCase() !== permitToken.toLowerCase() ||
      signedPermit.value < amountInWei ||
      signedPermit.deadline <= BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (permitStale) resetPermit();
  }, [permitStale, resetPermit]);

  /**
   * Chữ ký dùng được cho lệnh đang dựng. Ngoài việc chưa stale, quote phải là
   * của engine nội bộ — chỉ nó dựng lại được multicall có `selfPermit`; quote
   * từ aggregator thì chữ ký không nhúng vào đâu được.
   */
  const permitReady =
    !!signedPermit && !permitStale && q?.plan?.supportsSelfPermit === true;

  /**
   * Quote thực sự đem đi ký: khi đã có permit, calldata được dựng lại với
   * `selfPermit` chèn lên đầu `multicall` — cấp quyền và swap trong CÙNG một
   * giao dịch. Phần hiển thị vẫn dùng `q` vì hai bên chỉ khác calldata.
   */
  const txQuote = useMemo(
    () => (q && permitReady && signedPermit ? withSelfPermit(q, signedPermit) : q),
    [q, permitReady, signedPermit],
  );

  // ---- Preflight simulation: chạy calldata thật bằng eth_call trước khi ký ----
  // Với ERC-20 chưa approve, simulation override slot allowance để vẫn kiểm tra
  // được route/thanh khoản mà không cần user trả gas cho approve trước.
  // Khi đã ký permit thì KHÔNG override: eth_call chạy luôn `token.permit` với
  // chữ ký thật, nên simulation cũng là bước kiểm tra chữ ký.
  const simulation = useSwapSimulation({
    chainId,
    quote: txQuote,
    tokenInAddress: tokenInInfo?.address,
    fromAddress: address,
    amountInWei,
    overrideAllowance: !allowanceSufficient && !permitReady,
    enabled: !succeeded && !insufficientBalance,
  });
  const sim = simulation.data;
  /** Chặn ký khi simulation chứng minh lệnh sẽ revert. */
  const simulationBlocks = sim?.status === "revert";

  // ---- Approve ----
  const approveTx = useWriteContract();
  const approve = useTrackedTx(approveTx.data);
  useEffect(() => {
    if (approve.isSuccess) {
      // Allowance đã đổi -> tx center đã invalidate query, chỉ cần reset hook
      // để nút quay về trạng thái swap được.
      approveTx.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve.isSuccess]);

  const doApprove = () => {
    if (!q?.approvalAddress || tokenIn === "native" || !tokenIn) return;
    // Approve ĐÚNG số lượng cần swap — không dùng infinite approval
    // (an toàn hơn nếu router gặp sự cố).
    approveTx.writeContract(
      {
        address: tokenIn as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [q.approvalAddress, amountInWei],
      },
      {
        onSuccess: (hash) => {
          if (!address) return;
          track({
            hash,
            chainId,
            from: address,
            kind: "approve",
            title: `Approve ${debouncedAmount} ${rowIn?.symbol ?? ""}`.trim(),
          });
        },
      },
    );
  };

  // ---- Swap: gửi thẳng transactionRequest từ quote ----
  const swapTx = useSendTransaction();
  const swap = useTrackedTx(swapTx.data);
  useEffect(() => {
    if (swap.isSuccess) setSucceeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swap.isSuccess]);

  const doSwap = () => {
    if (!txQuote || simulationBlocks) return;
    swapTx.sendTransaction(
      {
        to: txQuote.txRequest.to,
        data: txQuote.txRequest.data,
        value: txQuote.txRequest.value,
        gas: txQuote.txRequest.gasLimit ?? undefined,
      },
      {
        onSuccess: (hash) => {
          if (!address) return;
          track({
            hash,
            chainId,
            from: address,
            kind: "swap",
            title: `${debouncedAmount} ${rowIn?.symbol ?? ""} → ${Number(
              formatUnits(amountOut, decimalsOut),
            ).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${
              rowOut?.symbol ?? ""
            }`,
          });
        },
      },
    );
  };

  /**
   * Ký permit cho ĐÚNG số lượng cần swap (không phải vô hạn): chữ ký chỉ cấp
   * quyền một lần cho đúng khối lượng đó, hết deadline là hết hiệu lực.
   */
  const doPermit = () => {
    if (amountInWei > 0n) void permit.sign(amountInWei);
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
    // Chữ ký đã dùng thì nonce của token đã tăng — giữ lại chỉ gây revert.
    resetPermit();
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
    (swapTx.error ? mapSwapError(swapTx.error.message) : "") ||
    (approveTx.error ? mapSwapError(approveTx.error.message) : "") ||
    (permit.error ? mapSwapError(permit.error) : "") ||
    (swap.isReverted ? "Giao dịch bị revert trên mạng." : "") ||
    (swap.isDropped
      ? "Giao dịch chưa được xác nhận — kiểm tra lại trên explorer."
      : "") ||
    (quote.error && amountInWei > 0n
      ? mapSwapError((quote.error as Error).message)
      : "");

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
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
          <p className="mt-1 text-xs text-neutral-500">
            ≈ {formatUsd(q.toAmountUsd)}
          </p>
        )}
      </div>

      {/* Route preview: đường đi thật của lệnh */}
      {q?.route && <RouteView route={q.route} />}

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
          {q.midRate !== null && (
            <Row
              label="Giá giữa (mid)"
              value={`1 ${rowIn?.symbol} ≈ ${q.midRate.toLocaleString("en-US", {
                maximumSignificantDigits: 6,
              })} ${rowOut?.symbol}`}
            />
          )}
          {priceImpact !== null && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-neutral-500">Price impact</span>
              <span className={`font-mono ${impactTone}`}>
                {priceImpact < 0.01 ? "< 0.01%" : `${priceImpact.toFixed(2)}%`}
              </span>
            </div>
          )}
          {q.lpFeePct !== null && (
            <Row
              label={q.route?.source === "aggregator" ? "Phí DEX" : "Phí LP"}
              value={`${q.lpFeePct.toFixed(2)}%`}
            />
          )}
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
          <Row
            label="Nguồn"
            value={
              q.route?.source === "uniswap-v3"
                ? `${q.tool} (engine nội bộ)`
                : `LI.FI (qua ${q.tool})`
            }
          />
        </div>
      )}

      {/* Ghi chú Sepolia */}
      {chainId === SEPOLIA_CHAIN_ID && q && (
        <p className="text-center text-xs text-neutral-600">
          Route do engine tự chấm điểm trên pool Uniswap V3 Sepolia — thanh
          khoản testnet mỏng, tỷ giá không phản ánh giá thật.
        </p>
      )}

      {/* Cảnh báo price impact lớn */}
      {priceImpact !== null && priceImpact > 5 && (
        <Alert variant="warning">
          Price impact {priceImpact.toFixed(2)}% — lệnh của bạn đẩy giá pool
          đáng kể, có thể nhận về ít hơn nhiều so với giá thị trường.
        </Alert>
      )}

      {errorText && <Alert variant="error">{errorText}</Alert>}

      {/* Kết quả preflight simulation */}
      <SimulationNotice
        state={
          !q
            ? "hidden"
            : simulation.isFetching
              ? "running"
              : sim?.status === "revert"
                ? "revert"
                : sim?.status === "ok"
                  ? "ok"
                  : "hidden"
        }
        reason={sim?.reason ?? null}
        amountOut={sim?.amountOut ?? null}
        decimalsOut={decimalsOut}
        symbolOut={rowOut?.symbol ?? ""}
        usedAllowanceOverride={sim?.usedAllowanceOverride ?? false}
      />

      {/* Nút hành động theo state machine */}
      <SwapButton
        isConnected={isConnected}
        hasTokenOut={!!tokenOut}
        hasAmount={amountInWei > 0n}
        insufficientBalance={insufficientBalance}
        quoting={quote.isLoading}
        hasQuote={!!q}
        simulating={simulation.isFetching}
        simulationFailed={simulationBlocks}
        needsApproval={!!needsApproval && !permitReady}
        permitChecking={!!needsApproval && permit.checking}
        permitAvailable={permit.available}
        permitSigning={permit.signing}
        permitReady={permitReady}
        approving={approveTx.isPending || approve.isPending}
        signing={swapTx.isPending}
        pending={swap.isPending}
        symbolIn={rowIn?.symbol ?? ""}
        onApprove={doApprove}
        onPermit={doPermit}
        onSwap={doSwap}
      />

      {permitReady && (
        <p className="text-center text-xs text-emerald-400/80">
          Đã có chữ ký permit — swap sẽ gộp cấp quyền và hoán đổi vào 1 giao
          dịch, không cần tx approve riêng.
        </p>
      )}

      {!!needsApproval &&
        !permitReady &&
        !permit.checking &&
        permit.available &&
        !permit.signing && (
          <p className="text-center text-xs text-neutral-600">
            Token này hỗ trợ ERC-2612: ký một chữ ký (miễn phí) thay vì gửi giao
            dịch approve.
          </p>
        )}

      {!!needsApproval &&
        !permit.available &&
        !permit.checking &&
        !approveTx.isPending &&
        !approve.isPending && (
          <p className="text-center text-xs text-neutral-600">
            Approve đúng số lượng cần swap (không phải vô hạn) — an toàn hơn.
          </p>
        )}
    </div>
  );
}

/**
 * Hiển thị kết quả preflight: đây là điểm khác giữa "đoán lệnh sẽ chạy" và
 * "đã chạy thử lệnh y hệt trên state hiện tại của chain".
 */
function SimulationNotice({
  state,
  reason,
  amountOut,
  decimalsOut,
  symbolOut,
  usedAllowanceOverride,
}: {
  state: "hidden" | "running" | "ok" | "revert";
  reason: string | null;
  amountOut: bigint | null;
  decimalsOut: number;
  symbolOut: string;
  usedAllowanceOverride: boolean;
}) {
  if (state === "hidden") return null;

  if (state === "running") {
    return (
      <p className="flex items-center justify-center gap-2 text-xs text-neutral-500">
        <Spinner className="!h-3 !w-3" />
        Đang mô phỏng giao dịch trước khi ký…
      </p>
    );
  }

  if (state === "revert") {
    return (
      <Alert variant="error">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Mô phỏng cho thấy giao dịch sẽ thất bại
            {reason ? `: ${mapSwapError(reason)}` : "."} Đã chặn để bạn không mất
            phí gas — hãy giảm số lượng, tăng slippage, hoặc lấy quote mới.
          </span>
        </span>
      </Alert>
    );
  }

  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-emerald-400/90">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Đã mô phỏng thành công
      {amountOut !== null &&
        ` — nhận ${Number(formatUnits(amountOut, decimalsOut)).toLocaleString(
          "en-US",
          { maximumFractionDigits: 6 },
        )} ${symbolOut}`}
      {usedAllowanceOverride && " (giả lập đã approve)"}
    </p>
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
  simulating: boolean;
  simulationFailed: boolean;
  needsApproval: boolean;
  permitChecking: boolean;
  permitAvailable: boolean;
  permitSigning: boolean;
  permitReady: boolean;
  approving: boolean;
  signing: boolean;
  pending: boolean;
  symbolIn: string;
  onApprove: () => void;
  onPermit: () => void;
  onSwap: () => void;
}) {
  const p = props;
  let label = "Swap";
  let action: (() => void) | undefined = p.onSwap;
  let disabled = false;
  let busy = false;
  let icon: "permit" | null = null;

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
  } else if (p.permitSigning) {
    label = "Chờ ký permit trong ví…";
    disabled = true;
    busy = true;
  } else if (p.approving) {
    label = `Đang approve ${p.symbolIn}…`;
    disabled = true;
    busy = true;
  } else if (p.simulating) {
    // Chặn cả approve trong lúc mô phỏng: nếu lệnh sẽ revert thì approve cũng
    // chỉ là gas bỏ đi.
    label = "Đang mô phỏng…";
    disabled = true;
    busy = true;
  } else if (p.simulationFailed) {
    label = "Mô phỏng thất bại — không thể swap";
    disabled = true;
  } else if (p.needsApproval && p.permitChecking) {
    // Đang dò xem token có permit không: chưa biết nên hiện nút nào.
    label = "Đang kiểm tra permit…";
    disabled = true;
    busy = true;
  } else if (p.needsApproval && p.permitAvailable) {
    // Ưu tiên permit: rẻ hơn (1 tx thay vì 2) và không để lại allowance dư.
    label = "Ký permit (không cần approve)";
    action = p.onPermit;
    icon = "permit";
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
      {icon === "permit" && <PenLine className="h-4 w-4" />}
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
