import { mainnet, polygon, arbitrum, base, sepolia } from "wagmi/chains";
import type { Address } from "viem";
import type { RouteToken } from "./path";

/**
 * Cấu hình Uniswap V3 theo chain cho routing engine nội bộ.
 *
 * Uniswap deploy V3 bằng cùng một địa chỉ trên hầu hết chain (factory
 * `0x1F98…F984`, QuoterV2 `0x61fF…B21e`, SwapRouter02 `0x68b3…Fc45`) —
 * riêng Sepolia là bản deploy 2023 với địa chỉ khác. BSC KHÔNG có Uniswap V3
 * chính chủ (chỉ có fork PancakeSwap với factory khác) nên chain đó vẫn đi
 * aggregator LI.FI.
 *
 * Địa chỉ đã đối chiếu tài liệu deployments của Uniswap; địa chỉ pool sinh ra
 * từ config này được kiểm tra known-answer trên mainnet (USDC/WETH 0.05% =
 * 0x88e6…5640) trong pools.test.ts và bằng quote thật qua RPC mainnet.
 */

export interface V3ChainConfig {
  chainId: number;
  /** UniswapV3Factory — dùng CREATE2 để tính địa chỉ pool offline. */
  factory: Address;
  /** QuoterV2 — batch quoteExactInput qua Multicall3. */
  quoterV2: Address;
  /** SwapRouter02 — đích của calldata multicall(deadline, [selfPermit?, exactInput, unwrap?]). */
  swapRouter02: Address;
  /** Token bản địa ở dạng wrapped (WETH/WMATIC) — node trung gian + unwrap. */
  wrappedNative: RouteToken;
  /**
   * Token trung gian cho route 2-hop. Mỗi connector sinh 16 ứng viên
   * (4 fee tier × 4 fee tier) nên danh sách dài = quote đắt; chỉ giữ token
   * có thanh khoản V3 sâu trên chain đó.
   */
  connectors: RouteToken[];
}

const WETH_MAINNET: RouteToken = {
  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  symbol: "WETH",
  decimals: 18,
};

const WETH_ARBITRUM: RouteToken = {
  address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  symbol: "WETH",
  decimals: 18,
};

const WMATIC_POLYGON: RouteToken = {
  address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  symbol: "WMATIC",
  decimals: 18,
};

const WETH_SEPOLIA: RouteToken = {
  address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  symbol: "WETH",
  decimals: 18,
};

const WETH_BASE: RouteToken = {
  address: "0x4200000000000000000000000000000000000006",
  symbol: "WETH",
  decimals: 18,
};

/** Factory + QuoterV2 + SwapRouter02 dùng chung một địa chỉ trên các L2. */
const CANONICAL_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as Address;
const CANONICAL_QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as Address;
const CANONICAL_SWAP_ROUTER_02 =
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address;

export const V3_CHAINS: Record<number, V3ChainConfig> = {
  [mainnet.id]: {
    chainId: mainnet.id,
    factory: CANONICAL_FACTORY,
    quoterV2: CANONICAL_QUOTER_V2,
    swapRouter02: CANONICAL_SWAP_ROUTER_02,
    wrappedNative: WETH_MAINNET,
    connectors: [
      WETH_MAINNET,
      {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        symbol: "USDC",
        decimals: 6,
      },
      {
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        symbol: "USDT",
        decimals: 6,
      },
      {
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        symbol: "DAI",
        decimals: 18,
      },
      {
        address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        symbol: "WBTC",
        decimals: 8,
      },
    ],
  },
  [polygon.id]: {
    chainId: polygon.id,
    factory: CANONICAL_FACTORY,
    quoterV2: CANONICAL_QUOTER_V2,
    swapRouter02: CANONICAL_SWAP_ROUTER_02,
    wrappedNative: WMATIC_POLYGON,
    connectors: [
      WMATIC_POLYGON,
      {
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        symbol: "USDC",
        decimals: 6,
      },
      {
        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        symbol: "USDT",
        decimals: 6,
      },
    ],
  },
  [arbitrum.id]: {
    chainId: arbitrum.id,
    factory: CANONICAL_FACTORY,
    quoterV2: CANONICAL_QUOTER_V2,
    swapRouter02: CANONICAL_SWAP_ROUTER_02,
    wrappedNative: WETH_ARBITRUM,
    connectors: [
      WETH_ARBITRUM,
      {
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        symbol: "USDC",
        decimals: 6,
      },
      {
        address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        symbol: "USDT",
        decimals: 6,
      },
      {
        address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
        symbol: "DAI",
        decimals: 18,
      },
    ],
  },
  [sepolia.id]: {
    chainId: sepolia.id,
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    quoterV2: "0xED1f6473345F45b75F8179591dd5bA1888cf2FB3",
    swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    wrappedNative: WETH_SEPOLIA,
    // Testnet chỉ có thanh khoản thật ở vài token — connector nhiều thêm
    // applications vô ích mà quoter vẫn trả fail.
    connectors: [
      WETH_SEPOLIA,
      {
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        symbol: "USDC",
        decimals: 6,
      },
    ],
  },
  // Base: Uniswap deploy V3 riêng (factory/quoter/router đều khác địa chỉ
  // canonical), init code hash thì trùng. Cả bộ đã xác minh on-chain qua RPC
  // proxy production: QuoterV2.factory()/WETH9() tự khai báo đúng, và 4/4 pool
  // USDC/WETH (4 fee tier) khớp địa chỉ CREATE2 tính bằng config này.
  [base.id]: {
    chainId: base.id,
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
    wrappedNative: WETH_BASE,
    connectors: [
      WETH_BASE,
      {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        symbol: "USDC",
        decimals: 6,
      },
      {
        address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        symbol: "cbBTC",
        decimals: 8,
      },
      {
        address: "0x50D57c5C0F8251D8c6AB4150AeE2238c7dc6f10D",
        symbol: "DAI",
        decimals: 18,
      },
    ],
  },
};

/** Chain nào chạy được engine nội bộ (có Uniswap V3 chính chủ). */
export function isEngineChain(chainId: number): boolean {
  return chainId in V3_CHAINS;
}

export function getV3ChainConfig(chainId: number): V3ChainConfig | null {
  return V3_CHAINS[chainId] ?? null;
}

/** Wrapped native của chain (WETH/WMATIC) — null nếu chain không có engine. */
export function wrappedNativeOf(chainId: number): RouteToken | null {
  return V3_CHAINS[chainId]?.wrappedNative ?? null;
}
