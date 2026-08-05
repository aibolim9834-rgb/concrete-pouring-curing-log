import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "콘크리트 타설 및 양생 관리 시스템",
  description: "건설 현장 콘크리트 타설 위치, 온도, 기상, 레미콘사 및 살수/보양 양생 통합 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
