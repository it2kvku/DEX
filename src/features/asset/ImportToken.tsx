"use client";

import { useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { isAddress, type Address } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import type { TokenInfo } from "@/lib/tokens";
import { Alert, Button, Input, Label, Spinner } from "@/components/ui";

/**
 * Import token ERC-20 theo địa chỉ contract: đọc symbol/name/decimals
 * trực tiếp từ contract rồi thêm vào danh sách của chain hiện tại.
 */
export function ImportToken({
  onAdd,
  onClose,
}: {
  onAdd: (t: TokenInfo) => void;
  onClose: () => void;
}) {
  const client = usePublicClient();
  const chainId = useChainId();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TokenInfo | null>(null);

  const lookup = async () => {
    if (!client || !isAddress(address)) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const addr = address as Address;
      const [symbol, name, decimals] = await Promise.all([
        client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: addr, abi: erc20Abi, functionName: "name" }),
        client.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }),
      ]);
      setPreview({
        address: addr,
        symbol: symbol as string,
        name: name as string,
        decimals: Number(decimals),
        coingeckoId: null, // token tự import: chưa map giá
      });
    } catch {
      setError(
        "Không đọc được thông tin token. Kiểm tra địa chỉ contract có đúng chain hiện tại không.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Import token (chain id {chainId})</h4>
        <Button variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      </div>
      <div>
        <Label>Địa chỉ contract</Label>
        <Input
          value={address}
          onChange={setAddress}
          placeholder="0x..."
          error={!!address && !isAddress(address)}
        />
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {preview ? (
        <div className="space-y-3">
          <Alert variant="info">
            {preview.name} ({preview.symbol}) — {preview.decimals} decimals
          </Alert>
          <Button
            onClick={() => {
              onAdd(preview);
              onClose();
            }}
            className="w-full"
          >
            Thêm {preview.symbol}
          </Button>
        </div>
      ) : (
        <Button
          onClick={lookup}
          disabled={!isAddress(address) || busy}
          variant="secondary"
          className="w-full"
        >
          {busy ? <Spinner /> : "Tra cứu token"}
        </Button>
      )}
    </div>
  );
}
