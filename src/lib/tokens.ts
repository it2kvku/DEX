import { mainnet, bsc, polygon, arbitrum, sepolia } from "wagmi/chains";
import type { Address } from "viem";

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** id trên CoinGecko để lấy giá; null nếu không map được. */
  coingeckoId: string | null;
  /** logo tuỳ chọn. */
  logoUri?: string;
}

/**
 * Danh sách token ERC-20 mặc định theo từng chain.
 * Người dùng có thể thêm token tuỳ chỉnh sau (import theo địa chỉ contract).
 * Đây chỉ là danh sách khởi tạo cho các stablecoin/token phổ biến.
 */
export const defaultTokens: Record<number, TokenInfo[]> = {
  [mainnet.id]: [
    {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      coingeckoId: "tether",
    },
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      coingeckoId: "usd-coin",
    },
  ],
  [bsc.id]: [
    {
      address: "0x55d398326f99059fF775485246999027B3197955",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 18,
      coingeckoId: "tether",
    },
  ],
  [polygon.id]: [
    {
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      coingeckoId: "tether",
    },
    {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      coingeckoId: "usd-coin",
    },
  ],
  [arbitrum.id]: [
    {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      coingeckoId: "tether",
    },
  ],
  [sepolia.id]: [
    // Token testnet có pool Uniswap V3 thật trên Sepolia (đã xác minh liquidity on-chain).
    {
      address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      symbol: "WETH",
      name: "Wrapped Ether (Sepolia)",
      decimals: 18,
      coingeckoId: null, // token testnet không có giá thật
    },
    {
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      symbol: "USDC",
      name: "USD Coin (Sepolia)",
      decimals: 6,
      coingeckoId: null,
    },
    {
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      symbol: "UNI",
      name: "Uniswap (Sepolia)",
      decimals: 18,
      coingeckoId: null,
    },
  ],
};

/** id CoinGecko cho token bản địa của mỗi chain (để quy đổi USD). */
export const nativeCoingeckoId: Record<number, string> = {
  [mainnet.id]: "ethereum",
  [bsc.id]: "binancecoin",
  [polygon.id]: "matic-network",
  [arbitrum.id]: "ethereum",
  [sepolia.id]: "ethereum", // giá tham khảo; token testnet không có giá trị thật
};
