# Web3 Wallet — Ví Web3 đa chain kèm DEX engine tự viết

Tài liệu tổng hợp toàn bộ dự án: kiến trúc, luồng dữ liệu, và lý do đằng sau
những quyết định kỹ thuật quan trọng.

---

## 1. Tổng quan

Ứng dụng web **non-custodial wallet + DEX** chạy trên 5 chain EVM
(Ethereum, BNB Chain, Polygon, Arbitrum, Sepolia). Khóa riêng không bao giờ rời
khỏi máy người dùng: hoặc nằm trong ví extension (MetaMask/WalletConnect), hoặc
nằm trong một vault mã hóa lưu ở IndexedDB của trình duyệt.

Điểm khác biệt so với một "ví demo" thông thường: tab Swap **không gọi API
aggregator rồi hiển thị kết quả**. Trên Sepolia, dự án tự dựng một routing engine
Uniswap V3 hoàn chỉnh — sinh route ứng viên, chấm điểm theo output ròng sau gas,
tính price impact thật từ `sqrtPriceX96`, dựng calldata, mô phỏng trước khi ký, và
gộp approve + swap vào **một** giao dịch bằng ERC-2612 `selfPermit`.

Giao diện và toàn bộ thông báo lỗi bằng tiếng Việt.

### Hai trang chính

| Route  | Nội dung |
|--------|----------|
| `/`    | Landing: hero aurora, mockup ví nghiêng 3D, bento 4 tính năng, carousel năng lực, footer |
| `/app` | Shell ví: 8 tab trong một card trung tâm, command palette ⌘K, hàng đợi giao dịch |

8 tab: **Tài sản · Swap · Gửi · Nhận · Lịch sử · NFT · Quyền · Ví**.

---

## 2. Tech stack

**Frontend**
- Next.js 15 (App Router) · React 19.1.1 · TypeScript 5.9 strict
- Tailwind CSS 3.4 — palette `accent1 #ff007a`, `accent2 #b478ff`, `accent3 #4c82fb`
- framer-motion 12 (tubelight tabs, layout animation), three.js (nền WebGL),
  anime.js, lucide-react, Iconify (`cryptocurrency-color`)
- `next/font/google`: Inter + Space Grotesk, subset `latin` + `vietnamese`,
  self-host lúc build nên tương thích CSP `font-src 'self'`

**Web3**
- wagmi 2.17 · viem 2.37 · RainbowKit 2.2 (darkTheme, accent `#ff007a`)
- TanStack React Query 5.90 — `staleTime` 10s, `retry` 2

**Testing / CI**
- Vitest 3 (environment `node`) · Playwright 1.56 (Chromium) · GitHub Actions

---

## 3. Cấu trúc thư mục

```
src/
├── app/                        # App Router
│   ├── layout.tsx              # font + <Providers>, lang="vi"
│   ├── providers.tsx           # chuỗi provider (thứ tự có ý nghĩa)
│   ├── page.tsx                # landing
│   ├── app/page.tsx            # shell ví: 8 tab + tubelight tabs + palette
│   ├── error.tsx               # boundary tầng route
│   ├── global-error.tsx        # boundary tầng layout
│   └── globals.css
├── components/                 # UI dùng chung
│   ├── ui.tsx                  # Card, Button, Input, Alert, Badge, Skeleton, Spinner
│   ├── WalletCommandPalette.tsx
│   ├── WidgetErrorBoundary.tsx
│   ├── NetworkSelector.tsx · WalletButton.tsx · CryptoIcon.tsx · TokenAvatar.tsx
│   ├── AuroraBackground.tsx · BoxesBackground.tsx · HoverButton.tsx · Toast.tsx
│   ├── anim/                   # Reveal, CountUp, Checkmark
│   ├── ui/background-boxes.tsx
│   └── webgl/                  # Background, BackgroundCanvas (three.js)
├── features/
│   ├── landing/                # Landing, TiltMockup, BentoFeatures, FeatureCarousel, Footer
│   ├── asset/                  # AssetList, ImportToken, useBalances, usePrices, useTokenList
│   ├── swap/                   # ★ trái tim dự án — xem §6
│   │   └── routing/            # path, pools, quoter, multicall3
│   ├── transaction/            # Send, Receive, useGasEstimate, useEnsResolve
│   ├── history/                # History, useHistory (Etherscan V2)
│   ├── nft/                    # NftGallery, useNfts (Alchemy NFT v3)
│   ├── allowance/              # AllowanceManager, discover, spenders, useAllowances
│   ├── tx/                     # ★ Transaction Center — xem §7
│   └── in-app-wallet/          # Context, Panel, forms
└── lib/
    ├── chains.ts               # supportedChains + buildTransports + explorer URL
    ├── wagmi.ts · tokens.ts · format.ts · utils.ts
    ├── abi/erc20.ts
    └── wallet/in-app/          # keystore, storage, signer, connector
e2e/                            # navigation, command-palette, in-app-wallet + rpc-mock
```

