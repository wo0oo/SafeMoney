import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeMoney",
  description: "안전한 금융 생활을 위한 SafeMoney",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
