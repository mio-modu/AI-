import type { ModelSpec, ProviderId } from "./pricing";

/**
 * 제공사별 어댑터.
 *
 * 스트리밍 응답 형식이 3사 모두 다르다. 그래서 "요청 본문을 만드는 함수"와
 * "스트림 조각을 공통 이벤트로 바꾸는 함수"를 순수 함수로 떼어냈다.
 * 네트워크 없이 테스트할 수 있어야 요금 계산이 틀리지 않는다 —
 * 토큰 수를 잘못 읽으면 보드가 보여주는 금액 전체가 틀어진다.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Effort = "low" | "medium" | "high";

/** 3사 스트림을 하나로 normalize한 이벤트. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number };

// ---------------------------------------------------------------- SSE 파싱

/**
 * 바이트 조각을 SSE data 줄로 자른다.
 *
 * 청크 경계가 줄 중간에서 끊기는 일이 흔해서, 남은 꼬리를 버퍼에 들고 있어야 한다.
 * 이걸 빠뜨리면 긴 응답에서 가끔 JSON 파싱이 깨진다.
 */
export function createSseSplitter() {
  let buffer = "";
  return function push(chunk: string): string[] {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    return lines
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter((l) => l && l !== "[DONE]");
  };
}

// ---------------------------------------------------------------- OpenAI

export function buildOpenAiRequest(params: {
  model: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens: number;
  /** OpenAI 호환 서버 주소. 생략하면 OpenAI 공식. */
  baseUrl?: string;
}) {
  const messages: { role: string; content: string }[] = [];
  if (params.system?.trim()) messages.push({ role: "system", content: params.system });
  messages.push(...params.messages);

  return {
    // OpenAI 호환 엔드포인트(OpenRouter, 로컬 모델 등)로 돌릴 수 있게 베이스를 바꿀 수 있다.
    url: `${(params.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
    body: {
      model: params.model,
      messages,
      max_completion_tokens: params.maxTokens,
      stream: true,
      // 사용량을 받아야 비용을 계산할 수 있다. 이걸 켜지 않으면 토큰 수가 안 온다.
      stream_options: { include_usage: true },
    },
  };
}

export function mapOpenAiEvent(json: Record<string, any>): StreamEvent[] {
  const out: StreamEvent[] = [];
  const text = json?.choices?.[0]?.delta?.content;
  if (typeof text === "string" && text) out.push({ type: "delta", text });
  if (json?.usage) {
    out.push({
      type: "usage",
      inputTokens: json.usage.prompt_tokens ?? 0,
      outputTokens: json.usage.completion_tokens ?? 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Gemini

export function buildGeminiRequest(params: {
  model: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens: number;
}) {
  return {
    // alt=sse 를 붙여야 줄 단위 스트림으로 온다. 빼면 JSON 배열이 통째로 온다.
    url: `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse`,
    body: {
      contents: params.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      ...(params.system?.trim()
        ? { systemInstruction: { parts: [{ text: params.system }] } }
        : {}),
      generationConfig: { maxOutputTokens: params.maxTokens },
    },
  };
}

export function mapGeminiEvent(json: Record<string, any>): StreamEvent[] {
  const out: StreamEvent[] = [];
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (typeof p?.text === "string" && p.text) out.push({ type: "delta", text: p.text });
  }
  const u = json?.usageMetadata;
  if (u) {
    // 사고 토큰도 출력으로 과금된다. candidatesTokenCount에 포함되지 않는 경우가 있어 따로 더한다.
    const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    out.push({ type: "usage", inputTokens: u.promptTokenCount ?? 0, outputTokens: output });
  }
  return out;
}

// ---------------------------------------------------------------- Anthropic

/** Anthropic SDK 스트림 이벤트를 공통 이벤트로 바꾼다. */
export function mapAnthropicEvent(event: Record<string, any>): StreamEvent[] {
  const out: StreamEvent[] = [];

  if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
    const text = event.delta.text;
    if (typeof text === "string" && text) out.push({ type: "delta", text });
  }

  // 입력 토큰은 message_start, 출력 토큰은 message_delta에서 온다.
  if (event?.type === "message_start" && event.message?.usage) {
    const u = event.message.usage;
    out.push({
      type: "usage",
      // 캐시 토큰도 과금 대상이라 입력에 합산한다.
      inputTokens:
        (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
    });
  }
  if (event?.type === "message_delta" && event.usage) {
    out.push({
      type: "usage",
      inputTokens: event.usage.input_tokens ?? 0,
      outputTokens: event.usage.output_tokens ?? 0,
    });
  }

  return out;
}

/**
 * 사용량 이벤트를 합친다.
 *
 * 제공사마다 사용량을 여러 번 나눠 보내고, 어떤 건 누적값 어떤 건 증분이다.
 * 가장 큰 값을 취하면 두 경우 모두에서 최종 사용량이 된다.
 */
export function mergeUsage(
  acc: { inputTokens: number; outputTokens: number },
  next: { inputTokens: number; outputTokens: number },
) {
  return {
    inputTokens: Math.max(acc.inputTokens, next.inputTokens),
    outputTokens: Math.max(acc.outputTokens, next.outputTokens),
  };
}

export function mapEventFor(provider: ProviderId) {
  switch (provider) {
    case "openai": return mapOpenAiEvent;
    case "gemini": return mapGeminiEvent;
    case "anthropic": return mapAnthropicEvent;
  }
}

export function supportsEffort(model: ModelSpec): boolean {
  return model.provider === "anthropic";
}