Quy ước: `lib/` là code thuần không phụ thuộc React; `features/<domain>/` gom
component + hook + logic của một miền nghiệp vụ; `components/` chỉ chứa UI không
biết gì về nghiệp vụ.

---

## 4. Hạ tầng chain & RPC

`src/lib/chains.ts` khai báo 5 chain và dựng transport theo mô hình **fallback
nhiều tầng**:

```ts
transports[chain.id] = fallback(
  urls.map((url) => http(url, { timeout: 10_000 })),
  { rank: false },
);
```

Thứ tự URL: Alchemy trước (nếu có `NEXT_PUBLIC_ALCHEMY_API_KEY`), sau đó là các
RPC công khai **có bật CORS** (publicnode, drpc, 1rpc, binance, polygon-rpc,
arb1). Nhờ vậy app chạy được ngay khi chưa cấu hình key nào — quan trọng cho CI
và cho người chấm đồ án.

`rank: false` là chủ ý: xếp hạng động sẽ bắn thêm request đo latency tới mọi
endpoint, tốn quota Alchemy vô ích khi endpoint đầu vẫn khỏe.

| Chain | ID | Explorer | RPC dự phòng |
|---|---|---|---|
| Ethereum | 1 | etherscan.io | publicnode, drpc, 1rpc |
| BNB Chain | 56 | bscscan.com | binance dataseed, publicnode |
| Polygon | 137 | polygonscan.com | polygon-rpc, publicnode |
| Arbitrum | 42161 | arbiscan.io | arb1.arbitrum.io, publicnode |
| Sepolia | 11155111 | sepolia.etherscan.io | publicnode, drpc |

---

## 5. Hai mô hình ví

Toàn bộ tầng Tài sản / Gửi / Lịch sử / Swap được viết trên **wagmi hooks** và
**không biết** người dùng đang dùng loại ví nào. Điều đó có được nhờ ví in-app
được đóng gói thành một wagmi connector đúng chuẩn.

### 5.1 Ví ngoài (external)
MetaMask, WalletConnect, Coinbase Wallet, injected — do RainbowKit cung cấp.
`src/lib/wagmi.ts` gộp danh sách connector của RainbowKit với connector tự viết,
bật `ssr: true`, và cảnh báo ra console nếu thiếu
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.

### 5.2 Ví in-app (tự lưu khóa trong trình duyệt)

Chuỗi bốn file trong `src/lib/wallet/in-app/`:

| File | Trách nhiệm |
|---|---|
| `keystore.ts` | BIP-39 mnemonic ↔ vault mã hóa |
| `storage.ts` | Đọc/ghi vault vào IndexedDB |
| `signer.ts` | Bọc viem `LocalAccount` thành `WalletAccount` |
| `connector.ts` | Bọc `WalletAccount` thành EIP-1193 provider + wagmi connector |

**Mã hóa** (`keystore.ts`):
- `generateMnemonic(english)` → 12 từ
- Mật khẩu → khóa AES qua **PBKDF2-SHA256, 310 000 vòng**
- Mã hóa **AES-GCM-256**, salt 16 byte + IV 12 byte sinh ngẫu nhiên
- Vault lưu ở IndexedDB: db `web3-wallet`, store `vault`, key `default`
- Mnemonic chỉ được giải mã tạm trong RAM khi cần ký; khóa ví (`lock`) là xóa
  mật khẩu phiên khỏi bộ nhớ

**Connector** (`connector.ts`) tự xử lý các method EIP-1193 cần khóa —
`eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain`,
`personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction` — và **proxy mọi
method còn lại** sang một viem public client. Đó là lý do `useBalance`,
`useReadContracts`, `useWriteContract` chạy y hệt với cả hai loại ví.

`InAppWalletContext.tsx` giữ state `{hasVault, address, isUnlocked, vault,
sessionPassword, loading}` và các action `create / importFromMnemonic / unlock /
lock / remove`. Hai chi tiết đáng lưu ý:
- `disconnectIfInApp()` chỉ ngắt kết nối khi connector hiện tại **là** ví in-app —
  nếu không sẽ vô tình ngắt MetaMask của người dùng.
