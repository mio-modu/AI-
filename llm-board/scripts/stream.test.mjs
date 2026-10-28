import {
  createSseSplitter, mapOpenAiEvent, mapGeminiEvent, mapAnthropicEvent,
  mergeUsage, buildOpenAiRequest, buildGeminiRequest,
} from "../.t/providers.js";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log(`  X ${label}${detail ? "\n      " + detail : ""}`); }
};
const J = JSON.stringify;

console.log("\n[1] SSE 분할 — 청크가 줄 중간에서 끊겨도 복구해야 한다");
{
  const s = createSseSplitter();
  ok("한 줄", J(s('data: {"a":1}\n')) === J(['{"a":1}']));
  // 줄 중간에서 끊긴 경우: 앞 조각은 아무것도 내보내지 않고, 이어붙인 뒤 한 번에 나와야 한다
  const s2 = createSseSplitter();
  ok("끊긴 앞조각은 보류", J(s2('data: {"he')) === J([]));
  ok("이어서 완성", J(s2('llo":true}\n')) === J(['{"hello":true}']));
  const s3 = createSseSplitter();
  ok("[DONE] 제외", J(s3("data: [DONE]\n")) === J([]));
  ok("빈 줄·주석 무시", J(createSseSplitter()("\n: ping\n")) === J([]));
  const s4 = createSseSplitter();
  ok("여러 줄 한 번에", J(s4('data: {"a":1}\ndata: {"b":2}\n')) === J(['{"a":1}', '{"b":2}']));
}

console.log("\n[2] OpenAI 스트림 매핑");
{
  const delta = { choices: [{ delta: { content: "안녕" } }] };
  ok("텍스트 조각", J(mapOpenAiEvent(delta)) === J([{ type: "delta", text: "안녕" }]));
  ok("빈 delta는 무시", J(mapOpenAiEvent({ choices: [{ delta: {} }] })) === J([]));
  ok("역할 전용 첫 청크 무시", J(mapOpenAiEvent({ choices: [{ delta: { role: "assistant" } }] })) === J([]));
  const usage = { choices: [], usage: { prompt_tokens: 3000, completion_tokens: 800 } };
  ok("사용량", J(mapOpenAiEvent(usage)) === J([{ type: "usage", inputTokens: 3000, outputTokens: 800 }]));
}

console.log("\n[3] Gemini 스트림 매핑");
{
  const d = { candidates: [{ content: { parts: [{ text: "반갑" }] } }] };
  ok("텍스트 조각", J(mapGeminiEvent(d)) === J([{ type: "delta", text: "반갑" }]));
  const multi = { candidates: [{ content: { parts: [{ text: "가" }, { text: "나" }] } }] };
  ok("parts 여러 개", J(mapGeminiEvent(multi)) === J([
    { type: "delta", text: "가" }, { type: "delta", text: "나" }]));
  // 사고 토큰은 출력으로 과금된다 — 빠뜨리면 금액이 과소 집계된다
  const u = { usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 800, thoughtsTokenCount: 1200 } };
  ok("사고 토큰을 출력에 합산",
    J(mapGeminiEvent(u)) === J([{ type: "usage", inputTokens: 3000, outputTokens: 2000 }]),
    J(mapGeminiEvent(u)));
  const u2 = { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } };
  ok("사고 토큰 없어도 동작", J(mapGeminiEvent(u2)) === J([{ type: "usage", inputTokens: 100, outputTokens: 50 }]));
  ok("빈 객체 안전", J(mapGeminiEvent({})) === J([]));
}

