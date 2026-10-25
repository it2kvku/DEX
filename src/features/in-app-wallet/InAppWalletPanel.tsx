"use client";

import { useState } from "react";
import { useInAppWallet } from "./InAppWalletContext";
import { CreateForm, ImportForm, UnlockForm } from "./forms";
import { shortenAddress } from "@/lib/format";
import { Alert, Button, Card, Spinner } from "@/components/ui";

type Mode = "menu" | "create" | "import" | "unlock" | "backup";

export function InAppWalletPanel() {
  const wallet = useInAppWallet();
  const [mode, setMode] = useState<Mode>("menu");

  if (wallet.loading) {
    return (
      <Card className="flex items-center gap-2 text-sm text-neutral-400">
        <Spinner /> Đang tải ví...
      </Card>
    );
  }

  // Luồng tạo/import đang mở: render form TRƯỚC, bất kể isUnlocked.
  // Lý do phải đứng trước nhánh "đã mở khóa": persist() bật isUnlocked ngay
  // khi tạo xong vault (kể cả khi người dùng chưa sao lưu mnemonic). Nếu nhánh
  // đó chạy trước, CreateForm bị unmount theo state của panel và toàn bộ màn
  // hình sao lưu 12 từ biến mất cùng state cục bộ — người dùng không bao giờ
  // thấy mnemonic. Giữ form mounted tới khi bấm "Hoàn tất"/"Hủy" thì onDone()
  // đưa mode về "menu" và panel mới chuyển sang card đã mở khóa.
  if (mode === "create") return <CreateForm onDone={() => setMode("menu")} />;
  if (mode === "import") return <ImportForm onDone={() => setMode("menu")} />;

  // Đã mở khóa: thông tin + danh sách tài khoản + khóa/xóa.
  if (wallet.isUnlocked && wallet.address) {
    return (
      <Card className="space-y-3">
        <Alert variant="success">Ví in-app đã mở khóa</Alert>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Địa chỉ</span>
          <span className="font-mono">{shortenAddress(wallet.address)}</span>
        </div>

        {/* Danh sách tài khoản HD — chuyển bằng disconnect+connect lại connector. */}
        <div className="space-y-1.5">
          <span className="text-xs text-neutral-500">Tài khoản</span>
          {wallet.accounts.map((a) => {
            const active = a.index === wallet.activeIndex;
            return (
              <button
                key={a.index}
                onClick={() => wallet.switchAccount(a.index)}
                disabled={active}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 ${
                  active
                    ? "border-accent1/40 bg-accent1/10 text-white"
                    : "border-white/[0.06] bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]"
                }`}
              >
                <span>
                  Tài khoản {a.index + 1}
                  {a.label ? ` · ${a.label}` : ""}
                </span>
                <span className="font-mono text-xs text-neutral-400">
                  {shortenAddress(a.address)}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => void wallet.addAccount()}
            className="w-full rounded-xl border border-dashed border-white/[0.12] px-3 py-2 text-sm text-neutral-400 outline-none transition-colors hover:border-accent1/40 hover:text-accent1 focus-visible:ring-2 focus-visible:ring-white/20"
          >
            ＋ Thêm tài khoản
          </button>
        </div>

        {/* Tự khóa khi rảnh — mật khẩu phiên không nằm trong RAM mãi mãi. */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Tự khóa khi rảnh</span>
          <select
            value={wallet.autolockMinutes}
            onChange={(e) => wallet.setAutolockMinutes(Number(e.target.value))}
            aria-label="Thời gian tự khóa"
            className="rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent1/60"
          >
            <option value={5}>5 phút</option>
            <option value={10}>10 phút</option>
            <option value={30}>30 phút</option>
            <option value={0}>Không tự khóa</option>
          </select>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={wallet.lock} className="flex-1">
            Khóa ví
          </Button>
          <RemoveButton />
        </div>
      </Card>
    );
  }

  // Có vault nhưng đang khóa: yêu cầu mở khóa.
  if (wallet.hasVault && !wallet.isUnlocked) {
    return <UnlockForm />;
  }

  // Chưa có ví: menu tạo/import.
  return (
    <Card className="space-y-3">
      <p className="text-sm text-neutral-400">
        Ví in-app do trình duyệt quản lý (mã hóa bằng mật khẩu). Dùng khi bạn
        không có ví extension.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => setMode("create")} className="flex-1">
          Tạo ví mới
        </Button>
        <Button
          variant="secondary"
          onClick={() => setMode("import")}
          className="flex-1"
        >
          Import ví
        </Button>
      </div>
      <Alert variant="warning">
        Ví web tự lưu key có rủi ro bảo mật cao hơn ví extension. Chỉ dùng cho
        số tiền nhỏ hoặc để test.
      </Alert>
    </Card>
  );
}

function RemoveButton() {
  const wallet = useInAppWallet();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <Button variant="danger" onClick={() => setConfirm(true)} className="flex-1">
        Xóa ví
      </Button>
    );
  }
  return (
    <Button variant="danger" onClick={wallet.remove} className="flex-1">
      Chắc chắn xóa?
    </Button>
  );
}