- Trước `connectAsync` luôn disconnect trước, tránh `ConnectorAlreadyConnectedError`.

UI cảnh báo thẳng: *"Ví web tự lưu key có rủi ro bảo mật cao hơn ví extension.
Chỉ dùng cho số tiền nhỏ hoặc để test."* Luồng tạo ví bắt buộc tick xác nhận đã
sao lưu 12 từ mới cho bấm "Hoàn tất"; xóa ví cần xác nhận hai bước.

---

## 6. Tầng Swap / DEX

### 6.1 Một shape, hai nguồn quote

`src/features/swap/types.ts` định nghĩa hợp đồng chung:

```ts
interface SwapQuote {
  tool: string;                 // "LI.FI · uniswap" | "Uniswap V3"
  toAmount, toAmountMin: bigint;
  approvalAddress: Address;
  fromAmountUsd, toAmountUsd, gasUsd: number | null;
  priceImpactPct, lpFeePct, midRate: number | null;
  route: RoutePlan;             // hops + candidatesEvaluated + source
  plan: SwapPlan | null;        // deadline + calls[] + supportsSelfPermit
  txRequest: { to, data, value, gasLimit };
}
```

`useSwapQuote` chọn nguồn theo chain nên UI **không phân nhánh**:

| Chain | Nguồn | Đặc điểm |
|---|---|---|
| 1 / 56 / 137 / 42161 | **LI.FI aggregator** (`li.quest/v1/quote`, không cần key) | có USD + gas, nhưng `priceImpactPct: null` và `plan: null` |
| 11155111 (Sepolia) | **Routing engine tự viết** | có price impact thật, hỗ trợ `selfPermit` |

Vì sao LI.FI trả `null` ở hai field đó: aggregator không cung cấp mid price nên
không thể tính price impact trung thực, và calldata của nó là hộp đen nên không
chèn thêm `selfPermit` vào được. Trả `null` thay vì số bịa là quyết định có ý thức.

Quote `staleTime` 15s + `refetchInterval` 20s — blockchain luôn đổi, quote cũ dễ
trượt lúc execute. `slippageBps` nằm trong `queryKey` vì nó được áp ngay vào
`amountOutMin` trong calldata.

### 6.2 Routing engine Uniswap V3 (`routing/`)

Bốn bước, tổng cộng **3 vòng RPC**:

**1. Sinh ứng viên** (`path.ts`)
- 1 hop × 4 fee tier `[100, 500, 3000, 10000]`
- 2 hop qua connector `[WETH, USDC]` × mọi tổ hợp fee
- ≈ **36 route ứng viên** cho một cặp token
- `encodePath` đóng gói theo chuẩn V3: `token | fee(3 byte) | token | …`
- `cumulativeLpFeePct = 1 − Π(1 − fᵢ)` — phí nhiều chặng nhân dồn, không cộng

**2. Báo giá hàng loạt** (`quoter.ts` + `multicall3.ts`)
- Gọi `quoteExactInput` cho **toàn bộ** ứng viên trong **một** request qua
  Multicall3 `aggregate3` (`0xcA11bde05977b3631167028862bE2a173976CA11`),
  `allowFailure: true`, chunk 40 call/lần
- Route không có pool sẽ fail lẻ mà không kéo cả batch chết

**3. Chấm điểm best-execution**

Không chọn route có `amountOut` cao nhất, mà chọn route có **output ròng** cao nhất:

```
net = amountOut − (gasEstimate + 46_000) × gasPrice quy đổi sang tokenOut
```

`46_000` là overhead của router. Đây là điểm khiến engine hành xử như một
aggregator thật: route 2 chặng chỉ thắng khi phần output tăng thêm **bù được**
phần gas tăng thêm.

**4. Price impact thật** (`pools.ts`)
- Địa chỉ pool tính **offline bằng CREATE2** (factory
  `0x0227628f3F023bb0B980b67D528571c95c6DaC1c`, init code hash `0xe34f199b…8b54`)
  → không cần gọi `getPool`
- Đọc `slot0` của **5 route tốt nhất** thôi, lấy `sqrtPriceX96` → mid price
  (toán Q192 có hiệu chỉnh decimals)
- `impact = (1 − exec/mid) − lpFee`, floor ở 0 — trừ phí LP để impact phản ánh
  **độ trượt giá do thanh khoản**, không lẫn phí

`RouteView.tsx` vẽ lại đường đi: chuỗi token `USDC → WETH → UNI`, fee tier từng
hop, và số route đã chấm điểm.

