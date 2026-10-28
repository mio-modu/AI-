import { costKrw, findModel, DEFAULT_USD_KRW, type Usage } from "./pricing";

/**
 * 사용 기록.
 *
 * 토큰 수와 모델 ID만 저장하고 금액은 저장하지 않는다. 요금표를 고치면
 * 과거 기록까지 다시 계산되어야 하기 때문이다 — 금액을 박아두면 요금이
 * 바뀐 뒤 누적 금액이 영영 틀린 채로 남는다.
 *
 * 브라우저 localStorage에 쌓이므로 기기별로 따로 집계된다.
 */

const KEY = "llm-board.usage.v1";
const MAX_ENTRIES = 5000;

export type UsageEntry = {
  at: number;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export function loadUsage(): UsageEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 시크릿 모드나 저장소 차단 시 읽기가 던진다. 기록이 없는 것으로 본다.
    return [];
  }
}

export function appendUsage(entry: UsageEntry): UsageEntry[] {
  const next = [...loadUsage(), entry].slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패해도 화면 동작은 막지 않는다. */
  }
  return next;
}

export function clearUsage() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

/** 이번 달 1일 0시부터의 누적. */
export function monthlyTotals(entries: UsageEntry[], usdKrw = DEFAULT_USD_KRW, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let krw = 0;
  let input = 0;
  let output = 0;
  let calls = 0;

  for (const e of entries) {
    if (e.at < start) continue;
    const model = findModel(e.modelId);
    if (!model) continue; // 요금표에서 사라진 모델은 집계에서 뺀다
    krw += costKrw({ inputTokens: e.inputTokens, outputTokens: e.outputTokens }, model, usdKrw);
    input += e.inputTokens;
    output += e.outputTokens;
    calls++;
  }

  return { krw, inputTokens: input, outputTokens: output, calls };
}

export function entryCost(e: UsageEntry, usdKrw = DEFAULT_USD_KRW): number {
  const model = findModel(e.modelId);
  if (!model) return 0;
  return costKrw({ inputTokens: e.inputTokens, outputTokens: e.outputTokens } as Usage, model, usdKrw);
}
