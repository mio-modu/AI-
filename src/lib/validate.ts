import type { Voucher } from "./schema";

/**
 * 전표 검증 엔진.
 *
 * 이 제품이 파는 것은 "AI가 읽어준다"가 아니라 "AI가 틀린 걸 잡아낸다"이다.
 * 경리 담당자는 자동 입력이 99% 맞아도 나머지 1%를 찾느라 전수 검토를 하고,
 * 그러면 자동화 가치가 0이 된다. 그래서 기계가 판정 가능한 규칙을 전부 돌려서
 * "이 건은 그냥 넘겨도 된다 / 이 건은 사람이 봐야 한다"를 명시적으로 가른다.
 *
 * 규칙은 전부 결정적이다. 검증에는 모델을 쓰지 않는다 —
 * 추출한 모델에게 채점까지 맡기면 같은 실수를 같은 방향으로 반복한다.
 */

export type Severity = "error" | "warning";

export type Finding = {
  severity: Severity;
  /** 어느 필드가 문제인지. UI에서 해당 입력란을 강조하는 데 쓴다. */
  field: string;
  message: string;
};

export type Verdict = "auto" | "review" | "reject";

export type ValidationResult = {
  verdict: Verdict;
  findings: Finding[];
};

/** 부가가치세 일반세율. */
const VAT_RATE = 0.1;
/** 원 단위 절사로 생기는 오차 허용폭. */
const ROUNDING_TOLERANCE = 1;

/**
 * 사업자등록번호 체크섬.
 *
 * 국세청 검증식: 앞 9자리에 가중치 [1,3,7,1,3,7,1,3,5]를 곱해 더하고,
 * 9번째 자리에 5를 곱한 값의 십의 자리를 더한 뒤, 10에서 끝자리를 뺀 값이 검증번호다.
 * 형식만 맞고 실재하지 않는 번호를 걸러낸다 — OCR 오인식이 가장 자주 나는 필드다.
 */
export function isValidRegNo(regNo: string): boolean {
  const d = regNo.replace(/\D/g, "");
  if (d.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(d)) return false; // 0000000000 같은 자리표시자

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * weights[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);

  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

export function formatRegNo(regNo: string): string {
  const d = regNo.replace(/\D/g, "");
  if (d.length !== 10) return regNo;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** YYYY-MM-DD 이면서 달력상 실재하는 날짜인지. */
function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, day] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return dt;
}

