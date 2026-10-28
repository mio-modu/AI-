/**
 * Gemini 이미지 생성 API 얇은 래퍼.
 *
 * 응답 형태는 실제 호출로 확인한 값을 기준으로 한다:
 *   candidates[0].content.parts[] 안에 inlineData { mimeType, data(base64) } 가 들어온다.
 *   parts 에는 thoughtSignature 같은 이미지가 아닌 항목도 섞여 오므로 반드시 find 로 걸러야 한다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * 4K 고품질 생성은 30초를 넘기는 일이 흔하다.
 * 직접 끊지 않으면 호스팅 플랫폼이 함수를 죽이면서 원인을 알 수 없는 에러만 남는다.
 */
const REQUEST_TIMEOUT_MS = 280_000;

export type GeneratedImage = {
  mimeType: string;
  /** base64 (data: 접두사 없음) */
  data: string;
};

export type GenerateResult = {
  image: GeneratedImage;
  usage: {
    promptTokens: number;
    imageTokens: number;
    totalTokens: number;
  };
};

export type ReferenceImage = {
  mimeType: string;
  data: string;
};

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function generateImage(params: {
  model: string;
  prompt: string;
  references: ReferenceImage[];
  aspectRatio: string;
  imageSize: string;
  signal?: AbortSignal;
}): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";

  const parts: Record<string, unknown>[] = params.references.map((ref) => ({
    inlineData: { mimeType: ref.mimeType, data: ref.data },
  }));
  parts.push({ text: params.prompt });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${params.model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: params.aspectRatio,
            imageSize: params.imageSize,
          },
        },
      }),
      signal: params.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new GeminiError(
        "생성 시간이 너무 오래 걸려 중단했습니다. 해상도를 낮추거나 컷 수를 줄여서 다시 시도해 주세요.",
        504,
      );
    }
    throw new GeminiError("이미지 생성 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }

  const raw = await res.text();

  if (!res.ok) {
    throw new GeminiError(extractApiError(raw) ?? `이미지 생성 요청이 실패했습니다 (HTTP ${res.status})`, res.status);
  }

  let body: GeminiResponse;
  try {
    body = JSON.parse(raw) as GeminiResponse;
  } catch {
    throw new GeminiError("Gemini 응답을 해석하지 못했습니다.", 502);
  }

  const candidate = body.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);

  if (!imagePart?.inlineData) {
    // 안전 필터나 토큰 한도로 이미지 없이 끝나는 경우가 실제로 발생한다.
    const reason = candidate?.finishReason ?? body.promptFeedback?.blockReason ?? "UNKNOWN";
    throw new GeminiError(describeEmptyResult(reason), 422);
  }

  const details = body.usageMetadata?.candidatesTokensDetails ?? [];
  const imageTokens = details.find((d) => d.modality === "IMAGE")?.tokenCount ?? 0;

  return {
    image: {
      mimeType: imagePart.inlineData.mimeType || "image/jpeg",
      data: imagePart.inlineData.data,
    },
    usage: {
      promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
      imageTokens,
      totalTokens: body.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

function describeEmptyResult(reason: string): string {
  switch (reason) {
    case "SAFETY":
    case "PROHIBITED_CONTENT":
    case "IMAGE_SAFETY":
      return "안전 필터에 걸려 이미지가 생성되지 않았습니다. 상품 사진이나 추가 요청 문구를 조정해 주세요.";
    case "MAX_TOKENS":
      return "출력이 한도를 넘었습니다. 해상도를 낮춰서 다시 시도해 주세요.";
    case "RECITATION":
      return "저작권 보호 필터가 작동했습니다. 로고나 브랜드 요소가 포함된 사진인지 확인해 주세요.";
    default:
      return `이미지가 생성되지 않았습니다 (사유: ${reason}). 잠시 후 다시 시도해 주세요.`;
  }
}

function extractApiError(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: {
      parts?: { inlineData?: { mimeType: string; data: string } }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    totalTokenCount?: number;
    candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
};
