"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CryptoIcon } from "@/components/CryptoIcon";
import { formatBalance } from "@/lib/format";
import type { AssetRow } from "@/features/asset/useBalances";

/** Giá trị chọn: "native" hoặc địa chỉ token ERC-20. */
export type TokenChoice = "native" | `0x${string}`;

/**
 * Nút chọn token dạng pill (icon + symbol + mũi tên) mở dropdown
 * danh sách token của chain hiện tại kèm số dư.
 */
export function TokenSelect({
  value,
  onChange,
  rows,
  exclude,
  placeholder = "Chọn token",
}: {
  value: TokenChoice | null;
  onChange: (v: TokenChoice) => void;
  rows: AssetRow[];
  /** Token đang chọn ở phía bên kia — ẩn khỏi danh sách. */
  exclude?: TokenChoice | null;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const choiceOf = (r: AssetRow): TokenChoice =>
    r.kind === "native" ? "native" : (r.address as `0x${string}`);

  const selected = rows.find((r) => choiceOf(r) === value);
  const options = rows.filter((r) => choiceOf(r) !== exclude);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 ${
          selected
            ? "border border-white/10 bg-white/[0.06] text-white hover:bg-white/10"
            : "bg-accent1 text-white shadow-glow-sm hover:brightness-110"
        }`}
      >
        {selected ? (
          <>
            <CryptoIcon symbol={selected.symbol} size={20} />
            {selected.symbol}
          </>
        ) : (
          placeholder
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="glass absolute right-0 z-50 mt-2 max-h-64 w-60 overflow-y-auto rounded-2xl py-1.5 shadow-2xl">
          {options.length === 0 ? (
            <p className="px-3.5 py-4 text-center text-xs text-neutral-500">
              Không còn token nào khác.
            </p>
          ) : (
            options.map((r) => {
              const choice = choiceOf(r);
              const active = choice === value;
              return (
                <button
                  key={`${r.kind}-${r.address ?? "native"}`}
                  onClick={() => {
                    onChange(choice);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-neutral-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <CryptoIcon symbol={r.symbol} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.symbol}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {r.name}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-neutral-400">
                    {formatBalance(r.balance, r.decimals, 4)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
