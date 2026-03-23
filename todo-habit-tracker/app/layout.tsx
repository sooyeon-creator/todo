import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "할일 + 습관 트래커",
  description: "할 일과 습관을 함께 관리하세요",
};

// 모바일 브라우저가 페이지를 축소하지 않게 함
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full text-gray-900 antialiased" style={{ backgroundColor: '#F7F7F7' }}>{children}</body>
    </html>
  );
}
