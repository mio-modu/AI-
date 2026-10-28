import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { findModel, PROVIDER_ENV } from "@/lib/pricing";
import {
  buildGeminiRequest, buildOpenAiRequest, createSseSplitter,
  mapAnthropicEvent, mapEventFor, mergeUsage,
  type ChatMessage, type Effort, type StreamEvent,
} from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 채팅 스트리밍 프록시.
 *
 * 브라우저에는 키를 절대 내리지 않는다. 3사 응답을 NDJSON 한 줄씩으로 normalize해서
 * 클라이언트는 제공사를 신경 쓰지 않고 같은 코드로 읽는다.
 *   {"t":"d","x":"..."}  본문 조각
 *   {"t":"u","i":N,"o":M} 사용량
 *   {"t":"e","m":"..."}   오류
 */

export async function POST(req: NextRequest) {
  let payload: {
    modelId?: string;
    messages?: ChatMessage[];
    system?: string;
    effort?: Effort;
    maxTokens?: number;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const model = findModel(String(payload.modelId ?? ""));
  if (!model) return json({ error: "알 수 없는 모델입니다." }, 400);

  const messages = (payload.messages ?? []).filter(
    (m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string",
  );
  if (messages.length === 0) return json({ error: "보낼 메시지가 없습니다." }, 400);

  const apiKey = process.env[PROVIDER_ENV[model.provider]];
  if (!apiKey) {
    return json(
      { error: `${PROVIDER_ENV[model.provider]}가 설정되지 않았습니다. .env.local을 확인해 주세요.` },
      400,
    );
  }

  const maxTokens = clamp(Number(payload.maxTokens) || 8192, 256, 32000);
  const effort: Effort =
    payload.effort === "low" || payload.effort === "high" ? payload.effort : "medium";
  const system = typeof payload.system === "string" ? payload.system : "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let usage = { inputTokens: 0, outputTokens: 0 };
      const onEvent = (e: StreamEvent) => {
        if (e.type === "delta") send({ t: "d", x: e.text });
        else usage = mergeUsage(usage, e);
      };

      try {
        if (model.provider === "anthropic") {
          await runAnthropic({ apiKey, model: model.id, messages, system, effort, maxTokens }, onEvent);
        } else {
          await runSse({ provider: model.provider, apiKey, model: model.id, messages, system, maxTokens }, onEvent);
        }
        send({ t: "u", i: usage.inputTokens, o: usage.outputTokens });
      } catch (err) {
        send({ t: "e", m: err instanceof Error ? err.message : "요청 중 오류가 발생했습니다." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // 중간 프록시가 스트림을 모아두면 실시간으로 안 보인다.
      "X-Accel-Buffering": "no",
    },
  });
}

async function runAnthropic(
  p: { apiKey: string; model: string; messages: ChatMessage[]; system: string; effort: Effort; maxTokens: number },
  onEvent: (e: StreamEvent) => void,
) {
  const client = new Anthropic({ apiKey: p.apiKey });

  // Opus 5.5 / Sonnet 5.5는 사고가 항상 켜져 있다. thinking을 명시하면 400이 나므로 생략하고,
  // 깊이는 effort로만 조절한다. temperature도 현재 API 버전에서는 400이라 보내지 않는다.
  const stream = client.messages.stream({
    model: p.model,
    max_tokens: p.maxTokens,
    output_config: { effort: p.effort },
    ...(p.system.trim() ? { system: p.system } : {}),
    messages: p.messages.map((m) => ({ role: m.role, content: m.content })),
  } as Anthropic.MessageStreamParams);

  for await (const event of stream) {
    for (const e of mapAnthropicEvent(event as unknown as Record<string, unknown>)) onEvent(e);
  }
}

async function runSse(
  p: { provider: "openai" | "gemini"; apiKey: string; model: string; messages: ChatMessage[]; system: string; maxTokens: number },
  onEvent: (e: StreamEvent) => void,
) {
  const built =
    p.provider === "openai"
      ? buildOpenAiRequest({
          model: p.model, messages: p.messages, system: p.system,
          maxTokens: p.maxTokens, baseUrl: process.env.OPENAI_BASE_URL,
        })
      : buildGeminiRequest({ model: p.model, messages: p.messages, system: p.system, maxTokens: p.maxTokens });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.provider === "openai") headers.Authorization = `Bearer ${p.apiKey}`;
  else headers["x-goog-api-key"] = p.apiKey;

  let res: Response;
  try {
    res = await fetch(built.url, {
      method: "POST",
      headers,
      body: JSON.stringify(built.body),
      signal: AbortSignal.timeout(280_000),
    });
  } catch (err) {
    // "fetch failed"만 보여주면 원인을 알 수 없다. undici는 실제 사유를 cause에 넣는다.
    const e = err as Error & { cause?: { code?: string; message?: string } };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      throw new Error("응답이 너무 오래 걸려 중단했습니다.");
    }
    const code = e?.cause?.code;
    const detail = code ?? e?.cause?.message ?? e?.message ?? "알 수 없음";
    throw new Error(`${new URL(built.url).host}에 연결하지 못했습니다 (${detail}).`);
  }

  if (!res.ok || !res.body) {
    throw new Error(await describeHttpError(res));
  }

  const split = createSseSplitter();
  const mapEvent = mapEventFor(p.provider);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of split(decoder.decode(value, { stream: true }))) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue; // 깨진 줄 하나 때문에 대화 전체를 끊지 않는다.
      }
      for (const e of mapEvent(parsed)) onEvent(e);
    }
  }
}

async function describeHttpError(res: Response): Promise<string> {
  let message: string | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    message = typeof body.error === "string" ? body.error : body.error?.message;
  } catch {
    /* 본문이 JSON이 아니면 상태 코드로만 안내한다. */
  }

  if (res.status === 401 || res.status === 403) return "API 키가 올바르지 않거나 권한이 없습니다.";
  if (res.status === 402) return "API 크레딧이 소진되었습니다. 제공사 콘솔에서 결제 정보를 확인해 주세요.";
  if (res.status === 429) return "요청이 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.";
  if (res.status === 404) return `모델을 찾을 수 없습니다. 모델 ID를 확인해 주세요. (${message ?? res.status})`;
  return message ?? `요청이 실패했습니다 (HTTP ${res.status}).`;
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}
