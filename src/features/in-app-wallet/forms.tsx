"use client";

import { useState } from "react";
import { useInAppWallet } from "./InAppWalletContext";
import { Alert, Button, Card, Input, Label, Spinner } from "@/components/ui";

const MIN_PASSWORD = 8;

/** Form tạo ví mới — sinh mnemonic, buộc người dùng sao lưu. */
export function CreateForm({ onDone }: { onDone: () => void }) {
  const wallet = useInAppWallet();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const canSubmit =
    password.length >= MIN_PASSWORD && password === confirm && !busy;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const m = await wallet.create(password);
      setMnemonic(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được ví.");
    } finally {
      setBusy(false);
    }
  };

  // Sau khi tạo: hiện mnemonic để sao lưu.
  if (mnemonic) {
    return (
      <Card className="space-y-4">
        <Alert variant="warning">
          Ghi lại 12 từ này theo đúng thứ tự và cất nơi an toàn. Đây là cách DUY
          NHẤT khôi phục ví. Không chia sẻ với bất kỳ ai.
        </Alert>
        <div className="grid grid-cols-3 gap-2">
          {mnemonic.split(" ").map((word, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            >
              <span className="mr-1 text-neutral-600">{i + 1}.</span>
              <span className="font-mono">{word}</span>
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={savedConfirmed}
            onChange={(e) => setSavedConfirmed(e.target.checked)}
          />
          Tôi đã sao lưu 12 từ này an toàn
        </label>
        <Button disabled={!savedConfirmed} onClick={onDone} className="w-full">
          Hoàn tất
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <h3 className="font-display font-semibold">Tạo ví mới</h3>
      <div>
        <Label>Mật khẩu (tối thiểu {MIN_PASSWORD} ký tự)</Label>
        <Input type="password" value={password} onChange={setPassword} />
      </div>
      <div>
        <Label>Nhập lại mật khẩu</Label>
        <Input
          type="password"
          value={confirm}
          onChange={setConfirm}
          error={!!confirm && confirm !== password}
        />
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onDone} className="flex-1">
          Hủy
        </Button>
        <Button disabled={!canSubmit} onClick={submit} className="flex-1">
          {busy ? <Spinner /> : "Tạo ví"}
        </Button>
      </div>
    </Card>
  );
}

/** Form import từ mnemonic có sẵn. */
export function ImportForm({ onDone }: { onDone: () => void }) {
  const wallet = useInAppWallet();
  const [mnemonic, setMnemonic] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;
  const mnemonicLikelyValid = wordCount === 12 || wordCount === 24;
  const canSubmit =
    mnemonicLikelyValid &&
    password.length >= MIN_PASSWORD &&
    password === confirm &&
    !busy;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await wallet.importFromMnemonic(mnemonic, password);
      onDone();
    } catch {
      setError("Seed phrase không hợp lệ. Kiểm tra lại các từ và thứ tự.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <h3 className="font-display font-semibold">Import ví</h3>
      <div>
        <Label>Seed phrase (12 hoặc 24 từ, cách nhau bằng dấu cách)</Label>
        <textarea
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-accent1/60"
          placeholder="word1 word2 word3 ..."
        />
        {mnemonic && !mnemonicLikelyValid && (
          <p className="mt-1 text-xs text-amber-400">
            Đang có {wordCount} từ. Seed phrase thường có 12 hoặc 24 từ.
          </p>
        )}
      </div>
      <div>
        <Label>Mật khẩu bảo vệ (tối thiểu {MIN_PASSWORD} ký tự)</Label>
        <Input type="password" value={password} onChange={setPassword} />
      </div>
      <div>
        <Label>Nhập lại mật khẩu</Label>
        <Input
          type="password"
          value={confirm}
          onChange={setConfirm}
          error={!!confirm && confirm !== password}
        />
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onDone} className="flex-1">
          Hủy
        </Button>
        <Button disabled={!canSubmit} onClick={submit} className="flex-1">
          {busy ? <Spinner /> : "Import"}
        </Button>
      </div>
    </Card>
  );
}

/** Form mở khóa ví đã lưu. */
export function UnlockForm() {
  const wallet = useInAppWallet();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setBusy(true);
    const ok = await wallet.unlock(password);
    if (!ok) setError("Sai mật khẩu.");
    setBusy(false);
  };

  return (
    <Card className="space-y-4">
      <h3 className="font-display font-semibold">Mở khóa ví in-app</h3>
      <div>
        <Label>Mật khẩu</Label>
        <Input
          type="password"
          value={password}
          onChange={setPassword}
          error={!!error}
        />
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <Button disabled={!password || busy} onClick={submit} className="w-full">
        {busy ? <Spinner /> : "Mở khóa"}
      </Button>
    </Card>
  );
}
