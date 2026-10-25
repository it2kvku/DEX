"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/geckoterminal";
import type { ChartPoint, ChartRange } from "@/lib/marketData";
import { formatTokenPrice, formatUsd } from "@/lib/format";
import { Alert, Skeleton, Spinner } from "@/components/ui";

const RANGES: ChartRange[] = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

const CHART_W = 800;
const CHART_H = 320;
const PAD = { top: 16, right: 56, bottom: 28, left: 8 };

interface PriceChartProps {
  points: ChartPoint[];
  loading: boolean;
  error: boolean;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  currentPrice: number | null;
  rangeChange: number | null;
  /**
   * Nến OHLC (GeckoTerminal, theo pool chính của token) — có và đủ dữ liệu
   * thì vẽ nến thay vì đường line. null/[] = fallback line DefiLlama.
   */
  candles?: Candle[] | null;
  candlesLoading?: boolean;
}

/** Biểu đồ giá kiểu Uniswap: line + gradient (mặc định) hoặc nến OHLC. */
export function PriceChart({
  points,
  loading,
  error,
  range,
  onRangeChange,
  currentPrice,
  rangeChange,
  candles,
  candlesLoading,
}: PriceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    point: ChartPoint;
  } | null>(null);
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);

  const candleMode = !!candles && candles.length > 1;

  const plot = useMemo(() => buildPlot(points), [points]);
  const cplot = useMemo(
    () => (candleMode ? buildCandlePlot(candles!) : null),
    [candleMode, candles],
  );

  const up = (rangeChange ?? 0) >= 0;
  const lineUp = up;
  const displayPrice = candleMode
    ? (hoverCandle?.close ?? currentPrice)
    : (hover?.point.price ?? currentPrice);
  const displayChange = candleMode
    ? hoverCandle
      ? ((hoverCandle.close - hoverCandle.open) / hoverCandle.open) * 100
      : rangeChange
    : hover
      ? ((hover.point.price - plot.open) / plot.open) * 100
      : rangeChange;

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX =
        ((e.clientX - rect.left) / rect.width) * CHART_W - PAD.left;
      const innerW = CHART_W - PAD.left - PAD.right;
      const frac = Math.max(0, Math.min(1, relX / innerW));

      if (candleMode && cplot) {
        const idx = Math.round(frac * (cplot.candles.length - 1));
        const c = cplot.candles[idx];
        if (!c) return;
        setHoverCandle(c.candle);
        setHover(null);
        return;
      }
      if (!plot.pathPoints.length) return;
      const idx = Math.round(frac * (plot.pathPoints.length - 1));
      const pt = plot.pathPoints[idx];
      if (!pt) return;
      setHover({ x: pt.x, y: pt.y, point: pt.source });
      setHoverCandle(null);
    },
    [candleMode, cplot, plot.pathPoints],
  );

  return (
    <div className="space-y-4">
      {/* Giá + biến động */}
      <div>
        <p className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {displayPrice != null && displayPrice > 0
            ? formatTokenPrice(displayPrice)
            : "—"}
        </p>
        {displayChange != null && Number.isFinite(displayChange) && (
          <p
            className={`mt-1 text-sm font-medium ${
              (displayChange ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {(displayChange ?? 0) >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(displayChange ?? 0).toFixed(2)}%
            <span className="ml-2 text-neutral-500">
              {candleMode && hoverCandle ? (
                <>
                  O {formatTokenPrice(hoverCandle.open)} · H{" "}
                  {formatTokenPrice(hoverCandle.high)} · L{" "}
                  {formatTokenPrice(hoverCandle.low)} ·{" "}
                  {new Date(hoverCandle.time).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "short",
                    ...(range === "1H" || range === "1D"
                      ? { hour: "2-digit", minute: "2-digit" }
                      : {}),
                  })}
                </>
              ) : hover ? (
                new Date(hover.point.time).toLocaleString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "short",
                })
              ) : (
                `trong ${rangeLabel(range)}`
              )}
            </span>
          </p>
        )}
      </div>

      {/* Chart area */}
      <div className="relative min-h-[280px] rounded-2xl border border-white/[0.06] bg-black/20">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner className="!h-6 !w-6" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Alert variant="error">
              Không tải được biểu đồ. Thử lại sau vài giây.
            </Alert>
          </div>
        )}
        {!loading && !error && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
            Không có dữ liệu giá cho khung thời gian này.
          </div>
        )}
        {!loading && !error && points.length > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="h-[280px] w-full touch-none"
            onMouseMove={onMove}
            onMouseLeave={() => {
              setHover(null);
              setHoverCandle(null);
            }}
            role="img"
            aria-label="Biểu đồ giá token"
          >
            <defs>
              <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={lineUp ? "#ff007a" : "#f43f5e"}
                  stopOpacity="0.35"
                />
                <stop
                  offset="100%"
                  stopColor={lineUp ? "#ff007a" : "#f43f5e"}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {/* Grid ngang — dùng scale của chế độ đang vẽ */}
            {(cplot ?? plot).yLabels.map((yl: { y: number; value: number }) => (
              <g key={yl.y}>
                <line
                  x1={PAD.left}
                  y1={yl.y}
                  x2={CHART_W - PAD.right}
                  y2={yl.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="2 6"
                />
                <text
                  x={CHART_W - PAD.right + 6}
                  y={yl.y + 4}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatUsd(yl.value)}
                </text>
              </g>
            ))}

            {cplot ? (
              /* ===== Nến OHLC ===== */
              cplot.candles.map((c) => (
                <g key={c.candle.time}>
                  <line
                    x1={c.x}
                    y1={c.yHigh}
                    x2={c.x}
                    y2={c.yLow}
                    stroke={c.up ? "#10b981" : "#f43f5e"}
                    strokeWidth="1"
                  />
                  <rect
                    x={c.x - Math.max(1.5, c.w / 2 - 0.5)}
                    y={Math.min(c.yOpen, c.yClose)}
                    width={Math.max(3, c.w - 1)}
                    height={Math.max(1, Math.abs(c.yClose - c.yOpen))}
                    fill={c.up ? "#10b981" : "#f43f5e"}
                    opacity="0.9"
                  />
                </g>
              ))
            ) : (
              <>
                {/* Vùng gradient dưới đường */}
                {plot.areaPath && (
                  <path d={plot.areaPath} fill="url(#chart-fill)" />
                )}
                {/* Đường giá */}
                {plot.linePath && (
                  <path
                    d={plot.linePath}
                    fill="none"
                    stroke={lineUp ? "#ff007a" : "#f43f5e"}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
              </>
            )}

            {/* Crosshair hover */}
            {hover && !cplot && (
              <>
                <line
                  x1={hover.x}
                  y1={PAD.top}
                  x2={hover.x}
                  y2={CHART_H - PAD.bottom}
                  stroke="rgba(255,255,255,0.15)"
                />
                <circle
                  cx={hover.x}
                  cy={hover.y}
                  r="5"
                  fill={lineUp ? "#ff007a" : "#f43f5e"}
                  stroke="#0d0e12"
                  strokeWidth="2"
                />
              </>
            )}

            {/* Nhãn trục X */}
            {(cplot ?? plot).xLabels.map(
              (xl: { x: number; label: string }) => (
                <text
                  key={xl.x}
                  x={xl.x}
                  y={CHART_H - 6}
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {xl.label}
                </text>
              ),
            )}
          </svg>
        )}
        {candlesLoading && !loading && points.length > 0 && (
          <div className="absolute right-3 top-3">
            <Spinner className="!h-4 !w-4" />
          </div>
        )}
      </div>

      {/* Khung thời gian */}
      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRangeChange(r)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              range === r
                ? "bg-white/10 text-white"
                : "text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-300"
            }`}
          >
            {r === "ALL" ? "Tất cả" : r}
          </button>
        ))}
        <span className="ml-auto hidden text-xs text-neutral-600 sm:inline">
          Nguồn: {cplot ? "GeckoTerminal (nến)" : "DefiLlama"}
        </span>
      </div>
    </div>
  );
}