### 6.3 Dựng calldata

Đích là `SwapRouter02` (Sepolia `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`):

```
multicall(deadline, [
  selfPermit(...)        ← chỉ khi đã ký permit
  exactInput(...)
  unwrapWETH9(...)       ← chỉ khi bán ra native
])
```

- `deadline` = 20 phút
- Bán ra native: `recipient` của `exactInput` là `ADDRESS_THIS`
  (`0x…0002`), rồi `unwrapWETH9` trả ETH về ví
- `gasLimit = (quoter estimate + 80_000) × 1.3`

### 6.4 Preflight simulation (`simulate.ts`)

Trước khi cho ký, app `eth_call` **chính calldata sắp gửi** kèm `stateOverride`.

Vấn đề: người dùng thường **chưa approve**, nên mô phỏng thô sẽ luôn revert vì
allowance — không nói lên điều gì. Cách giải: override slot allowance thành
`2^128 − 1` để mô phỏng "thế giới sau khi approve".

Nhưng slot allowance của mỗi token nằm ở đâu thì không có chuẩn. Kỹ thuật dùng ở
đây: **dò slot trong đúng một request**.
- Ghi giá trị mốc `i + 1` vào 32 slot ứng viên (16 slot × 2 thứ tự key
  `keccak(owner, keccak(spender, slot))` và ngược lại)
- Gọi `allowance()` đọc lại, giá trị trả về chính là chỉ số slot đúng
- Cache theo `chainId + token` (`slotCache`) nên chỉ dò một lần

Kết quả phân biệt rõ hai loại thất bại:
- Contract **revert** → có lý do thật → **chặn ký**, hiện lý do đã dịch
- Hạ tầng lỗi (RPC timeout, không dò được slot) → trạng thái `unknown` → **vẫn
  cho ký**, chỉ ghi chú

`extractRevertReason` đi lên tối đa 8 tầng `cause` để lôi được reason string thật
ra khỏi lớp lớp wrapper error của viem.

> Slot đã xác minh trên Sepolia USDC: `balanceOf = 9`, `allowance = 10`.

### 6.5 ERC-2612 permit — approve + swap trong MỘT giao dịch (`permit.ts`)

Thay vì 2 giao dịch (approve rồi swap), ký một permit off-chain rồi nhét
`selfPermit` vào cùng `multicall`. Gas đo thực tế:

| Cách | Gas |
|---|---|
| permit + swap (1 tx) | **219 537** |
| chỉ swap (đã approve sẵn) | 159 001 |

Ba cái bẫy đã gặp và cách xử lý, ghi ngay trong header file:

1. **Domain EIP-712 không suy ra được từ ABI.** USDC dùng
   `{name: "USDC", version: "2"}`, UNI dùng `{name: "Uniswap"}` **không có
   version**. Sai domain → chữ ký vô hiệu → tx revert **sau khi** người dùng đã ký.
   → `probePermitDomain` sinh một private key dùng một lần, ký thử
   `nonce: 0, value: 1`, rồi `eth_call` vào `token.permit` để xem domain nào được
   chấp nhận. Thứ tự thử: `version` đọc on-chain → không version → `"1"` → `"2"`.

2. **Proxy che selector.** Không thể kết luận "có permit" chỉ vì contract có hàm đó.

3. **Ví có bytecode thì permit bất khả thi.** `permit` dựa trên `ecrecover`, nên
   smart account / EIP-7702 luôn fail. `isPlainEoa` kiểm `eth_getCode` trước, và
   khi không thỏa thì **im lặng rơi về approve** — không báo lỗi cho người dùng.

`usePermit.ts` tách logic này khỏi render, và **đọc lại nonce ngay trước khi ký**
(không dùng cache): nếu người dùng vừa permit ở tab khác thì nonce cũ làm chữ ký
vô hiệu. TTL chữ ký 30 phút.

### 6.6 Máy trạng thái của `Swap.tsx`

```
idle → quoting → quote_ready → (needs_approval → approving | permit)
     → signing → pending → success / failed
```

Các chi tiết đáng chú ý:
- Debounce 450ms trên ô số tiền trước khi gọi quote
- `allowanceSufficient` **khác** `!needsApproval` — simulation cần biết có phải
  override slot hay không
- `permitStale`: đổi token / số tiền / deadline là hủy chữ ký cũ ngay
- `txQuote = withSelfPermit(q, signedPermit)` khi đã có chữ ký
- `simulationBlocks = sim?.status === "revert"` là điều kiện chặn nút ký
- Slippage: preset `[10, 50, 100]` bps + nhập tay 1–5000 bps, **cảnh báo MEV /
  sandwich khi ≥ 300 bps**
