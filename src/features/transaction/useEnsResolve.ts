"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "wagmi/chains";
import { buildTransports } from "@/lib/chains";

/** Chuỗi có dạng tên ENS không (vd: vitalik.eth). */
export function looksLikeEns(input: string): boolean {
  return /^[a-z0-9-_.]+\.eth$/i.test(input.trim());
}

/**
 * Phân giải tên ENS -> địa chỉ. ENS registry nằm trên Ethereum mainnet
 * nên luôn query mainnet bất kể chain đang chọn.
 */
export function useEnsResolve(input: string) {
  const name = input.trim();
  return useQuery({
    queryKey: ["ens", name.toLowerCase()],
    enabled: looksLikeEns(name),
    staleTime: 300_000,
    retry: 1,
    queryFn: async () => {
      const client = createPublicClient({
        chain: mainnet,
        transport: buildTransports()[mainnet.id] ?? http(),
      });
      return client.getEnsAddress({ name: normalize(name) });
    },
  });
}
