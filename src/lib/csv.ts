import type { Voucher } from "./schema";

/**
 * ERP 업로드용 CSV 변환.
 *
 * 전표 헤더와 품목을 한 행으로 펼친다(품목 수만큼 행 생성). 대부분의 국내 ERP
 * 전표 업로드 양식이 품목 단위 행을 요구하기 때문이다.
 * 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다.
 */

const HEADERS = [
  "문서종류", "작성일자",
  "공급자_사업자번호", "공급자_상호", "공급자_대표자",
  "공급받는자_사업자번호", "공급받는자_상호", "공급받는자_대표자",
  "품목명", "규격", "수량", "단가", "품목_공급가액", "품목_세액",
  "전표_공급가액", "전표_세액", "전표_합계금액", "비고", "검증결과",
] as const;

export function vouchersToCsv(rows: { voucher: Voucher; verdictLabel: string }[]): string {
  const lines = [HEADERS.join(",")];

  for (const { voucher: v, verdictLabel } of rows) {
    const head = [
      v.docType, v.issueDate,
      v.supplier?.regNo, v.supplier?.name, v.supplier?.ceo,
      v.buyer?.regNo, v.buyer?.name, v.buyer?.ceo,
    ];
    const tail = [v.supplyAmount, v.taxAmount, v.totalAmount, v.note, verdictLabel];

    const items = v.items?.length ? v.items : [null];
    for (const it of items) {
      lines.push(
        [
          ...head,
          it?.name, it?.spec, it?.qty, it?.unitPrice, it?.supplyAmount, it?.taxAmount,
          ...tail,
        ]
          .map(cell)
          .join(","),
      );
    }
  }

  return "﻿" + lines.join("\r\n");
}

function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  // 쉼표·따옴표·줄바꿈이 있으면 감싸고, 내부 따옴표는 두 번 쓴다.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
