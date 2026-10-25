import { mainnet, bsc, polygon, arbitrum, base, sepolia } from "wagmi/chains";
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
 * Danh sách token ERC-20 mặc định theo từng chain — những token thanh khoản
 * cao nhất, dùng ngay khi mở app (danh sách chuẩn Uniswap fetch runtime chỉ
 * là phần bổ sung, xem lib/uniswapTokens.ts).
 *
 * QUY TRÌNH BẮT BUỘC khi thêm token vào đây: MỌI địa chỉ + symbol + decimals
 * đều phải được verify on-chain bằng eth_call symbol()/decimals() trước khi
 * commit — sai một ký tự địa chỉ là mất tiền người dùng. Đã verify đợt này
 * qua RPC production; lưu ý các "bẫy" đã bắt được:
 *   - Polygon: WMATIC đã đổi thành WPOL (MATIC -> POL), USDT Polygon nay là
 *     "USDT0" sau đợt nâng cấp omnichain.
 *   - Arbitrum: USDT cũng nâng cấp thành "USD₮0".
 *   - MKR/Base DAI/AERO/GMX: các địa chỉ ghi nhớ đều sai hoặc rỗng — đã bỏ.
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
    {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      coingeckoId: "dai",
    },
    {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
      coingeckoId: "wrapped-bitcoin",
    },
    {
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      symbol: "UNI",
      name: "Uniswap",
      decimals: 18,
      coingeckoId: "uniswap",
    },
    {
      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      symbol: "LINK",
      name: "Chainlink",
      decimals: 18,
      coingeckoId: "chainlink",
    },
    {
      address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
      symbol: "AAVE",
      name: "Aave Token",
      decimals: 18,
      coingeckoId: "aave",
    },
    {
      address: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      symbol: "PEPE",
      name: "Pepe",
      decimals: 18,
      coingeckoId: "pepe",
    },
    {
      address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
      symbol: "SHIB",
      name: "Shiba Inu",
      decimals: 18,
      coingeckoId: "shiba-inu",
    },
    {
      address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
      symbol: "LDO",
      name: "Lido DAO Token",
      decimals: 18,
      coingeckoId: "lido-dao",
    },
    {
      address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      symbol: "stETH",
      name: "Lido Staked Ether",
      decimals: 18,
      coingeckoId: "staked-ether",
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
    {
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      symbol: "USDC",
      name: "Binance-Peg USD Coin",
      decimals: 18,
      coingeckoId: "usd-coin",
    },
    {
      address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      symbol: "ETH",
      name: "Binance-Peg Ethereum Token",
      decimals: 18,
      coingeckoId: "ethereum",
    },
    {
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      symbol: "WBNB",
      name: "Wrapped BNB",
      decimals: 18,
      coingeckoId: null,
    },
    {
      address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      symbol: "Cake",
      name: "PancakeSwap Token",
      decimals: 18,
      coingeckoId: "pancakeswap-token",
    },
    {
      address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
      symbol: "XRP",
      name: "Binance-Peg XRP",
      decimals: 18,
      coingeckoId: "ripple",
    },
  ],
  [polygon.id]: [
    {
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      symbol: "USDT0",
      name: "Tether USD (Polygon)",
      decimals: 6,
      coingeckoId: "tether",
    },
    {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      symbol: "USDC",
      name: "USD Coin (Polygon)",
      decimals: 6,
      coingeckoId: "usd-coin",
    },
    {
      address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      symbol: "WPOL",
      name: "Wrapped POL",
      decimals: 18,
      coingeckoId: null,
    },
    {
      address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
      symbol: "DAI",
      name: "Dai Stablecoin (Polygon)",
      decimals: 18,
      coingeckoId: "dai",
    },
    {
      address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
      symbol: "LINK",
      name: "Chainlink (Polygon)",
      decimals: 18,
      coingeckoId: "chainlink",
    },
    {
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      symbol: "WETH",
      name: "Wrapped Ether (Polygon)",
      decimals: 18,
      coingeckoId: "weth",
    },
  ],
  [arbitrum.id]: [
    {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "USD₮0",
      name: "Tether USD (Arbitrum)",
      decimals: 6,
      coingeckoId: "tether",
    },
    {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "USDC",
      name: "USD Coin (Arbitrum)",
      decimals: 6,
      coingeckoId: "usd-coin",
    },
    {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      symbol: "ARB",
      name: "Arbitrum",
      decimals: 18,
      coingeckoId: "arbitrum",
    },
    {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      symbol: "WETH",
      name: "Wrapped Ether (Arbitrum)",
      decimals: 18,
      coingeckoId: "weth",
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      symbol: "DAI",
      name: "Dai Stablecoin (Arbitrum)",
      decimals: 18,
      coingeckoId: "dai",
    },
    {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      symbol: "WBTC",
      name: "Wrapped BTC (Arbitrum)",
      decimals: 8,
      coingeckoId: "wrapped-bitcoin",
    },
    {
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      symbol: "LINK",
      name: "Chainlink (Arbitrum)",
      decimals: 18,
      coingeckoId: "chainlink",
    },
  ],
  [base.id]: [
    {
      address: "0x833589Fcd6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      name: "USD Coin (Base)",
      decimals: 6,
      coingeckoId: "usd-coin",
    },
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      name: "Wrapped Ether (Base)",
      decimals: 18,
      coingeckoId: "weth",
    },
    {
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      symbol: "cbBTC",
      name: "Coinbase Wrapped BTC",
      decimals: 8,
      coingeckoId: null,
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
  [base.id]: "ethereum",
  [sepolia.id]: "ethereum", // giá tham khảo; token testnet không có giá trị thật
};
