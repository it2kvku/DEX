"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress, parseUnits, formatUnits, type Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import { nativeCoingeckoId } from "@/lib/tokens";
import { useAssets } from "../asset/useBalances";
import { usePrices } from "../asset/usePrices";
import { useGasEstimate } from "./useGasEstimate";
import { useEnsResolve, looksLikeEns } from "./useEnsResolve";
import { explorerTxUrl, supportedChains } from "@/lib/chains";
import {
  formatBalance,
  formatGwei,
  formatUsd,
  shortenAddress,
} from "@/lib/format";
import { Alert, Button, Card, Input, Label, Spinner } from "@/components/ui";
import { Reveal } from "@/components/anim/Reveal";
import { Checkmark } from "@/components/anim/Checkmark";

type Step = "form" | "confirm" | "result";

export function Send() {
  const { address } = useAccount();
  const chainId = useChainId();
  const chain = supportedChains.find((c) => c.id === chainId);
  const { rows, tokens } = useAssets();

  // Lựa chọn tài sản gửi: "native" hoặc địa chỉ token.
  const [selected, setSelected] = useState<string>("native");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");

  // ENS: nếu nhập name.eth thì phân giải về địa chỉ (registry ở mainnet).
  const ens = useEnsResolve(recipient);
  const isEns = looksLikeEns(recipient);
  const to: string = isEns ? (ens.data ?? "") : recipient;

  const selectedAsset = useMemo(
    () =>
      selected === "native"
        ? rows.find((r) => r.kind === "native")
        : rows.find((r) => r.address === selected),
    [selected, rows],
  );

  const tokenAddress =
    selected === "native" ? undefined : (selected as Address);
  const decimals = selectedAsset?.decimals ?? 18;

  const gas = useGasEstimate({
    from: address,
    to,
    amount,
    decimals,
    tokenAddress,
  });

  // Giá native token để quy đổi phí gas sang USD.
  const nativeId = nativeCoingeckoId[chainId];
  const { data: prices } = usePrices(nativeId ? [nativeId] : []);
  const nativePrice = nativeId ? (prices?.[nativeId]?.usd ?? 0) : 0;

  // Validate.
  const toValid = isAddress(to);
  const amountNum = Number(amount);
  const amountValid = !!amount && amountNum > 0;
  const parsedAmount =
    amountValid && selectedAsset ? parseUnits(amount, decimals) : 0n;
  const insufficientBalance =
    selectedAsset && amountValid ? parsedAmount > selectedAsset.balance : false;

  const canProceed = toValid && amountValid && !insufficientBalance;

  // Hooks gửi giao dịch.
  const sendNative = useSendTransaction();
  const sendToken = useWriteContract();

  const txHash = sendNative.data ?? sendToken.data;
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const nativeSymbol = rows.find((r) => r.kind === "native")?.symbol ?? "";
  const feeNative = gas.data ? Number(formatUnits(gas.data.totalFeeWei, 18)) : 0;
  const feeUsd = feeNative * nativePrice;

  const submit = () => {
    if (!selectedAsset) return;
    if (tokenAddress) {
      sendToken.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as Address, parsedAmount],
      });
    } else {
      sendNative.sendTransaction({
        to: to as Address,
        value: parsedAmount,
      });
    }
    setStep("result");
  };

  const reset = () => {
    setRecipient("");
    setAmount("");
    setStep("form");
    sendNative.reset();
    sendToken.reset();
  };

  if (!address) {
    return (
      <Card>
        <Alert variant="info">Kết nối ví để gửi token.</Alert>
      </Card>
    );
  }

  // ---- Bước 3: Kết quả ----
  if (step === "result") {
    const error = sendNative.error ?? sendToken.error;
    const explorerUrl = txHash ? explorerTxUrl(chainId, txHash) : null;
    return (
      <Reveal>
        <Card className="space-y-4">
          {error ? (
            <>
              <Alert variant="error">
                Giao dịch thất bại: {shortenError(error.message)}
              </Alert>
              <Button variant="secondary" onClick={() => setStep("confirm")}>
                Quay lại
              </Button>
            </>
          ) : !txHash ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Spinner /> Đang chờ ký trong ví...
            </div>
          ) : receipt.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Spinner /> Đã gửi. Đang chờ xác nhận trên mạng...
            </div>
          ) : receipt.data?.status === "success" ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Checkmark />
              <p className="font-display text-lg font-semibold text-emerald-300">
                Giao dịch thành công
              </p>
            </div>
          ) : receipt.data?.status === "reverted" ? (
            <Alert variant="error">Giao dịch bị revert trên mạng.</Alert>
          ) : null}

          {txHash && (
            <div className="space-y-2">
              <Label>Mã giao dịch (hash)</Label>
              <div className="break-all rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-xs">
                {txHash}
              </div>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent1 transition-all hover:brightness-125"
                >
                  Xem trên block explorer →
                </a>
              )}
            </div>
          )}

          {(receipt.data || error) && (
            <Button onClick={reset} className="w-full">
              Gửi giao dịch khác
            </Button>
          )}
        </Card>
      </Reveal>
    );
  }

  // ---- Bước 2: Xác nhận ----
  if (step === "confirm") {
    return (
      <Reveal>
        <Card highlight className="space-y-4">
          <h3 className="font-display font-semibold">Xác nhận giao dịch</h3>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
            <p className="text-neutral-300">
              Bạn đang gửi{" "}
              <span className="grad-text font-display text-base font-bold">
                {amount} {selectedAsset?.symbol}
              </span>{" "}
              đến
            </p>
            <p className="mt-1.5 break-all font-mono text-xs text-neutral-400">
              {isEns && (
                <span className="mr-1 text-accent1">{recipient} →</span>
              )}
              {to}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <Row label="Mạng" value={chain?.name ?? String(chainId)} />
            <Row label="Người nhận" value={shortenAddress(to)} mono />
            {gas.data ? (
              <>
                <Row label="Gas limit" value={gas.data.gasLimit.toString()} mono />
                <Row label="Max fee" value={formatGwei(gas.data.maxFeePerGas)} mono />
                <Row
                  label="Phí tối đa ước tính"
                  value={`${feeNative.toLocaleString("en-US", {
                    maximumFractionDigits: 6,
                  })} ${nativeSymbol}${
                    nativePrice > 0 ? ` (≈ ${formatUsd(feeUsd)})` : ""
                  }`}
                  mono
                />
              </>
            ) : gas.isLoading ? (
              <div className="flex items-center gap-2 text-neutral-500">
                <Spinner /> Đang ước tính phí...
              </div>
            ) : gas.isError ? (
              <Alert variant="warning">
                Không ước tính được phí. Giao dịch có thể thất bại — kiểm tra
                lại địa chỉ và số dư.
              </Alert>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setStep("form")}
              className="flex-1"
            >
              Quay lại
            </Button>
            <Button onClick={submit} className="flex-1">
              Xác nhận &amp; Ký
            </Button>
          </div>
        </Card>
      </Reveal>
    );
  }

  // ---- Bước 1: Form ----
  return (
    <Reveal>
      <Card className="space-y-4">
        <div>
          <Label>Tài sản</Label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors focus:border-accent1/60"
          >
            <option value="native">
              {rows.find((r) => r.kind === "native")?.symbol ?? "Native"}
            </option>
            {tokens.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
          {selectedAsset && (
            <p className="mt-1.5 text-xs text-neutral-500">
              Số dư:{" "}
              {formatBalance(selectedAsset.balance, selectedAsset.decimals)}{" "}
              {selectedAsset.symbol}
            </p>
          )}
        </div>

        <div>
          <Label>Địa chỉ người nhận hoặc tên ENS</Label>
          <Input
            value={recipient}
            onChange={setRecipient}
            placeholder="0x... hoặc name.eth"
            error={!!recipient && !toValid && !ens.isLoading}
          />
          {isEns && ens.isLoading && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
              <Spinner className="!h-3 !w-3" /> Đang phân giải ENS...
            </p>
          )}
          {isEns && ens.data && (
            <p className="mt-1.5 font-mono text-xs text-emerald-400">
              ✓ {shortenAddress(ens.data)}
            </p>
          )}
          {isEns && !ens.isLoading && ens.data === null && (
            <p className="mt-1.5 text-xs text-rose-400">
              Không tìm thấy tên ENS này.
            </p>
          )}
          {!!recipient && !isEns && !isAddress(recipient) && (
            <p className="mt-1.5 text-xs text-rose-400">
              Địa chỉ không hợp lệ.
            </p>
          )}
        </div>

        <div>
          <Label>Số lượng</Label>
          <Input
            value={amount}
            onChange={setAmount}
            placeholder="0.0"
            type="number"
            error={insufficientBalance}
          />
          {insufficientBalance && (
            <p className="mt-1.5 text-xs text-rose-400">Số dư không đủ.</p>
          )}
        </div>

        <Button
          onClick={() => setStep("confirm")}
          disabled={!canProceed}
          className="w-full"
        >
          Tiếp tục
        </Button>
      </Card>
    </Reveal>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-neutral-500">{label}</span>
      <span className={mono ? "font-mono text-neutral-200" : "text-neutral-200"}>
        {value}
      </span>
    </div>
  );
}

function shortenError(msg: string): string {
  return msg.split("\n")[0].slice(0, 120);
}
