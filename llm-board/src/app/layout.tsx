import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM 보드 — Claude · GPT · Gemini를 원가로",
  description:
    "구독 대신 API로 직접. 한 화면에서 세 모델을 쓰고, 메시지마다 드는 비용을 원화로 바로 확인합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
