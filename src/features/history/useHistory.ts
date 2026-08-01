"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId } from "wagmi";
import { formatUnits } from "viem";

export type HistoryMode = "native" | "token";

export interface TxRow {
  hash: string;
  from: string;
  to: string;
  value: string; // đã format theo decimals
  symbol: string;
  timestamp: number;
  direction: "in" | "out";
  status: "success" | "failed";
}

/**
 * Etherscan V2 dùng một endpoint chung + tham số chainid.
 * Một API key duy nhất hoạt động trên mọi chain được hỗ trợ.
 */
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

// Chain nào được Etherscan V2 hỗ trợ (native symbol để hiển thị).
const supportedExplorer: Record<number, string> = {
  1: "ETH",
  56: "BNB",
  137: "MATIC",
  42161: "ETH",
  11155111: "ETH",
};

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

export function useHistory(mode: HistoryMode = "native") {
  const { address } = useAccount();
  const chainId = useChainId();
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? "";
  const nativeSymbol = supportedExplorer[chainId];

  return useQuery({
    queryKey: ["history", mode, chainId, address],
    enabled: !!address && !!nativeSymbol,
    staleTime: 30_000,
    queryFn: async (): Promise<TxRow[]> => {
      if (!address) return [];
      const params = new URLSearchParams({
        chainid: String(chainId),
        module: "account",
        action: mode === "native" ? "txlist" : "tokentx",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: "25",
        sort: "desc",
        apikey: apiKey,
      });

      const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
      if (!res.ok) throw new Error(`Explorer trả về ${res.status}`);
      const data = (await res.json()) as {
        status: string;
        message: string;
        result: EtherscanTx[] | string;
      };

      if (data.status !== "1" || typeof data.result === "string") {
        if (
          typeof data.result === "string" &&
          data.result.toLowerCase().includes("no transactions")
        ) {
          return [];
        }
        if (!apiKey) {
          throw new Error("Cần NEXT_PUBLIC_ETHERSCAN_API_KEY để tải lịch sử.");
        }
        return [];
      }

      const lower = address.toLowerCase();
      return data.result.map((tx): TxRow => {
        const out = tx.from.toLowerCase() === lower;
        const decimals =
          mode === "token" ? Number(tx.tokenDecimal ?? "18") : 18;
        return {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: formatUnits(BigInt(tx.value), decimals),
          symbol:
            mode === "token" ? (tx.tokenSymbol ?? "TOKEN") : nativeSymbol,
          timestamp: Number(tx.timeStamp) * 1000,
          direction: out ? "out" : "in",
          status: tx.isError === "1" ? "failed" : "success",
        };
      });
    },
  });
}

export function isExplorerSupported(chainId: number): boolean {
  return chainId in supportedExplorer;
}
