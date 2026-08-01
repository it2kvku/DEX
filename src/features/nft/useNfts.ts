"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId } from "wagmi";

export interface NftItem {
  contractAddress: string;
  collectionName: string;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  tokenType: string;
}

/** Mạng được Alchemy NFT API hỗ trợ (BSC chưa có). */
const nftNetwork: Record<number, string> = {
  1: "eth-mainnet",
  137: "polygon-mainnet",
  42161: "arb-mainnet",
  11155111: "eth-sepolia",
};

export function isNftSupported(chainId: number): boolean {
  return chainId in nftNetwork;
}

interface AlchemyNft {
  contract: { address: string; name?: string };
  tokenId: string;
  tokenType: string;
  name?: string;
  image?: { cachedUrl?: string; thumbnailUrl?: string; originalUrl?: string };
}

/** Lấy danh sách NFT của ví hiện tại qua Alchemy NFT API v3. */
export function useNfts() {
  const { address } = useAccount();
  const chainId = useChainId();
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
  const network = nftNetwork[chainId];

  return useQuery({
    queryKey: ["nfts", chainId, address],
    enabled: !!address && !!network && !!apiKey,
    staleTime: 60_000,
    queryFn: async (): Promise<NftItem[]> => {
      const url =
        `https://${network}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner` +
        `?owner=${address}&withMetadata=true&pageSize=24`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`NFT API trả về ${res.status}`);
      const data = (await res.json()) as { ownedNfts?: AlchemyNft[] };
      return (data.ownedNfts ?? []).map((n): NftItem => ({
        contractAddress: n.contract.address,
        collectionName: n.contract.name ?? "Không rõ bộ sưu tập",
        tokenId: n.tokenId,
        name: n.name ?? `#${n.tokenId}`,
        imageUrl:
          n.image?.cachedUrl ?? n.image?.thumbnailUrl ?? n.image?.originalUrl ?? null,
        tokenType: n.tokenType,
      }));
    },
  });
}
