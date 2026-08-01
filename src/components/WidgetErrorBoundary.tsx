"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Error boundary cho từng widget.
 *
 * Phạm vi thật của nó: lỗi xảy ra trong lúc RENDER. Lỗi mạng của TanStack Query
 * không đi qua đây — query trả lỗi về dưới dạng state (`isError`) và mỗi widget
 * đã tự xử lý. Thứ boundary này chặn là loại lỗi khó lường hơn: API bên thứ ba
 * đổi shape response, rồi component đọc `data.foo.bar` trên `foo === undefined`
 * và throw giữa lúc render.
 *
 * Vì sao phải bọc theo từng widget thay vì chỉ dựa vào `app/error.tsx`:
 * `error.tsx` của Next thay thế TOÀN BỘ nội dung route. Một lỗi trong gallery
 * NFT (Alchemy) sẽ xoá luôn danh sách tài sản và tab swap — dữ liệu chẳng liên
 * quan gì tới nhau. Bọc riêng thì phần chết chỉ là một ô.
 */

interface Props {
  children: ReactNode;
  /** Tên nguồn dữ liệu để thông báo nói rõ chỗ nào lỗi, vd "CoinGecko". */
  label: string;
}

interface State {
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Chưa gắn telemetry (Sentry/OTel) nên log ra console: ít nhất lỗi không bị
    // ăn mất im lặng khi debug.
    console.error(`[${this.props.label}] widget lỗi:`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-100">
              Phần {this.props.label} gặp lỗi và đã được tách riêng để không ảnh
              hưởng các phần khác.
            </p>
            <p className="mt-1 break-words font-mono text-[11px] text-amber-200/60">
              {error.message.slice(0, 160)}
            </p>
            <button
              onClick={this.retry}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100 outline-none transition-colors hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <RotateCcw className="h-3 w-3" /> Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }
}
