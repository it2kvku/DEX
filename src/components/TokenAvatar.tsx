"use client";

/**
 * Avatar token dạng chữ cái với gradient màu ổn định theo symbol
 * (hash chuỗi -> cặp hue). Không cần tải logo ngoài.
 */
export function TokenAvatar({
  symbol,
  size = 38,
}: {
  symbol: string;
  size?: number;
}) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  const h1 = hash % 360;
  const h2 = (h1 + 60) % 360;

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-lg"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(135deg, hsl(${h1} 70% 52%), hsl(${h2} 75% 45%))`,
        boxShadow: `0 4px 14px hsl(${h1} 70% 50% / 0.35)`,
      }}
      aria-hidden
    >
      {symbol.slice(0, 3).toUpperCase()}
    </div>
  );
}
