import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura-GPT",
  description: "以 LangChain 與本機模型驅動的 AI Agent",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
