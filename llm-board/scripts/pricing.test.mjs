import { MODELS, findModel, costKrw, formatKrw } from "../.t/pricing.js";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log(`  X ${label}${detail ? "\n      " + detail : ""}`); }
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log("\n[1] 요금 계산 — 손계산과 대조");
const opus = findModel("claude-opus-5-5");
// 100만 입력 + 100만 출력 = $4 + $20 = $24 → 1450원 환율 → 34,800원
ok("Opus 1M+1M = 34,800원",
  near(costKrw({ inputTokens: 1e6, outputTokens: 1e6 }, opus, 1450), 34800),
  `실제 ${costKrw({ inputTokens: 1e6, outputTokens: 1e6 }, opus, 1450)}`);

const haiku = findModel("claude-haiku-5-5");
// $0.10 + $0.50 = $0.60 → 870원
ok("Haiku 1M+1M = 870원",
  near(costKrw({ inputTokens: 1e6, outputTokens: 1e6 }, haiku, 1450), 870));

ok("Opus가 Haiku보다 정확히 40배",
  near(
    costKrw({ inputTokens: 1e6, outputTokens: 1e6 }, opus, 1450) /
    costKrw({ inputTokens: 1e6, outputTokens: 1e6 }, haiku, 1450), 40));

// 현실적인 채팅 한 턴: 입력 3000 / 출력 800
const turn = { inputTokens: 3000, outputTokens: 800 };
const sonnet = findModel("claude-sonnet-5-5");
const turnKrw = costKrw(turn, sonnet, 1450);
// (3000/1e6)*2 + (800/1e6)*10 = 0.006 + 0.008 = $0.014 → 20.3원
ok("Sonnet 한 턴 20.3원", near(turnKrw, 20.3, 1e-9), `실제 ${turnKrw}`);
ok("한 턴이 100원 미만", turnKrw < 100);

console.log("\n[2] 0 / 경계값");
ok("사용량 0이면 0원", costKrw({ inputTokens: 0, outputTokens: 0 }, opus) === 0);
ok("출력만 있어도 계산됨", costKrw({ inputTokens: 0, outputTokens: 1000 }, opus, 1450) > 0);

console.log("\n[3] 환율 반영");
ok("환율 2배면 금액 2배",
  near(costKrw(turn, sonnet, 2900), costKrw(turn, sonnet, 1450) * 2));

console.log("\n[4] 표기 — 소수점이 0원으로 뭉개지지 않아야 한다");
ok("0.02원 유지", formatKrw(0.0234) === "0.02원", formatKrw(0.0234));
ok("20.3원 유지", formatKrw(20.34) === "20.3원", formatKrw(20.34));
ok("1,235원 반올림", formatKrw(1234.7) === "1,235원", formatKrw(1234.7));
ok("0원", formatKrw(0) === "0원");

console.log("\n[5] 요금표 무결성");
ok("모델 ID 중복 없음", new Set(MODELS.map((m) => m.id)).size === MODELS.length);
ok("모든 단가가 양수", MODELS.every((m) => m.inputPerM > 0 && m.outputPerM > 0));
ok("출력이 입력보다 비싸거나 같음", MODELS.every((m) => m.outputPerM >= m.inputPerM));
ok("제공사 3사 모두 존재",
  new Set(MODELS.map((m) => m.provider)).size === 3);
ok("미확인 요금은 note로 표시됨",
  MODELS.filter((m) => m.confidence === "unverified").every((m) => !!m.note));

console.log("\n[6] 구독 대비 손익분기 — 월 15만원 기준 몇 턴까지 이득인가");
for (const [label, spec] of [["Sonnet 5.5", sonnet], ["Opus 5.5", opus], ["Haiku 5.5", haiku]]) {
  const per = costKrw(turn, spec, 1450);
  console.log(`     ${label.padEnd(12)} 턴당 ${formatKrw(per).padStart(8)}  →  15만원이면 ${Math.floor(150000 / per).toLocaleString("ko-KR")}턴`);
}

console.log(`\n${"=".repeat(44)}\n통과 ${pass} / 실패 ${fail}\n${"=".repeat(44)}`);
process.exit(fail === 0 ? 0 : 1);
