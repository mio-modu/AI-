/**
 * 검증 엔진 테스트. 의존성 없이 `node scripts/validate.test.mjs`로 돈다.
 * tsx 없이 돌리려고 TS를 즉석 트랜스파일하지 않고, 빌드된 결과 대신
 * 순수 로직을 그대로 복사하지도 않는다 — esbuild 없이 돌도록 tsc 출력물을 쓴다.
 */
import { validateVoucher, isValidRegNo } from "../.testbuild/validate.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`  X ${label}\n      기대: ${JSON.stringify(want)}\n      실제: ${JSON.stringify(got)}`); }
};
const has = (label, findings, needle) => {
  const ok = findings.some((f) => f.message.includes(needle) || f.field === needle);
  if (ok) pass++;
  else { fail++; console.log(`  X ${label}\n      "${needle}" 포함된 지적 없음. 실제: ${findings.map((f) => f.field).join(", ") || "(없음)"}`); }
};

const NOW = new Date("2026-10-28T00:00:00Z");

console.log("\n[1] 사업자등록번호 체크섬");
// 실재하는 형식의 유효 번호 (손으로 검증식 계산해 확인함)
eq("261-13-02753 유효", isValidRegNo("261-13-02753"), true);
eq("220-81-62517 유효", isValidRegNo("220-81-62517"), true);
eq("하이픈 없어도 동작", isValidRegNo("2611302753"), true);
// 끝자리만 틀리면 반드시 걸려야 한다 — OCR 1자리 오인식 시나리오
eq("261-13-02754 무효", isValidRegNo("261-13-02754"), false);
eq("261-13-02750 무효", isValidRegNo("261-13-02750"), false);
eq("자리수 부족", isValidRegNo("261-13-0275"), false);
eq("전부 0 거부", isValidRegNo("000-00-00000"), false);
eq("빈 문자열", isValidRegNo(""), false);

const BASE = {
  docType: "세금계산서",
  issueDate: "2026-09-30",
  supplier: { regNo: "261-13-02753", name: "루메인", ceo: "박성은" },
  buyer: { regNo: "220-81-62517", name: "주식회사 대한상사", ceo: "김영호" },
  supplyAmount: 12850000,
  taxAmount: 1285000,
  totalAmount: 14135000,
  items: [
    { name: "AI 헤어스타일 미리보기 SaaS 구축", qty: 1, unitPrice: 8500000, supplyAmount: 8500000, taxAmount: 850000 },
    { name: "ERP 전표 연동 모듈 개발", qty: 1, unitPrice: 3200000, supplyAmount: 3200000, taxAmount: 320000 },
    { name: "유지보수 (9월분)", qty: 1, unitPrice: 1150000, supplyAmount: 1150000, taxAmount: 115000 },
  ],
};
const clone = (patch) => JSON.parse(JSON.stringify({ ...BASE, ...patch }));

console.log("\n[2] 정상 전표는 통과해야 한다");
const good = validateVoucher(clone({}), NOW);
eq("판정 auto", good.verdict, "auto");
eq("지적사항 0건", good.findings.length, 0);

console.log("\n[3] 금액 오인식 탐지");
// 합계만 틀린 경우 (8 -> 9 오인식)
const t1 = validateVoucher(clone({ totalAmount: 14135900 }), NOW);
eq("판정 reject", t1.verdict, "reject");
has("합계 불일치 지적", t1.findings, "totalAmount");
// 품목 한 행 누락 — 실무에서 가장 잦은 실패
const t2 = validateVoucher(clone({ items: BASE.items.slice(0, 2) }), NOW);
eq("행 누락 reject", t2.verdict, "reject");
has("품목 합계 불일치", t2.findings, "items");
// 품목 금액 한 자리 오인식
const bad = JSON.parse(JSON.stringify(BASE.items));
bad[1].supplyAmount = 320000;
const t3 = validateVoucher(clone({ items: bad }), NOW);
eq("자릿수 오인식 reject", t3.verdict, "reject");
// 수량x단가 불일치는 경고
const q = JSON.parse(JSON.stringify(BASE.items));
q[0].qty = 2;
const t4 = validateVoucher(clone({ items: q }), NOW);
has("수량x단가 경고", t4.findings, "items.0.supplyAmount");

console.log("\n[4] 사업자번호 오인식 탐지");
const t5 = validateVoucher(clone({ buyer: { regNo: "220-81-62518", name: "주식회사 대한상사" } }), NOW);
eq("체크섬 실패 reject", t5.verdict, "reject");
has("공급받는자 번호 지적", t5.findings, "buyer.regNo");
const t6 = validateVoucher(clone({ buyer: { regNo: "261-13-02753", name: "루메인" } }), NOW);
has("자기거래 지적", t6.findings, "buyer.regNo");

console.log("\n[5] 날짜 검증");
eq("미래 날짜 reject", validateVoucher(clone({ issueDate: "2027-01-05" }), NOW).verdict, "reject");
eq("존재하지 않는 날짜(2월30일) reject", validateVoucher(clone({ issueDate: "2026-02-30" }), NOW).verdict, "reject");
eq("형식 오류 reject", validateVoucher(clone({ issueDate: "2026/09/30" }), NOW).verdict, "reject");
has("연도 오인식 경고", validateVoucher(clone({ issueDate: "2019-09-30" }), NOW).findings, "issueDate");

console.log("\n[6] 영세율·면세는 반려가 아니라 확인 대상");
const zero = validateVoucher(
  clone({ taxAmount: 0, totalAmount: 12850000, items: BASE.items.map((i) => ({ ...i, taxAmount: 0 })) }),
  NOW,
);
eq("판정 review", zero.verdict, "review");
has("영세율 확인 안내", zero.findings, "taxAmount");

console.log("\n[7] 세액이 10%와 다르면 경고 (내부 정합성은 맞는 경우)");
const oddItems = JSON.parse(JSON.stringify(BASE.items));
oddItems[0].taxAmount = 800000;
oddItems[1].taxAmount = 300000;
oddItems[2].taxAmount = 100000; // 합계 1,200,000
const odd = validateVoucher(clone({ taxAmount: 1200000, totalAmount: 14050000, items: oddItems }), NOW);
eq("판정 review", odd.verdict, "review");
has("10% 불일치 경고", odd.findings, "taxAmount");

console.log("\n[8] 전체 세액만 고치고 품목 세액을 안 고치면 교차 불일치로 반려");
const crossBad = validateVoucher(clone({ taxAmount: 1200000, totalAmount: 14050000 }), NOW);
eq("판정 reject", crossBad.verdict, "reject");
has("품목 세액 합계 지적", crossBad.findings, "품목 세액 합계");

console.log(`\n${"=".repeat(46)}\n통과 ${pass} / 실패 ${fail}\n${"=".repeat(46)}`);
process.exit(fail === 0 ? 0 : 1);
