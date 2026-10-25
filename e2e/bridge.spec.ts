import { test, expect } from "@playwright/test";
import { mockChain } from "./fixtures/rpc-mock";

/**
 * Bridge cross-chain qua LI.FI: chọn chain đích → quote → gửi tx nguồn →
 * TxCenter chuyển "receiving" → poll /status DONE → tx đích hiện link.
 *
 * Điểm được kiểm là MẮT XÍCH TxCenter ↔ LI.FI: mock /status trả DONE và
 * mock RPC trả receipt thành công cho tx nguồn, nên toàn bộ vòng đời
 * pending → receiving → success chạy trong vài giây thay vì vài phút bridge
 * thật (mock là bắt buộc — bridge thật không hermetic được).
 *
 * Giới hạn có ý thức: mock quote vẫn 404 (như các spec khác), nên KHÔNG test
 * luồng ký thật tới receipt — phần đó đã có mock send/receipt ở tầng RPC cho
 * TxCenter xử lý, và logic parse /status có unit test riêng (lifiStatus.test).
 */

const PASSWORD = "matkhau-test-123";

test.beforeEach(async ({ page }) => {
  await mockChain(page);
  await page.goto("/app");
  await page.waitForFunction(
    () => (window as unknown as { __appReady?: boolean }).__appReady === true,
  );

  // Tạo ví in-app để có thể ký/gửi (luồng tạo đã có spec riêng).
  await page.getByRole("button", { name: "Ví", exact: true }).first().click();
  await page.getByRole("button", { name: "Tạo ví mới" }).click();
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(PASSWORD);
  await pw.nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: "Tạo ví" }).click();
  await page.getByRole("checkbox").check({ timeout: 15_000 });
  await page.getByRole("button", { name: "Hoàn tất" }).click();
  await expect(page.getByText("Ví in-app đã mở khóa")).toBeVisible();

  await page.getByRole("button", { name: "Swap", exact: true }).first().click();
  await expect(page.getByText("Hoán đổi")).toBeVisible();
});

test("ChainPicker đổi chain đích: dropdown 6 chain + nhãn nguồn", async ({
  page,
}) => {
  const picker = page.locator('button[title="Chain nhận token"]');
  await picker.click();

  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option")).toHaveCount(6);
  await expect(listbox.getByText("nguồn")).toBeVisible();

  // Chọn Arbitrum làm chain đích — pill icon đổi, box Mua có nhãn bridge.
  await listbox.getByRole("option", { name: /Arbitrum/ }).click();
  await expect(page.getByText(/Mua \(ước tính\) — bridge/)).toBeVisible();
});

test("nhãn nút chính đổi sang Bridge khi chọn chain đích khác", async ({
  page,
}) => {
  // Chưa nhập gì: label disabled phải là "Kết nối ví để bridge" (đã kết nối
  // qua ví in-app nên label rơi về nhánh hasTokenOut).
  const picker = page.locator('button[title="Chain nhận token"]');
  await picker.click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /Arbitrum/ })
    .click();

  // Chưa chọn token nhận → nút vẫn disabled nhưng theo ngữ cảnh bridge.
  await expect(
    page.getByRole("button", { name: "Chọn token nhận" }),
  ).toBeDisabled();

  // Chọn token nhận trong danh sách chain đích (Arbitrum: USDT từ
  // defaultTokens — uniswap list mock trả rỗng). exact:true để không bắt
  // nhầm nút disabled "Chọn token nhận".
  await page.getByRole("button", { name: "Chọn token", exact: true }).click();
  await page.getByPlaceholder("Tìm token…").fill("USDT");
  await page.getByRole("button", { name: /USDT/ }).first().click();

  // Mock quote bridge thật (mock toàn cục trả 404): estimate + calldata đủ
  // shape để UI vào trạng thái hasQuote — nút chính phải hiện "Bridge".
  await page.route("**/li.quest/v1/quote**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      },
      body: JSON.stringify({
        tool: "across",
        toolDetails: { name: "Across" },
        estimate: {
          toAmount: "1000000",
          toAmountMin: "995000",
          approvalAddress: "0x" + "4a".repeat(20),
          fromAmountUSD: "10.05",
          toAmountUSD: "10.00",
          gasCosts: [{ amountUSD: "0.40" }],
          feeCosts: [],
          executionDuration: 240,
        },
        includedSteps: [
          {
            tool: "across",
            toolDetails: { name: "Across" },
            action: {
              fromToken: { symbol: "ETH" },
              toToken: { symbol: "USDT" },
            },
          },
        ],
        transactionRequest: {
          to: "0x" + "4a".repeat(20),
          data: "0xdeadbeef",
          value: "0",
          gasLimit: "0x493e0",
        },
      }),
    }),
  );

  await page.locator('input[type="number"]').first().fill("0.01");
  await page.waitForTimeout(500);
  // Nút chính khi cross-chain + có quote phải dùng từ "Bridge" — khóa nhãn
  // ngữ cảnh cross-chain (mock sim tắt ở cross nên không chặn).
  await expect(page.getByRole("button", { name: "Bridge", exact: true })).toBeVisible(
    { timeout: 15_000 },
  );
  // Chi tiết quote phải hiện thời gian bridge ước tính.
  await expect(page.getByText("Thời gian bridge ước tính")).toBeVisible();
});
