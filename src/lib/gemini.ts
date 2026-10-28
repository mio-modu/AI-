import { VOUCHER_JSON_SCHEMA, type Voucher } from "./schema";

/**
 * Gemini 문서 추출 래퍼.
 *
 * 추출은 구조화 출력(responseJsonSchema)으로 받는다. 자유 텍스트를 파싱하면
 * 전표마다 형태가 달라져서 후처리 규칙이 끝없이 늘어난다.
 *
 * 원가 메모: 추출은 전표 1건당 한 번만 돌고 검증은 공짜(순수 로직)이므로,
 * 모델을 올리는 비용이 그대로 건당 단가가 된다. 기본값을 flash-lite로 둔 이유다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 120_000;

export const EXTRACT_MODELS = {
  fast: "gemini-3.1-flash-lite",
  accurate: "gemini-3.8-flash",
} as const;

export type ExtractTier = keyof typeof EXTRACT_MODELS;

const PROMPT = `이 이미지는 한국 회계 전표입니다. 이미지에 실제로 보이는 내용만 추출하세요.

규칙:
- 금액은 쉼표와 원 표시를 제거한 순수 숫자로 적습니다.
- 사업자등록번호는 000-00-00000 형식으로 하이픈을 넣습니다.
- 날짜는 YYYY-MM-DD 형식으로 변환합니다. 연도가 없으면 작성일자의 연도를 따릅니다.
- 이미지에 없는 값은 추측하지 말고 빈 문자열 또는 0으로 둡니다.
- 품목은 표에 있는 행만 순서대로 옮깁니다. 행을 합치거나 나누지 않습니다.
- 금액을 직접 계산해서 채우지 마세요. 적혀 있는 숫자를 그대로 읽습니다.`;

export class ExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

export type ExtractResult = {
  voucher: Voucher;
  usage: { promptTokens: number; outputTokens: number };
  model: string;
};

export async function extractVoucher(params: {
  tier: ExtractTier;
  mimeType: string;
  /** base64 본문 (data: 접두사 없음) */
  data: string;
}): Promise<ExtractResult> {
  const model = EXTRACT_MODELS[params.tier] ?? EXTRACT_MODELS.fast;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        contents: [
          { parts: [{ inlineData: { mimeType: params.mimeType, data: params.data } }, { text: PROMPT }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: VOUCHER_JSON_SCHEMA,
          // 전표 판독에 창의성은 해롭다. 같은 문서는 항상 같게 읽혀야 한다.
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ExtractError("판독 시간이 초과되었습니다. 파일 용량을 줄여 다시 시도해 주세요.", 504);
    }
    throw new ExtractError("판독 서버에 연결하지 못했습니다.", 502);
  }

  const raw = await res.text();

  if (!res.ok) {
    throw new ExtractError(describeApiError(raw, res.status), res.status);
  }

  let body: GeminiResponse;
  try {
    body = JSON.parse(raw) as GeminiResponse;
  } catch {
    throw new ExtractError("판독 응답을 해석하지 못했습니다.", 502);
  }

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.find((p) => typeof p.text === "string")?.text;

  if (!text) {
    const reason = candidate?.finishReason ?? "UNKNOWN";
    throw new ExtractError(
      reason === "MAX_TOKENS"
        ? "전표 내용이 많아 판독이 중간에 끊겼습니다. 페이지를 나눠 올려주세요."
        : `전표를 판독하지 못했습니다 (사유: ${reason}).`,
      422,
    );
  }

  let voucher: Voucher;
  try {
    voucher = JSON.parse(text) as Voucher;
  } catch {
    throw new ExtractError("판독 결과가 올바른 형식이 아닙니다. 다시 시도해 주세요.", 502);
  }

  return {
    voucher,
    model,
    usage: {
      promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

function describeApiError(raw: string, status: number): string {
  let message: string | undefined;
  try {
    message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message;
  } catch {
    /* 본문이 JSON이 아니면 상태 코드로만 안내한다. */
  }

  if (status === 402 || /credits are depleted/i.test(message ?? "")) {
    return "Gemini API 크레딧이 소진되었습니다. Google AI Studio에서 결제 정보를 확인해 주세요.";
  }
  if (status === 429) {
    return "요청이 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (status === 400 && /API key/i.test(message ?? "")) {
    return "GEMINI_API_KEY가 올바르지 않습니다.";
  }
  return message ?? `판독 요청이 실패했습니다 (HTTP ${status}).`;
}

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};