console.log("\n[4] Anthropic 스트림 매핑");
{
  const d = { type: "content_block_delta", delta: { type: "text_delta", text: "네" } };
  ok("텍스트 조각", J(mapAnthropicEvent(d)) === J([{ type: "delta", text: "네" }]));
  // thinking_delta는 화면에 흘리지 않는다
  const think = { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "속으로" } };
  ok("thinking_delta는 흘리지 않음", J(mapAnthropicEvent(think)) === J([]));
  // 캐시 토큰도 과금 대상이므로 입력에 합산
  const start = {
    type: "message_start",
    message: { usage: { input_tokens: 1000, cache_creation_input_tokens: 500, cache_read_input_tokens: 2000, output_tokens: 1 } },
  };
  ok("캐시 토큰을 입력에 합산",
    J(mapAnthropicEvent(start)) === J([{ type: "usage", inputTokens: 3500, outputTokens: 1 }]),
    J(mapAnthropicEvent(start)));
  const end = { type: "message_delta", usage: { input_tokens: 3500, output_tokens: 820 } };
  ok("최종 출력 토큰", J(mapAnthropicEvent(end)) === J([{ type: "usage", inputTokens: 3500, outputTokens: 820 }]));
  ok("모르는 이벤트 안전", J(mapAnthropicEvent({ type: "ping" })) === J([]));
}

console.log("\n[5] 사용량 병합 — 나눠 오는 값을 최종값으로");
{
  let acc = { inputTokens: 0, outputTokens: 0 };
  acc = mergeUsage(acc, { inputTokens: 3500, outputTokens: 1 });   // message_start
  acc = mergeUsage(acc, { inputTokens: 3500, outputTokens: 820 }); // message_delta
  ok("최종 3500/820", J(acc) === J({ inputTokens: 3500, outputTokens: 820 }));
  // 뒤늦게 작은 값이 와도 깎이면 안 된다
  acc = mergeUsage(acc, { inputTokens: 0, outputTokens: 0 });
  ok("작은 값에 깎이지 않음", J(acc) === J({ inputTokens: 3500, outputTokens: 820 }));
}

console.log("\n[6] 요청 본문 — 비용에 직결되는 필드");
{
  const msgs = [{ role: "user", content: "안녕" }];
  const o = buildOpenAiRequest({ model: "gpt-6.1-sol", messages: msgs, system: "너는 비서다", maxTokens: 4096 });
  ok("OpenAI 스트리밍", o.body.stream === true);
  ok("OpenAI 사용량 수신 옵션", o.body.stream_options?.include_usage === true);
  ok("OpenAI system 선두 배치", o.body.messages[0].role === "system");
  ok("OpenAI temperature 미전송", !("temperature" in o.body));
  const o2 = buildOpenAiRequest({ model: "x", messages: msgs, maxTokens: 10 });
  ok("OpenAI system 없으면 미포함", o2.body.messages.length === 1);

  const ob = buildOpenAiRequest({ model: "x", messages: msgs, maxTokens: 10, baseUrl: "http://127.0.0.1:9911/v1" });
  ok("OpenAI baseUrl 치환", ob.url === "http://127.0.0.1:9911/v1/chat/completions", ob.url);
  const ob2 = buildOpenAiRequest({ model: "x", messages: msgs, maxTokens: 10, baseUrl: "http://127.0.0.1:9911/v1/" });
  ok("OpenAI baseUrl 끝 슬래시 정리", ob2.url === "http://127.0.0.1:9911/v1/chat/completions", ob2.url);
  ok("OpenAI 기본은 공식 주소",
    buildOpenAiRequest({ model: "x", messages: msgs, maxTokens: 10 }).url === "https://api.openai.com/v1/chat/completions");

  const g = buildGeminiRequest({ model: "gemini-3.6-flash", messages: [
    { role: "user", content: "안녕" }, { role: "assistant", content: "네" }], system: "비서", maxTokens: 4096 });
  ok("Gemini alt=sse", g.url.includes("alt=sse"));
  ok("Gemini streamGenerateContent", g.url.includes(":streamGenerateContent"));
  ok("Gemini assistant→model 변환", g.body.contents[1].role === "model");
  ok("Gemini systemInstruction", !!g.body.systemInstruction);
}

console.log(`\n${"=".repeat(44)}\n통과 ${pass} / 실패 ${fail}\n${"=".repeat(44)}`);
process.exit(fail === 0 ? 0 : 1);
