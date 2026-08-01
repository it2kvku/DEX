"use client";

import type { ReactNode } from "react";

/**
 * Card con nằm bên trong Main Card: bề mặt phẳng sáng nhẹ, viền siêu mỏng,
 * bo góc 16px (nhỏ hơn Main Card 24px). `highlight` thêm viền gradient.
 */
export function Card({
  children,
  className = "",
  highlight = false,
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.07] bg-white/[0.04] p-5 ${
        highlight ? "grad-ring" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Nút bấm với các biến thể; primary có gradient + glow. */
export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
  className?: string;
}) {
  const base =
    "group relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/20";
  const variants = {
    primary:
      "bg-accent1 text-white shadow-glow-sm hover:shadow-glow hover:brightness-110",
    secondary:
      "bg-white/[0.07] border border-white/10 text-neutral-200 hover:bg-white/[0.12] hover:border-white/20",
    danger: "bg-rose-500 text-white hover:brightness-110",
    ghost: "text-neutral-400 hover:text-white hover:bg-white/5",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {/* Shimmer sweep cho CTA chính */}
      {variant === "primary" && (
        <span
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100"
          style={{ animation: "hub-shimmer 1.1s ease infinite" }}
          aria-hidden
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
    </button>
  );
}

/** Ô nhập liệu. */
export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  error?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-2xl border bg-black/30 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-all duration-200 placeholder:text-neutral-600 focus:border-accent1/60 focus:shadow-glow-sm ${
        error ? "border-rose-500" : "border-white/10"
      } ${className}`}
    />
  );
}

/** Nhãn nhỏ. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-500">
      {children}
    </label>
  );
}

/** Thông báo trạng thái (info/success/error/warning). */
export function Alert({
  children,
  variant = "info",
}: {
  children: ReactNode;
  variant?: "info" | "success" | "error" | "warning";
}) {
  const styles = {
    info: "border-sky-500/25 bg-sky-500/10 text-sky-200",
    success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
    error: "border-rose-500/25 bg-rose-500/10 text-rose-200",
    warning: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  };
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-sm backdrop-blur ${styles[variant]}`}
      role="alert"
    >
      {children}
    </div>
  );
}

/** Spinner nhỏ. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-accent1 ${className}`}
      aria-label="Đang tải"
    />
  );
}

/** Skeleton loading với hiệu ứng shimmer. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Badge nhỏ. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "indigo";
}) {
  const tones = {
    neutral: "bg-white/8 text-neutral-300 border-white/10",
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    red: "bg-rose-500/15 text-rose-300 border-rose-500/25",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    indigo: "bg-accent1/15 text-accent1 border-accent1/25",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
