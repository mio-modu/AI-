"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CostMeter from "@/components/CostMeter";
import {
  DEFAULT_MODEL_ID, DEFAULT_USD_KRW, findModel, formatKrw,
  MODELS, PROVIDER_LABEL, costKrw,
} from "@/lib/pricing";
import type { Effort } from "@/lib/providers";
import { appendUsage, clearUsage, loadUsage, monthlyTotals, type UsageEntry } from "@/lib/usage";

type Turn = {
  role: "user" | "assistant";
  content: string;
  modelId?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
};

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [system, setSystem] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [effort, setEffort] = useState<Effort>("medium");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [subscriptionKrw, setSubscriptionKrw] = useState(150000);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setEntries(loadUsage());
    const saved = Number(localStorage.getItem("llm-board.sub") ?? "");
    if (saved > 0) setSubscriptionKrw(saved);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const model = findModel(modelId) ?? MODELS[0];
  const month = useMemo(() => monthlyTotals(entries, DEFAULT_USD_KRW), [entries]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns([...history, { role: "assistant", content: "", modelId }]);
    setInput("");
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          effort,
          system,
          messages: history.map((t) => ({ role: t.role, content: t.content })),
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        patchLast({ error: body?.error ?? `요청이 실패했습니다 (HTTP ${res.status}).` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { t: string; x?: string; i?: number; o?: number; m?: string };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.t === "d" && ev.x) {
            acc += ev.x;
            patchLast({ content: acc });
          } else if (ev.t === "u") {
            const usage = { inputTokens: ev.i ?? 0, outputTokens: ev.o ?? 0 };
            patchLast({ usage });
            setEntries(appendUsage({ at: Date.now(), modelId, ...usage }));
          } else if (ev.t === "e") {
            patchLast({ error: ev.m });
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        patchLast({ error: "네트워크 오류가 발생했습니다." });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const patchLast = (p: Partial<Turn>) =>
    setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, ...p } : t)));

  function setSub(v: number) {
    setSubscriptionKrw(v);
    try {
      localStorage.setItem("llm-board.sub", String(v));
    } catch {
      /* 저장 실패는 무시 */
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-[21px] font-extrabold tracking-tight">LLM 보드</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-soft)" }}>
          구독 대신 API로 직접. 메시지마다 드는 비용이 원화로 바로 보입니다.
        </p>
      </header>

      <CostMeter
        monthKrw={month.krw}
        calls={month.calls}
        subscriptionKrw={subscriptionKrw}
        onChangeSubscription={setSub}
      />

      <section className="card flex flex-wrap items-center gap-2 p-3">
        <select className="sel" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {PROVIDER_LABEL[m.provider]} · {m.label} (입력 ${m.inputPerM} / 출력 ${m.outputPerM})
            </option>
          ))}
        </select>

        {model.provider === "anthropic" ? (
          <select className="sel" value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
            <option value="low">사고 얕게 (저렴)</option>
            <option value="medium">사고 보통</option>
            <option value="high">사고 깊게</option>
          </select>
        ) : null}

        <span className={`chip ${model.confidence === "verified" ? "chip-ok" : "chip-warn"}`}>
          {model.confidence === "verified" ? "요금 확인됨" : "요금 미확인"}
        </span>

        <span className="ml-auto flex gap-2">
          {turns.length ? (
            <button className="btn btn-ghost" onClick={() => setTurns([])} disabled={busy}>
              대화 비우기
            </button>
          ) : null}
          <button
            className="btn btn-ghost"
            onClick={() => {
              clearUsage();
              setEntries([]);
            }}
          >
            사용 기록 초기화
          </button>
        </span>

        {model.note ? (
          <p className="w-full text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            {model.note}
          </p>
        ) : null}
      </section>

      <details className="card px-3.5 py-2.5">
        <summary className="cursor-pointer text-[12.5px] font-semibold">시스템 프롬프트</summary>
        <textarea
          className="sel mt-2 w-full resize-y"
          rows={3}
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          placeholder="예: 한국어로 간결하게 답한다."
        />
      </details>

      <section className="flex flex-1 flex-col gap-3">
        {turns.length === 0 ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "var(--ink-soft)" }}>
            메시지를 보내면 여기에 대화가 쌓입니다.
          </p>
        ) : null}

        {turns.map((t, i) => (
          <article key={i} className={t.role === "user" ? "self-end max-w-[85%]" : "max-w-[92%]"}>
            <div className={`bubble ${t.role === "user" ? "bubble-user" : "bubble-ai"}`}>
              {t.content || (t.error ? "" : busy && i === turns.length - 1 ? "…" : "")}
              {t.error ? (
                <span style={{ color: "var(--warn)" }}>{t.error}</span>
              ) : null}
            </div>
            {t.usage ? (
              <div className="mt-1 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                입력 {t.usage.inputTokens.toLocaleString("ko-KR")} · 출력{" "}
                {t.usage.outputTokens.toLocaleString("ko-KR")} 토큰 ·{" "}
                <strong>
                  {formatKrw(
                    costKrw(t.usage, findModel(t.modelId ?? "") ?? model, DEFAULT_USD_KRW),
                  )}
                </strong>
              </div>
            ) : null}
          </article>
        ))}
        <div ref={bottomRef} />
      </section>

      <section className="card sticky bottom-3 flex gap-2 p-3">
        <textarea
          className="sel flex-1 resize-none"
          rows={2}
          value={input}
          placeholder="메시지를 입력하세요. (Ctrl+Enter 전송)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {busy ? (
          <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
            중단
          </button>
        ) : (
          <button className="btn" onClick={() => void send()} disabled={!input.trim()}>
            보내기
          </button>
        )}
      </section>
    </main>
  );
}
