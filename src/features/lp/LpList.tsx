"use client";

import { useChainId } from "wagmi";
import { ExternalLink } from "lucide-react";
import { formatCompactUsd } from "@/lib/format";
import { TokenLogo } from "@/components/TokenLogo";
import { Alert, Badge, Card, Skeleton } from "@/components/ui";
import { useLpPositions } from "./useLpPositions";

/**
 * Tab LP: các position thanh khoản Uniswap V3 (NFT) của ví trên chain hiện
 * tại — pair, fee tier, range giá, trạng thái in/out-of-range. V1 CHỈ ĐỌC;
 * collect fees / thay đổi liquidity là việc P7.
 *
 * Link từng position sang trang Uniswap để hành động (mạng chain tương ứng).
 */
export function LpList() {
  const chainId = useChainId();
  const { positions, total, capped, isLoading, isError, supported } =
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
    chainId === 1 ? "mainnet" : chainId === 137 ? "polygon" : chainId === 42161 ? "arbitrum" : "base";

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
          {positions.map((p) => {
            const inRange = p.status === "in-range";
            const href = `https://app.uniswap.org/positions/${p.tokenId}?chain=${uniswapChain}`;
            const fmtPrice = (v: number) =>
              v >= 10000
                ? formatCompactUsd(v)
                : v.toLocaleString("en-US", { maximumSignificantDigits: 6 });
            return (
              <Card key={p.tokenId.toString()} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <TokenLogo
                      chainId={chainId}
                      address={p.token0}
                      symbol={p.symbol0}
                      size={24}
                    />
                    <TokenLogo
                      chainId={chainId}
                      address={p.token1}
                      symbol={p.symbol1}
                      size={24}
                    />
                  </div>
                  <span className="font-display text-sm font-semibold text-white">
                    {p.symbol0}/{p.symbol1}
                  </span>
                  <Badge>{(p.fee / 10_000).toFixed(2)}%</Badge>
                  <Badge tone={inRange ? "indigo" : undefined}>
                    {inRange ? "Trong range" : p.status === "below" ? "Giá dưới range" : "Giá trên range"}
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
                {p.liquidity === 0n && (
                  <p className="text-xs text-amber-400">
                    Position trống (đã rút hết thanh khoản) — có thể thu hồi NFT
                    trên Uniswap.
                  </p>
                )}
              </Card>
            );
          })}
          <p className="pt-1 text-center text-[10px] text-neutral-600">
            Chỉ đọc — thu hồi phí / đổi range thực hiện trên Uniswap (P7 sẽ đưa
            vào app). Giá range tính từ toán tick của engine nhà mình.
          </p>
        </>
      )}
    </div>
  );
}