- `approve` luôn cấp **đúng số lượng cần**, không bao giờ vô hạn

`errors.ts` dịch lỗi on-chain sang tiếng Việt có nghĩa: user rejected, thiếu số
dư, không có thanh khoản, `Too little received` (trượt giá), hết deadline, `STF`
(thiếu allowance), `EIP2612 invalid signature`, `SPL`, out of gas, `AS1` (pool
chưa khởi tạo).

---

## 7. Transaction Center (`features/tx/`)

Một store duy nhất ở tầng provider, gộp 4 việc từng nằm rải rác: hàng đợi giao
dịch, khôi phục tx pending sau reload, thông báo, và invalidate cache đúng chỗ.

**Khóa bản ghi là `id = ${chainId}:${hash.toLowerCase()}`, không phải hash** — vì
người dùng có thể speed-up hoặc cancel trong ví và **hash sẽ đổi**. viem
`waitForTransactionReceipt` với callback `onReplaced` bắt được điều đó và cập nhật
đúng bản ghi cũ, hiển thị hậu tố "(đã tăng gas)" / "(đã huỷ trong ví)" /
"(đã bị thay thế)".

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `PENDING_TTL_MS` | 30 phút | tx pending quá lâu → `dropped` |
| `NOTICE_TTL_MS` | 6 giây | toast tự tắt |
| `SWEEP_INTERVAL_MS` | 20 giây | hồi sinh watcher đã chết |
| `MAX_RECORDS` | 50 | giới hạn localStorage `tx-center:v1` |

Trạng thái: `pending | success | reverted | dropped`.
Loại: `swap | approve | revoke | send`.

Khi một tx vào block, TxCenter invalidate đúng các prefix query liên quan
(`REFETCH_KEYS`): `balance`, `readContract`, `readContracts`, `history`,
`allowances`, `permit-capability`, `swap-quote`. Nhờ vậy số dư và bảng allowance
tự cập nhật mà không cần người dùng bấm làm mới.

Hai mặt hiển thị (`TxViews.tsx`): `TxNotices` (toast xếp chồng góc dưới phải) và
`TxQueue` (danh sách tx của ví hiện tại trên chain hiện tại, sống sót qua reload).
Cả hai đặt **ngoài** tab vì tx vẫn chạy khi người dùng đã đổi tab — đó chính là lý
do TxCenter tồn tại.

`Send.tsx` và `AllowanceManager.tsx` đọc trạng thái tx từ TxCenter thay vì tự
gọi `useWaitForTransactionReceipt`.

---

## 8. Quản lý quyền chi tiêu (`features/allowance/`)

Bài toán: `allowance` trong ERC-20 là một `mapping` — **không thể liệt kê**. Giải
pháp là hợp nhất hai nguồn ứng viên rồi đọc giá trị thật:

**Nguồn 1 — quét log Approval** (`discover.ts`)
- Etherscan V2 `module=logs`, topic
  `0x8c5be1e5…b925`
- Chỉ hỗ trợ chain **1 / 137 / 42161 / 11155111**. BSC trả
  *"Free API access is not supported for this chain"* → UI nói rõ giới hạn này
- `PAGE_SIZE = 1000`, `MAX_PAGES = 3`; vượt quá → trạng thái `truncated` và cảnh
  báo "chỉ quét được phần gần nhất"
- Lọc bỏ `Approval` của ERC-721 bằng `topics.length !== 3`

**Nguồn 2 — dò trực tiếp bảng spender đã biết** (`spenders.ts`)
`KNOWN_SPENDERS` gồm Uniswap SwapRouter02 (mainnet + Sepolia), Uniswap V2 Router,
Permit2, LI.FI Diamond, 1inch V6, 0x Exchange Proxy, SushiSwap, QuickSwap,
PancakeSwap. Nhãn hiển thị lấy từ `ContractName` đã verify trên Etherscan.

Sau đó đọc giá trị thật qua multicall, **giữ lại những dòng `> 0`**, và sắp xếp
theo rủi ro: spender không nhận diện được lên đầu, rồi tới quyền không giới hạn
(`≥ 2^255`).

Thu hồi = `approve(spender, 0)` — ERC-20 không có hàm `revoke` riêng. Tx này đi
qua TxCenter với `kind: "revoke"` nên khi vào block, prefix `allowances` được
invalidate và dòng đó tự biến mất.

---

## 9. Các tab dữ liệu khác

