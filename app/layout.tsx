import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeOrg · 个人经营系统",
  description: "由你担任CEO，与AI团队通过每日站会、周经营会和决策日志共同经营生活。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
