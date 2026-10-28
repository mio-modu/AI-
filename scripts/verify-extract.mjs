/**
 * 추출 정확도 측정.
 *
 *   GEMINI_API_KEY=... node scripts/verify-extract.mjs [fast|accurate]
 *
 * fixtures/tax_invoice.png를 판독해 fixtures/tax_invoice.answer.json과 대조한다.
 * 정답은 손으로 입력한 값이므로, 여기서 나오는 점수가 모델 티어를 고르는 근거가 된다.
 * 모델을 바꾸거나 프롬프트를 손볼 때마다 이 스크립트를 돌려서 점수가 내려가지 않는지 본다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const tier = process.argv[2] === "accurate" ? "accurate" : "fast";
const MODELS = { fast: "gemini-3.1-flash-lite", accurate: "gemini-3.8-flash" };

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY가 필요합니다.  GEMINI_API_KEY=... node scripts/verify-extract.mjs");
  process.exit(1);
}

const schema = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures", "voucher.schema.json"), "utf8"),
);
const answer = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures", "tax_invoice.answer.json"), "utf8"),
);
const img = fs.readFileSync(path.join(root, "fixtures", "tax_invoice.png")).toString("base64");

const PROMPT = `이 이미지는 한국 회계 전표입니다. 이미지에 실제로 보이는 내용만 추출하세요.

규칙:
- 금액은 쉼표와 원 표시를 제거한 순수 숫자로 적습니다.
- 사업자등록번호는 000-00-00000 형식으로 하이픈을 넣습니다.
- 날짜는 YYYY-MM-DD 형식으로 변환합니다. 연도가 없으면 작성일자의 연도를 따릅니다.
- 이미지에 없는 값은 추측하지 말고 빈 문자열 또는 0으로 둡니다.
- 품목은 표에 있는 행만 순서대로 옮깁니다. 행을 합치거나 나누지 않습니다.
- 금액을 직접 계산해서 채우지 마세요. 적혀 있는 숫자를 그대로 읽습니다.`;

const t = Date.now();
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[tier]}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: img } }, { text: PROMPT }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        temperature: 0,
      },
    }),
  },
);

const body = await res.json();
if (body.error) {
  console.error(`실패 [HTTP ${res.status}] ${body.error.message}`);
  process.exit(1);
}
const text = body.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
if (!text) {
  console.error("응답에 내용이 없습니다. finishReason:", body.candidates?.[0]?.finishReason);
  process.exit(1);
}
const got = JSON.parse(text);
const u = body.usageMetadata ?? {};

console.log(`\n모델 ${MODELS[tier]} | ${((Date.now() - t) / 1000).toFixed(1)}초 | 입력 ${u.promptTokenCount} 출력 ${u.candidatesTokenCount} 토큰\n`);

const checks = [
  ["작성일자", got.issueDate, answer.issueDate],
  ["공급자 사업자번호", got.supplier?.regNo, answer.supplier.regNo],
  ["공급자 상호", got.supplier?.name, answer.supplier.name],
  ["공급받는자 사업자번호", got.buyer?.regNo, answer.buyer.regNo],
  ["공급받는자 상호", got.buyer?.name, answer.buyer.name],
  ["공급가액", got.supplyAmount, answer.supplyAmount],
  ["세액", got.taxAmount, answer.taxAmount],
  ["합계금액", got.totalAmount, answer.totalAmount],
  ["품목 수", got.items?.length, answer.items.length],
  [
    "품목 공급가액",
    JSON.stringify(got.items?.map((i) => i.supplyAmount)),
    JSON.stringify(answer.items.map((i) => i.supplyAmount)),
  ],
];

let pass = 0;
for (const [label, g, w] of checks) {
  if (JSON.stringify(g) === JSON.stringify(w)) pass++;
  else console.log(`  X ${label}\n      정답: ${w}\n      판독: ${g}`);
}
console.log(`\n정확도 ${pass}/${checks.length}\n`);
process.exit(pass === checks.length ? 0 : 1);
