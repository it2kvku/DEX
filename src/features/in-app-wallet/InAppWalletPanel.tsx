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

  // Đã mở khóa: hiện thông tin + khóa/xóa.
  if (wallet.isUnlocked && wallet.address) {
    return (
      <Card className="space-y-3">
        <Alert variant="success">Ví in-app đã mở khóa</Alert>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Địa chỉ</span>
          <span className="font-mono">{shortenAddress(wallet.address)}</span>
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
  if (mode === "menu") {
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

  if (mode === "create") return <CreateForm onDone={() => setMode("menu")} />;
  if (mode === "import") return <ImportForm onDone={() => setMode("menu")} />;
  return null;
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