function rangeLabel(range: ChartRange): string {
  const map: Record<ChartRange, string> = {
    "1H": "1 giờ",
    "1D": "24 giờ",
    "1W": "7 ngày",
    "1M": "30 ngày",
    "1Y": "1 năm",
    ALL: "toàn bộ",
  };
  return map[range];
}

interface PlotPoint {
  x: number;
  y: number;
  source: ChartPoint;
}

function buildPlot(points: ChartPoint[]) {
  if (points.length < 2) {
    return {
      pathPoints: [] as PlotPoint[],
      linePath: "",
      areaPath: "",
      open: 0,
      yLabels: [] as { y: number; value: number }[],
      xLabels: [] as { x: number; label: string }[],
    };
  }

  const prices = points.map((p) => p.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const pad = (max - min) * 0.08 || max * 0.02 || 1;
  min -= pad;
  max += pad;

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const pathPoints: PlotPoint[] = points.map((p, i) => ({
    x: PAD.left + (i / (points.length - 1)) * innerW,
    y: PAD.top + (1 - (p.price - min) / (max - min)) * innerH,
    source: p,
  }));

  const linePath = pathPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const baseY = CHART_H - PAD.bottom;
  const areaPath =
    linePath +
    ` L ${pathPoints[pathPoints.length - 1].x.toFixed(1)} ${baseY}` +
    ` L ${pathPoints[0].x.toFixed(1)} ${baseY} Z`;

  const yLabels = [0, 0.5, 1].map((t) => {
    const value = min + (1 - t) * (max - min);
    const y = PAD.top + t * innerH;
    return { y, value };
  });

  const xCount = 5;
  const xLabels = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.round((i / (xCount - 1)) * (points.length - 1));
    const pt = points[idx];
    const x = pathPoints[idx].x;
    const label = new Date(pt.time).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      ...(points.length > 48 ? { day: "2-digit", month: "short" } : {}),
    });
    return { x, label };
  });

  return {
    pathPoints,
    linePath,
    areaPath,
    open: points[0].price,
    yLabels,
    xLabels,
  };
}