| Tab | Hook | Nguồn | Ghi chú |
|---|---|---|---|
| Tài sản | `useBalances` | RPC | native qua `useBalance`, ERC-20 batch qua `useReadContracts` |
| | `usePrices` | CoinGecko `simple/price` | cache 60s, có `usd_24h_change` |
| | `useTokenList` | `defaultTokens` + localStorage | key `custom-tokens:{chainId}` |
| Lịch sử | `useHistory` | Etherscan V2 `txlist` / `tokentx` | chain 1/56/137/42161/11155111, 2 chế độ Coin / ERC-20 |
| NFT | `useNfts` | Alchemy NFT v3 | chain 1/137/42161/11155111 (BSC không có) |
| Gửi | `useGasEstimate` | RPC | EIP-1559, đệm gasLimit +15% |
| | `useEnsResolve` | RPC mainnet | ENS registry **luôn** query mainnet bất kể chain đang chọn |
| Nhận | — | — | QR code sinh client-side (`qrcode`) |

`Send.tsx` là luồng 3 bước `form → confirm → result`, có phân giải ENS và bảng
chi tiết gas (gas limit, max fee dạng gwei, tổng phí quy đổi native + USD).

Token mặc định trên Sepolia là bộ **đã xác minh có thanh khoản**:
WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`,
USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`,
UNI `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984`.

---

## 10. UI / UX

- **Chuỗi provider** (`providers.tsx`) — thứ tự có ý nghĩa:
  `WagmiProvider → QueryClientProvider → RainbowKitProvider → InAppWalletProvider
  → TxCenterProvider → children`. TxCenter phải nằm **ngoài** tab (để tx sống qua
  đổi tab) và **trong** Wagmi + Query (để invalidate được).
- **Tubelight tabs**: tab active có vệt neon hồng phía trên + 2 lớp glow, chạy
  mượt giữa các tab bằng `layoutId` của framer-motion. Desktop ở giữa header;
  mobile là pill nổi ở đáy, cho cuộn ngang vì 8 tab không vừa màn hình hẹp.
- **Command palette ⌘K** (`Ctrl+K` hoặc `/`): fuzzy filter, ↑/↓ + Enter, Esc.
  Ba nhóm hành động: Điều hướng (8 tab), Mạng lưới (5 chain), Thao tác (copy địa
  chỉ / kết nối / ngắt kết nối). Phím `/` **không** mở palette khi con trỏ đang ở
  trong `input`, `textarea` hay vùng `contentEditable`.
- **Nền động**: `AuroraBackground` (landing), `BoxesBackground` (grid tương tác
  đổi màu khi hover), `webgl/Background` (three.js).
- **Micro-interaction**: `HoverButton` (magnetic + shimmer), `CountUp` cho tổng
  tài sản, `Reveal` cho danh sách, `Checkmark` khi thành công, `Skeleton` shimmer
  ở mọi trạng thái loading.
- **Accessibility**: `focus-visible:ring` trên mọi phần tử tương tác,
  `role="dialog"` / `role="alert"` / `role="status"`, `aria-label` tiếng Việt,
  `aria-hidden` cho phần trang trí.

---

## 11. Xử lý lỗi ba tầng

| Tầng | File | Bắt được gì |
|---|---|---|
| Widget | `WidgetErrorBoundary.tsx` | Lỗi **render** của một tab, bọc riêng từng tab |
| Route | `app/error.tsx` | Lỗi render trong route `/app`, có `reset()` + đường về trang chủ |
| Global | `app/global-error.tsx` | Lỗi trong `layout.tsx` — nơi `error.tsx` không tới được |

Vì sao cần tầng widget: `error.tsx` của Next thay thế **toàn bộ** nội dung route.
Một lỗi trong gallery NFT (Alchemy đổi shape response) sẽ xóa luôn danh sách tài
sản và tab swap — dữ liệu chẳng liên quan gì tới nhau. Bọc riêng thì phần chết chỉ
là một ô, kèm nhãn nói rõ nguồn dữ liệu nào lỗi (`SOURCE_LABEL` trong
`app/app/page.tsx`) và nút "Thử lại".

`key={tab}` trên boundary là chủ ý: đổi tab thì boundary được tạo mới nên lỗi cũ
được xóa — nếu không, một tab đã lỗi sẽ hiện lỗi vĩnh viễn.

Trong `error.tsx`, đường về trang chủ dùng `<a>` **chứ không** `<Link>`:
`<Link>` điều hướng client-side và giữ nguyên state cũ (wagmi store, QueryClient
có thể đã hỏng) — đúng thứ vừa gây lỗi. `<a>` nạp lại cả document nên mọi state
được dựng từ đầu.

