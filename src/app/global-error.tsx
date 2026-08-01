"use client";

/**
 * Lưới cuối: lỗi xảy ra trong `layout.tsx` gốc (ví dụ `Providers` throw lúc
 * khởi tạo wagmi config). Lúc đó `app/error.tsx` không dùng được vì nó nằm BÊN
 * TRONG layout đã chết.
 *
 * Vì thay thế cả layout gốc, file này phải tự render `<html>` và `<body>`, và
 * không được dựa vào bất cứ provider nào — kể cả font hay CSS biến thể của
 * layout. Do đó style ở đây viết inline, không dùng class Tailwind phụ thuộc
 * `globals.css`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a10",
          color: "#e5e5e5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "1.5rem",
            background: "rgba(24,24,27,0.7)",
            padding: "1.5rem",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            Ứng dụng không khởi tạo được
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#98a1c0",
              lineHeight: 1.5,
            }}
          >
            Lỗi xảy ra ở tầng ngoài cùng nên toàn bộ giao diện chưa dựng được.
            Thử tải lại; nếu vẫn lỗi, xoá cache trình duyệt cho trang này.
          </p>
          <p
            style={{
              marginTop: "0.75rem",
              padding: "0.625rem",
              borderRadius: "0.75rem",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.6875rem",
              color: "#737373",
              wordBreak: "break-word",
            }}
          >
            {error.message.slice(0, 300)}
            {error.digest ? ` (digest: ${error.digest})` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              width: "100%",
              cursor: "pointer",
              border: "none",
              borderRadius: "1rem",
              background: "#ff007a",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.625rem 1rem",
            }}
          >
            Tải lại
          </button>
        </div>
      </body>
    </html>
  );
}
