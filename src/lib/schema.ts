/**
 * 전표 공통 스키마.
 *
 * 세금계산서 · 거래명세서 · 발주서 · 영수증을 하나의 구조로 받는다.
 * 문서 종류마다 필드가 다 차지는 않지만, ERP로 내보낼 때 형태가 하나여야
 * 매핑을 문서별로 다시 짜지 않아도 된다.
 */

export const DOC_TYPES = ["세금계산서", "거래명세서", "발주서", "영수증", "기타"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type Party = {
  /** 사업자등록번호 000-00-00000 */
  regNo: string;
  name: string;
  ceo?: string;
  bizType?: string;
};

export type LineItem = {
  date?: string;
  name: string;
  spec?: string;
  qty?: number;
  unitPrice?: number;
  supplyAmount: number;
  taxAmount?: number;
};

export type Voucher = {
  docType: DocType;
  /** YYYY-MM-DD */
  issueDate: string;
  supplier: Party;
  buyer: Party;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: LineItem[];
  note?: string;
};

/** Gemini 구조화 출력에 그대로 넘기는 JSON Schema. */
export const VOUCHER_JSON_SCHEMA = {
  type: "object",
  properties: {
    docType: { type: "string", enum: [...DOC_TYPES] },
    issueDate: { type: "string", description: "작성일자. YYYY-MM-DD 형식으로 변환" },
    supplier: {
      type: "object",
      properties: {
        regNo: { type: "string", description: "사업자등록번호. 000-00-00000 형식" },
        name: { type: "string", description: "상호" },
        ceo: { type: "string", description: "대표자 성명" },
        bizType: { type: "string", description: "업태 / 종목" },
      },
      required: ["regNo", "name"],
    },
    buyer: {
      type: "object",
      properties: {
        regNo: { type: "string", description: "사업자등록번호. 000-00-00000 형식" },
        name: { type: "string", description: "상호" },
        ceo: { type: "string", description: "대표자 성명" },
        bizType: { type: "string", description: "업태 / 종목" },
      },
      required: ["regNo", "name"],
    },
    supplyAmount: { type: "number", description: "공급가액 합계. 쉼표 없는 숫자" },
    taxAmount: { type: "number", description: "세액 합계. 쉼표 없는 숫자" },
    totalAmount: { type: "number", description: "합계금액. 쉼표 없는 숫자" },
    items: {
      type: "array",
      description: "품목 표의 각 행",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "월일" },
          name: { type: "string", description: "품목명" },
          spec: { type: "string", description: "규격" },
          qty: { type: "number", description: "수량" },
          unitPrice: { type: "number", description: "단가" },
          supplyAmount: { type: "number", description: "공급가액" },
          taxAmount: { type: "number", description: "세액" },
        },
        required: ["name", "supplyAmount"],
      },
    },
    note: { type: "string", description: "비고" },
  },
  required: [
    "docType", "issueDate", "supplier", "buyer",
    "supplyAmount", "taxAmount", "totalAmount", "items",
  ],
} as const;
