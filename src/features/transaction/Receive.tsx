"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAccount, useChainId } from "wagmi";
import { supportedChains } from "@/lib/chains";
import { Alert, Button, Card } from "@/components/ui";
import { Reveal } from "@/components/anim/Reveal";

export function Receive() {
  const { address } = useAccount();
  const chainId = useChainId();
  const chain = supportedChains.find((c) => c.id === chainId);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, {
      width: 240,
      margin: 1,
      color: { dark: "#ffffff", light: "#131313" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [address]);

  if (!address) {
    return (
      <Card>
        <Alert variant="info">Kết nối ví để xem địa chỉ nhận.</Alert>
      </Card>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Reveal>
      <Card highlight className="flex flex-col items-center gap-4">
        <p className="text-sm text-neutral-400">
          Nhận token trên mạng{" "}
          <span className="grad-text font-display font-semibold">
            {chain?.name ?? `chain ${chainId}`}
          </span>
        </p>

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR code địa chỉ ví"
            width={240}
            height={240}
            className="rounded-2xl border border-white/10 shadow-glow-sm"
          />
        )}

        <div className="w-full break-all rounded-xl border border-white/10 bg-black/40 p-3.5 text-center font-mono text-sm">
          {address}
        </div>

        <Button onClick={copy} className="w-full">
          {copied ? "Đã sao chép ✓" : "Sao chép địa chỉ"}
        </Button>

        <Alert variant="warning">
          Chỉ gửi token thuộc mạng EVM tới địa chỉ này. Gửi từ mạng không tương
          thích có thể mất tài sản.
        </Alert>
      </Card>
    </Reveal>
  );
}
