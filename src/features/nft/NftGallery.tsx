"use client";

import { useChainId } from "wagmi";
import { useNfts, isNftSupported } from "./useNfts";
import { explorerAddressUrl } from "@/lib/chains";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui";
import { Reveal } from "@/components/anim/Reveal";

export function NftGallery() {
  const chainId = useChainId();
  const { data, isLoading, isError, refetch } = useNfts();
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";

  if (!isNftSupported(chainId)) {
    return (
      <Card>
        <Alert variant="info">
          Chain hiện tại chưa hỗ trợ NFT API (BSC chưa có trên Alchemy). Đổi
          sang Ethereum, Polygon, Arbitrum hoặc Sepolia.
        </Alert>
      </Card>
    );
  }

  if (!apiKey) {
    return (
      <Card>
        <Alert variant="warning">
          Cần NEXT_PUBLIC_ALCHEMY_API_KEY để tải danh sách NFT.
        </Alert>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="!p-3">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="mt-2 h-3.5 w-2/3" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="space-y-3">
        <Alert variant="error">Không tải được NFT. Thử lại.</Alert>
        <Button variant="secondary" onClick={() => refetch()}>
          Thử lại
        </Button>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <Alert variant="info">
          Ví này chưa sở hữu NFT nào trên chain hiện tại.
        </Alert>
      </Card>
    );
  }

  return (
    <Reveal className="grid grid-cols-2 gap-3" watch={data.length}>
      {data.map((nft) => {
        const url = explorerAddressUrl(chainId, nft.contractAddress);
        return (
          <Card
            key={`${nft.contractAddress}-${nft.tokenId}`}
            className="!p-3 transition-transform hover:-translate-y-0.5"
          >
            <div className="aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
              {nft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nft.imageUrl}
                  alt={nft.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl text-neutral-700">
                  ◇
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1">
              <p className="truncate text-sm font-medium">{nft.name}</p>
              <p className="truncate text-xs text-neutral-500">
                {nft.collectionName}
              </p>
              <div className="flex items-center justify-between">
                <Badge tone="indigo">{nft.tokenType}</Badge>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent1 transition-all hover:brightness-125"
                  >
                    Explorer →
                  </a>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </Reveal>
  );
}