Lưu ý phạm vi: error boundary **không** bắt lỗi mạng của React Query — query trả
lỗi về dưới dạng state `isError` và mỗi widget tự xử lý (Alert + nút thử lại).

---

## 12. Bảo mật

**Header** (`next.config.mjs`)
- `Content-Security-Policy` với `connect-src` allowlist (alchemy, publicnode,
  drpc, 1rpc, binance, polygon-rpc, arbitrum, coingecko, etherscan, li.quest,
  walletconnect, reown)
- `script-src 'self' 'unsafe-inline'` — `'unsafe-eval'` **chỉ có trong
  development**, không lên production
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` (chống clickjacking ví)
- `object-src 'none'`, `base-uri 'self'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`

**Khóa riêng**
- Ví ngoài: khóa không bao giờ đi vào app
- Ví in-app: PBKDF2 310k vòng → AES-GCM-256, chỉ giải mã tạm trong RAM

**Quyền chi tiêu**
- `approve` luôn cấp đúng số lượng cần cho lệnh swap, **không bao giờ vô hạn**
- Tab Quyền cảnh báo rõ quyền vô hạn và spender không nhận diện được

**Giao dịch**
- Preflight simulation chặn ký khi lệnh chắc chắn revert
- Cảnh báo MEV/sandwich khi slippage ≥ 300 bps
- Deadline 20 phút trên mọi lệnh swap

**Biến môi trường** — cả 3 key đều là `NEXT_PUBLIC_*` (public theo thiết kế, chỉ
là rate-limit key của dịch vụ đọc dữ liệu), khai báo trong `.env.example`:

| Biến | Dùng cho | Thiếu thì sao |
|---|---|---|
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | RPC ưu tiên + NFT API | RPC rơi về public, tab NFT báo cần key |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect | cảnh báo console, các connector khác vẫn chạy |
| `NEXT_PUBLIC_ETHERSCAN_API_KEY` | Lịch sử + quét log Approval | tab Quyền chỉ dò được DEX phổ biến |

`.env.local` chứa key thật và đã nằm trong `.gitignore`.

---

## 13. Kiểm thử

### Unit test — Vitest, environment `node`

Cố ý **không dùng jsdom**: chỉ test logic thuần, nơi bug thật sự đắt. 9 file,
~119 case:

| File | Nội dung |
|---|---|
| `routing/path.test.ts` | encode path V3, sinh ứng viên, phí LP nhân dồn |
| `routing/pools.test.ts` | CREATE2 pool address, toán `sqrtPriceX96` → mid price |
| `swap/uniswapSepolia.test.ts` | dựng calldata, `withSelfPermit` |
| `swap/permit.test.ts` | tách chữ ký (chuẩn hóa `v < 27`), typed data |
| `swap/errors.test.ts` | ánh xạ lỗi revert/RPC/ví sang tiếng Việt |
| `tx/storage.test.ts` | persist / TTL / giới hạn 50 bản ghi |
| `allowance/discover.test.ts` | parse log Approval, lọc ERC-721, phân trang |
| `allowance/spenders.test.ts` | tra bảng spender |
| `lib/format.test.ts` | format số dư / USD / gwei, ngưỡng "< 0.000001" |

### E2E — Playwright trên **bản build production**

Không dùng `next dev`: dev server bật Strict Mode double-render, có HMR overlay,
và **không áp CSP** giống production. Một smoke test qua được dev nhưng chết ở
production là loại lỗi tệ nhất.

`e2e/fixtures/rpc-mock.ts` chặn **toàn bộ** tầng mạng bằng `page.route` và tự trả
lời JSON-RPC (kể cả bung `multicall3.aggregate3` thành từng sub-call, và suy chainId
từ host RPC vì app mở transport cho cả 5 chain cùng lúc). Test vì thế hermetic —
chạy offline, cùng input luôn cho cùng output, không bị rate-limit.

Giới hạn có ý thức của mock: **không** mô phỏng pool/quoter, mọi `eth_call` lạ trả
revert. Nên các luồng phụ thuộc quote (route preview, simulation) không kiểm ở
đây — chúng đã có unit test trên logic thuần.

Ba spec:
- `navigation.spec.ts` — landing render, CTA sang `/app`, app dựng được khi chưa
  kết nối, đổi tab, network selector đổi sang Sepolia. Bài rẻ nhất nhưng giá trị
  cao nhất: chết ngay khi chuỗi provider sai thứ tự, khi thiếu `"use client"`,
  hoặc khi CSP mới chặn chính bundle của app.
- `command-palette.spec.ts` — mở bằng `Ctrl+K` và `/`, không mở khi đang gõ trong
  input, fuzzy filter, ↑/↓ + Enter.
- `in-app-wallet.spec.ts` — **bài quan trọng nhất**: tạo ví → 12 từ → tick sao lưu
  → connector wagmi tự kết nối → tab Tài sản đọc được số dư qua chính connector
  đó. Nó là bài duy nhất chứng minh mắt xích kiến trúc chính hoạt động, vì chỗ
  Web Crypto + IndexedDB + wagmi store gặp nhau chỉ tồn tại trong trình duyệt
  thật. Kèm: sai mật khẩu (AES-GCM auth tag không khớp), sống sót qua reload,
  xóa ví hai bước.

### CI — GitHub Actions (`.github/workflows/ci.yml`)

Hai job, **không cần secret nào**:

- **`check`** (~1–2 phút): `lint → typecheck → test → build`, mỗi bước có
  `if: always()` để một bước đỏ vẫn chạy tiếp — developer thấy **tất cả** lỗi
  trong một lần chạy thay vì sửa từng cái rồi push lại.
- **`e2e`**: cài Chromium (chỉ Chromium — thêm Firefox/WebKit tốn ~300MB không
  dùng tới), chạy Playwright; report chỉ upload `if: failure()`.

Tách hai job vì `check` phải trả lời ngay, còn `e2e` phải build Next rồi mở
browser nên chậm hơn nhiều. `concurrency` + `cancel-in-progress` hủy lần chạy cũ
khi push liên tiếp. `npm ci` (không phải `npm install`) để CI không bao giờ
đỏ/xanh vì một minor version mới vừa được publish.

---

## 14. Cài đặt & chạy

```bash
npm ci                    # cài đúng cây phụ thuộc trong package-lock.json
cp .env.example .env.local  # rồi điền key (tùy chọn — app chạy được khi để trống)
npm run dev               # http://localhost:3000
```

| Script | Việc |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | build production |
| `npm run start` | chạy bản build |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |
| `npm run test:watch` | Vitest watch mode |
| `npx playwright test` | E2E (tự build + start server) |

**Trải nghiệm đầy đủ tính năng DEX**: chuyển sang **Sepolia**, xin ETH testnet từ
faucet, rồi swap giữa ETH / WETH / USDC / UNI. Chỉ trên Sepolia mới thấy route
preview có fee tier, price impact thật, preflight simulation, và permit gộp
approve + swap vào một giao dịch.

Cấu hình khác: `tsconfig.json` bật `strict`, alias `@/*` → `./src/*`;
`tailwind.config.ts` khai báo palette và 2 font family;
`next.config.mjs` có `outputFileTracingRoot` và loại `pino-pretty` / `lokijs` /
`encoding` / `@react-native-async-storage/async-storage` khỏi bundle (phụ thuộc
Node-only mà WalletConnect kéo theo).

---

## 15. Tóm lại — điều gì làm dự án này khác một "ví demo"

1. **Routing engine Uniswap V3 viết từ đầu**: 36 route ứng viên, batch qua
   Multicall3, chấm điểm theo **output ròng sau gas** chứ không phải output thô.
2. **Price impact thật** đọc từ `sqrtPriceX96` của pool, đã trừ phí LP — không
   phải số ước lượng.
3. **Preflight simulation với `stateOverride`**, kèm kỹ thuật **dò slot allowance
   trong một request** để mô phỏng được cả khi chưa approve.
4. **ERC-2612 `selfPermit`**: approve + swap trong một giao dịch, với domain EIP-712
   được **dò bằng chữ ký thử** vì không thể suy ra từ ABI, và tự rơi về approve khi
   ví có bytecode.
5. **Ví in-app là wagmi connector đúng chuẩn**, nên toàn bộ tầng nghiệp vụ
   connector-agnostic — có e2e chứng minh.
6. **Transaction Center** khóa bản ghi bằng `chainId:hash` bất biến, xử lý được
   speed-up/cancel, sống sót qua reload, và invalidate cache có chọn lọc.
7. **Xử lý lỗi có kiến trúc**: 3 tầng boundary, phân biệt "contract revert" với
   "hạ tầng lỗi", và toàn bộ lỗi on-chain được dịch sang tiếng Việt có nghĩa.
8. **CI thật**: 4 cửa kiểm tra + e2e trên bản build production với network mock,
   chạy được trên fork PR vì không cần secret.






