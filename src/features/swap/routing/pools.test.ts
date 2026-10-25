import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { mainnet } from "wagmi/chains";
import { getV3ChainConfig } from "./chains";
import {
  computePoolAddress,
  midRateFromSqrtPrice,
  sortTokens,
  FEE_TIERS,
} from "./pools";

/**
 * Hai hàm trong file này là nền của cả routing engine, và cả hai đều thuộc loại
 * "sai âm thầm": địa chỉ pool tính lệch thì `slot0` revert và route bị bỏ như
 * thể pool không có thanh khoản; mid price lệch thì price impact hiển thị sai mà
 * không có gì báo lỗi. Nên giá trị mong đợi ở đây KHÔNG phải tự bịa — đều đã
 * đối chiếu on-chain:
 *
 *   - Địa chỉ pool Sepolia: so với `UniswapV3Factory.getPool` cho 6 pool (4 fee
 *     tier của WETH/USDC + WETH/UNI + USDC/UNI) — khớp 6/6.
 *   - Địa chỉ pool mainnet: so với pool thật đang sống của Uniswap (USDC/WETH
 *     0.05% và WETH/USDT 0.3%) — khóa rằng factory của deploy mainnet + init
 *     code hash là đúng bộ đôi, vì sai một bit thì CREATE2 ra địa chỉ khác.
 *   - sqrtPriceX96 = 496673595936264413521926321327836 là `slot0()` thật của pool
 *     WETH/USDC fee 3000 (0x6Ce0896e…9b50) lúc viết test.
 */

const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address;

const SEPOLIA_FACTORY = getV3ChainConfig(11155111)!.factory;
const MAINNET_FACTORY = getV3ChainConfig(mainnet.id)!.factory;
const BASE_FACTORY = getV3ChainConfig(8453)!.factory;

const Q96 = 2n ** 96n;

describe("sortTokens", () => {
  it("sắp theo địa chỉ tăng dần, không phụ thuộc thứ tự truyền vào", () => {
    expect(sortTokens(WETH, USDC)).toEqual([USDC, WETH]);
    expect(sortTokens(USDC, WETH)).toEqual([USDC, WETH]);
  });

  it("so sánh không phân biệt chữ hoa/thường (checksum vs lowercase)", () => {
    const [a] = sortTokens(WETH.toLowerCase() as Address, USDC);
    expect(a.toLowerCase()).toBe(USDC.toLowerCase());
  });
});

describe("computePoolAddress", () => {
  /** Kết quả `Factory.getPool` thật trên Sepolia. */
  const KNOWN: [Address, Address, number, Address][] = [
    [WETH, USDC, 3000, "0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50" as Address],
    [WETH, USDC, 500, "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1" as Address],
    [WETH, USDC, 100, "0xFeEd501c2B21D315F04946F85fC6416B640240b5" as Address],
    [WETH, USDC, 10000, "0x6418EEC70f50913ff0d756B48d32Ce7C02b47C47" as Address],
    [WETH, UNI, 3000, "0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7" as Address],
    [USDC, UNI, 3000, "0x349492f65C8B27efEF83456189b85D0Fa32afCcd" as Address],
  ];

  it.each(KNOWN)(
    "khớp Factory.getPool Sepolia cho fee %#",
    (a, b, fee, expected) => {
      expect(computePoolAddress(a, b, fee, SEPOLIA_FACTORY)).toBe(expected);
    },
  );

  it("khớp pool mainnet đang sống: USDC/WETH 0.05% (0x88e6…5640)", () => {
    expect(
      computePoolAddress(
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        500,
        MAINNET_FACTORY,
      ),
    ).toBe("0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640");
  });

  // Hai pool dưới đây đã đối chiếu `Factory.getPool` trực tiếp trên mainnet
  // (eth_call qua RPC) — khoá luôn cả việc "fee nào ứng pool nào".
  it("khớp pool mainnet: WETH/USDT 0.3% (0x4e68…fa36)", () => {
    expect(
      computePoolAddress(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        3000,
        MAINNET_FACTORY,
      ),
    ).toBe("0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36");
  });

  it("khớp pool mainnet: WETH/USDT 0.05% (0x11b8…97F6)", () => {
    expect(
      computePoolAddress(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        500,
        MAINNET_FACTORY,
      ),
    ).toBe("0x11b815efB8f581194ae79006d24E0d814B7697F6");
  });

  // Base: factory deploy riêng nhưng init code hash trùng — 4/4 pool dưới đây
  // là kết quả `Factory.getPool` thật trên Base (đối chiếu qua RPC production).
  it("khớp pool Base USDC/WETH cả 4 fee tier (factory deploy riêng)", () => {
    const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
    const WETH_BASE = "0x4200000000000000000000000000000000000006" as Address;
    expect(computePoolAddress(USDC_BASE, WETH_BASE, 100, BASE_FACTORY)).toBe(
      "0xb4CB800910B228ED3d0834cF79D697127BBB00e5",
    );
    expect(computePoolAddress(USDC_BASE, WETH_BASE, 500, BASE_FACTORY)).toBe(
      "0xd0b53D9277642d899DF5C87A3966A349A798F224",
    );
    expect(computePoolAddress(USDC_BASE, WETH_BASE, 3000, BASE_FACTORY)).toBe(
      "0x6c561B446416E1A00E8E93E221854d6eA4171372",
    );
    expect(computePoolAddress(USDC_BASE, WETH_BASE, 10000, BASE_FACTORY)).toBe(
      "0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69",
    );
  });

  it("thứ tự token không ảnh hưởng kết quả", () => {
    for (const fee of FEE_TIERS) {
      expect(computePoolAddress(WETH, USDC, fee, SEPOLIA_FACTORY)).toBe(
        computePoolAddress(USDC, WETH, fee, SEPOLIA_FACTORY),
      );
    }
  });

  it("mỗi fee tier là một pool khác nhau", () => {
    const addrs = FEE_TIERS.map((f) =>
      computePoolAddress(WETH, USDC, f, SEPOLIA_FACTORY),
    );
    expect(new Set(addrs).size).toBe(FEE_TIERS.length);
  });

  it("factory khác nhau (mainnet vs Sepolia) cho địa chỉ pool khác nhau", () => {
    expect(computePoolAddress(WETH, USDC, 3000, MAINNET_FACTORY)).not.toBe(
      computePoolAddress(WETH, USDC, 3000, SEPOLIA_FACTORY),
    );
  });
});

