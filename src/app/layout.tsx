import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "착용컷 생성기 — 상품 사진 한 장으로 모델 착용컷을",
  description:
    "상품 사진만 올리면 모델·배경·코디까지 자동으로 맞춘 커머스용 착용컷을 만들어 줍니다. 스튜디오 촬영 없이 상세페이지 메인컷을 뽑으세요.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