export function validateVoucher(v: Voucher, now: Date = new Date()): ValidationResult {
  const f: Finding[] = [];
  const err = (field: string, message: string) => f.push({ severity: "error", field, message });
  const warn = (field: string, message: string) => f.push({ severity: "warning", field, message });

  // --- 거래 당사자 ---
  for (const [key, party, label] of [
    ["supplier", v.supplier, "공급자"],
    ["buyer", v.buyer, "공급받는자"],
  ] as const) {
    if (!party?.regNo?.trim()) {
      err(`${key}.regNo`, `${label} 사업자등록번호가 비어 있습니다.`);
    } else if (!isValidRegNo(party.regNo)) {
      err(`${key}.regNo`, `${label} 사업자등록번호 ${party.regNo}는 검증번호가 맞지 않습니다. 오인식 가능성이 큽니다.`);
    }
    if (!party?.name?.trim()) {
      err(`${key}.name`, `${label} 상호가 비어 있습니다.`);
    }
  }

  if (
    v.supplier?.regNo &&
    v.buyer?.regNo &&
    v.supplier.regNo.replace(/\D/g, "") === v.buyer.regNo.replace(/\D/g, "")
  ) {
    err("buyer.regNo", "공급자와 공급받는자의 사업자등록번호가 같습니다.");
  }

  // --- 작성일자 ---
  const issued = parseIsoDate(v.issueDate ?? "");
  if (!issued) {
    err("issueDate", `작성일자 "${v.issueDate}"를 날짜로 읽을 수 없습니다.`);
  } else {
    // 하루치 시차를 감안해도 미래면 오인식이다.
    const tomorrow = new Date(now.getTime() + 86_400_000);
    if (issued > tomorrow) {
      err("issueDate", `작성일자 ${v.issueDate}가 미래입니다.`);
    } else if (now.getTime() - issued.getTime() > 5 * 365 * 86_400_000) {
      warn("issueDate", `작성일자 ${v.issueDate}가 5년 이상 지났습니다. 연도 오인식일 수 있습니다.`);
    }
  }

  // --- 금액 정합성 ---
  const supply = num(v.supplyAmount);
  const tax = num(v.taxAmount);
  const total = num(v.totalAmount);

  if (supply <= 0) err("supplyAmount", "공급가액이 0 이하입니다.");
  if (tax < 0) err("taxAmount", "세액이 음수입니다.");

  if (Math.abs(supply + tax - total) > ROUNDING_TOLERANCE) {
    err(
      "totalAmount",
      `합계금액이 맞지 않습니다. 공급가액 ${won(supply)} + 세액 ${won(tax)} = ${won(supply + tax)}인데 합계는 ${won(total)}입니다.`,
    );
  }

  // 영세율·면세는 세액이 0이므로 오류가 아니라 확인 대상으로 둔다.
  if (tax === 0) {
    warn("taxAmount", "세액이 0입니다. 영세율 또는 면세 거래인지 확인하세요.");
  } else if (Math.abs(tax - supply * VAT_RATE) > ROUNDING_TOLERANCE) {
    warn(
      "taxAmount",
      `세액이 공급가액의 10%(${won(Math.round(supply * VAT_RATE))})와 다릅니다. 현재 ${won(tax)}.`,
    );
  }

  // --- 품목 ---
  if (!Array.isArray(v.items) || v.items.length === 0) {
    warn("items", "품목이 하나도 추출되지 않았습니다.");
  } else {
    const itemSupply = v.items.reduce((s, it) => s + num(it.supplyAmount), 0);
    if (Math.abs(itemSupply - supply) > ROUNDING_TOLERANCE) {
      err(
        "items",
        `품목 공급가액 합계 ${won(itemSupply)}가 전체 공급가액 ${won(supply)}와 다릅니다. 행 누락 또는 금액 오인식입니다.`,
      );
    }

    const hasAnyItemTax = v.items.some((it) => it.taxAmount !== undefined && it.taxAmount !== null);
    if (hasAnyItemTax) {
      const itemTax = v.items.reduce((s, it) => s + num(it.taxAmount), 0);
      if (Math.abs(itemTax - tax) > ROUNDING_TOLERANCE) {
        err("items", `품목 세액 합계 ${won(itemTax)}가 전체 세액 ${won(tax)}와 다릅니다.`);
      }
    }

    v.items.forEach((it, i) => {
      const row = i + 1;
      if (!it.name?.trim()) warn(`items.${i}.name`, `${row}번 품목의 품목명이 비어 있습니다.`);

      const qty = num(it.qty);
      const unit = num(it.unitPrice);
      if (qty > 0 && unit > 0) {
        const expected = qty * unit;
        if (Math.abs(expected - num(it.supplyAmount)) > ROUNDING_TOLERANCE) {
          warn(
            `items.${i}.supplyAmount`,
            `${row}번 품목: 수량 ${qty} × 단가 ${won(unit)} = ${won(expected)}인데 공급가액은 ${won(num(it.supplyAmount))}입니다.`,
          );
        }
      }
    });
  }

  const hasError = f.some((x) => x.severity === "error");
  const verdict: Verdict = hasError ? "reject" : f.length > 0 ? "review" : "auto";

  return { verdict, findings: f };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  auto: "자동 승인 가능",
  review: "확인 권장",
  reject: "사람 검토 필요",
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