interface CandleBox {
  x: number;
  w: number;
  yHigh: number;
  yLow: number;
  yOpen: number;
  yClose: number;
  up: boolean;
  candle: Candle;
}

function buildCandlePlot(candles: Candle[]) {
  if (candles.length < 2) return null;

  let min = Math.min(...candles.map((c) => c.low));
  let max = Math.max(...candles.map((c) => c.high));
  const pad = (max - min) * 0.08 || max * 0.02 || 1;
  min -= pad;
  max += pad;

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const yOf = (price: number) =>
    PAD.top + (1 - (price - min) / (max - min)) * innerH;

  const slot = innerW / candles.length;
  const w = Math.max(2, Math.min(14, slot * 0.6));

  const candlesBox: CandleBox[] = candles.map((c, i) => ({
    x: PAD.left + (i + 0.5) * slot,
    w,
    yHigh: yOf(c.high),
    yLow: yOf(c.low),
    yOpen: yOf(c.open),
    yClose: yOf(c.close),
    up: c.close >= c.open,
    candle: c,
  }));

  const yLabels = [0, 0.5, 1].map((t) => {
    const value = min + (1 - t) * (max - min);
    const y = PAD.top + t * innerH;
    return { y, value };
  });

  const xCount = 5;
  const xLabels = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.min(
      candles.length - 1,
      Math.round((i / (xCount - 1)) * (candles.length - 1)),
    );
    const c = candles[idx];
    return {
      x: candlesBox[idx].x,
      label: new Date(c.time).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        ...(candles.length > 48 ? { day: "2-digit", month: "short" } : {}),
      }),
    };
  });

  return { candles: candlesBox, yLabels, xLabels };
}

export function PriceChartSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-[280px] w-full rounded-2xl" />
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-10 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