describe("midRateFromSqrtPrice", () => {
  it("sqrtPriceX96 = 2^96 nghĩa là giá raw = 1", () => {
    expect(midRateFromSqrtPrice(Q96, USDC, WETH, 18, 18)).toBeCloseTo(1, 12);
  });

  it("bình phương sqrt: sqrtP gấp đôi -> giá gấp 4 theo chiều token0->token1", () => {
    // token0 = USDC (địa chỉ nhỏ hơn WETH).
    expect(midRateFromSqrtPrice(2n * Q96, USDC, WETH, 18, 18)).toBeCloseTo(4, 12);
  });

  it("đảo chiều swap là nghịch đảo tỷ giá", () => {
    const fwd = midRateFromSqrtPrice(2n * Q96, USDC, WETH, 18, 18);
    const rev = midRateFromSqrtPrice(2n * Q96, WETH, USDC, 18, 18);
    expect(fwd * rev).toBeCloseTo(1, 12);
  });

  it("bù chênh lệch decimals (6 vs 18) đúng cả hai chiều", () => {
    // Giá raw = 1 nhưng 1 USDC (6 dec) = 10^12 lần đơn vị nhỏ hơn WETH (18 dec).
    expect(midRateFromSqrtPrice(Q96, USDC, WETH, 6, 18)).toBeCloseTo(1e-12, 24);
    expect(midRateFromSqrtPrice(Q96, WETH, USDC, 18, 6)).toBeCloseTo(1e12, 0);
  });

  it("khớp slot0 thật của pool WETH/USDC 0.3% trên Sepolia", () => {
    const sqrtP = 496673595936264413521926321327836n;
    // token0 = USDC(6), token1 = WETH(18).
    const usdcToWeth = midRateFromSqrtPrice(sqrtP, USDC, WETH, 6, 18);
    const wethToUsdc = midRateFromSqrtPrice(sqrtP, WETH, USDC, 18, 6);
    expect(usdcToWeth).toBeCloseTo(0.000039299133788065, 18);
    expect(wethToUsdc).toBeCloseTo(25445.853473332336, 6);
    // Hai chiều phải là nghịch đảo của nhau — nếu không thì đã có lỗi decimals.
    expect(usdcToWeth * wethToUsdc).toBeCloseTo(1, 9);
  });

  it("pool chưa khởi tạo (sqrtPriceX96 = 0) trả 0 chứ không NaN/Infinity", () => {
    // Trả NaN thì phép nhân mid của route 2-hop lây NaN và price impact hiển
    // thị "NaN%"; trả 0 để nhánh `mid <= 0` bỏ qua route.
    expect(midRateFromSqrtPrice(0n, USDC, WETH, 6, 18)).toBe(0);
    expect(midRateFromSqrtPrice(-1n, USDC, WETH, 6, 18)).toBe(0);
  });
});
