import type { Address } from "viem";
import { getAddress } from "viem";
import { mainnet, bsc, polygon, arbitrum, sepolia } from "wagmi/chains";

/** Slug chain trong repo Trust Wallet assets. */
const TRUSTWALLET_CHAIN: Partial<Record<number, string>> = {
  [mainnet.id]: "ethereum",
  [bsc.id]: "smartchain",
  [polygon.id]: "polygon",
  [arbitrum.id]: "arbitrum",
  [sepolia.id]: "ethereum",
};

/** Sepolia → địa chỉ mainnet để lấy logo có sẵn trên CDN. */
const SEPOLIA_LOGO_ADDRESS: Record<string, string> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14":
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238":
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984":
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
};

const CDN = "https://assets-cdn.trustwallet.com/blockchains";

/**
 * URL logo token từ Trust Wallet CDN (miễn phí, không rate limit).
 * Native: logo chain. ERC-20: logo theo contract (checksum address).
 */
export function tokenLogoUrl(
  chainId: number,
  address?: Address,
): string | null {
  const twChain = TRUSTWALLET_CHAIN[chainId];
  if (!twChain) return null;

  if (!address) {
    return `${CDN}/${twChain}/info/logo.png`;
  }

  const lower = address.toLowerCase();
  const logoAddr = SEPOLIA_LOGO_ADDRESS[lower] ?? address;

  try {
    const checksummed = getAddress(logoAddr);
    return `${CDN}/${twChain}/assets/${checksummed}/logo.png`;
  } catch {
    return null;
  }
}
