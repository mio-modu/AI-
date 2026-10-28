import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "전표리더 — 세금계산서·거래명세서 자동 입력",
  description:
    "세금계산서·거래명세서·발주서를 읽어 ERP 입력용 데이터로 바꿉니다. 사업자번호 체크섬과 금액 정합성을 기계가 검증해, 사람이 봐야 할 건만 골라냅니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
