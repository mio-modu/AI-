/**
 * 모델 요금표.
 *
 * 요금은 수시로 바뀌고 출처마다 다르다. 그래서 이 파일은 "고쳐 쓰는 설정"으로 설계했다.
 * 숫자가 틀리면 토큰 수는 맞아도 원화 금액이 틀어지므로, 각 항목에 출처 신뢰도를 달고
 * UI 하단에 확인일자를 노출한다. 의심되면 공식 요금 페이지를 보고 이 파일만 고치면 된다.
 *
 * 단위: USD / 100만 토큰
 */

export const PRICING_LAST_VERIFIED = "2026-10-28";

/** 요금 출처 신뢰도. UI에서 "확인 필요" 배지를 띄우는 데 쓴다. */
export type PriceConfidence = "verified" | "unverified";

export type ModelSpec = {
  id: string;
  label: string;
  provider: ProviderId;
  /** USD / 1M 입력 토큰 */
  inputPerM: number;
  /** USD / 1M 출력 토큰 */
  outputPerM: number;
  confidence: PriceConfidence;
  note?: string;
};

export const PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude",
  openai: "GPT",
  gemini: "Gemini",
};

/** 제공사별 키 환경변수 이름. 서버에서만 읽는다. */
export const PROVIDER_ENV: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export const MODELS: ModelSpec[] = [
  // --- Claude: Anthropic 공식 요금표 기준 ---
  {
    id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic",
    inputPerM: 4, outputPerM: 20, confidence: "verified",
    note: "가장 성능이 높은 기본 모델",
  },
  {
    id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic",
    inputPerM: 2, outputPerM: 10, confidence: "verified",
    note: "일상 작업 대비 성능·가격 균형",
  },
  {
    id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "anthropic",
    inputPerM: 0.1, outputPerM: 0.5, confidence: "verified",
    note: "Opus 대비 40배 저렴. 요약·분류·단순 질의용",
  },

  // --- GPT: 공식 페이지 미확인. 3자 집계 기준이라 반드시 대조할 것 ---
  {
    id: "gpt-6-astra", label: "GPT-6 Astra", provider: "openai",
    inputPerM: 10, outputPerM: 50, confidence: "unverified",
    note: "요금 미확인 — 공식 페이지 대조 필요",
  },
  {
    id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "openai",
    inputPerM: 2, outputPerM: 10, confidence: "unverified",
    note: "요금 미확인 — 공식 페이지 대조 필요",
  },
  {
    id: "gpt-6-luna", label: "GPT-6 Luna", provider: "openai",
    inputPerM: 0.1, outputPerM: 0.5, confidence: "unverified",
    note: "요금 미확인 — 공식 페이지 대조 필요",
  },

  // --- Gemini: 출처마다 값이 달라 전부 미확인으로 둔다 ---
  {
    id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "gemini",
    inputPerM: 2, outputPerM: 12, confidence: "unverified",
    note: "요금 미확인 — 200K 초과 시 요율이 오른다는 출처가 있음",
  },
  {
    id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "gemini",
    inputPerM: 1.5, outputPerM: 7.5, confidence: "unverified",
    note: "요금 미확인 — 한시 할인가($0.75/$3.75) 적용 중이라는 출처가 있음",
  },
  {
    id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini",
    inputPerM: 0.25, outputPerM: 1.5, confidence: "unverified",
    note: "요금 미확인 — 공식 페이지 대조 필요",
  },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";
export const DEFAULT_USD_KRW = 1450;

export function findModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export type Usage = { inputTokens: number; outputTokens: number };

/**
 * 토큰 사용량을 원화로 환산한다.
 *
 * 토큰 수는 API가 돌려주는 정확한 값이고, 틀릴 수 있는 것은 단가뿐이다.
 * 그래서 토큰 수를 항상 함께 보관해서, 요금표를 고치면 과거 기록도 다시 계산된다.
 */
export function costKrw(usage: Usage, model: ModelSpec, usdKrw = DEFAULT_USD_KRW): number {
  const usd =
    (usage.inputTokens / 1_000_000) * model.inputPerM +
    (usage.outputTokens / 1_000_000) * model.outputPerM;
  return usd * usdKrw;
}

/** 소수점 이하가 대부분이라 반올림하면 전부 0원이 된다. 유효숫자를 남긴다. */
export function formatKrw(krw: number): string {
  if (krw === 0) return "0원";
  if (krw < 1) return `${krw.toFixed(2)}원`;
  if (krw < 100) return `${krw.toFixed(1)}원`;
  return `${Math.round(krw).toLocaleString("ko-KR")}원`;
}
