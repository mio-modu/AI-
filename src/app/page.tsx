"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import VoucherCard, { type Row } from "@/components/VoucherCard";
import type { Voucher } from "@/lib/schema";
import { validateVoucher, VERDICT_LABEL } from "@/lib/validate";
import { vouchersToCsv } from "@/lib/csv";

const MAX_FILES = 20;
const MAX_BYTES = 10 * 1024 * 1024;

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tier, setTier] = useState<"fast" | "accurate">("fast");
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => {
    const done = rows.filter((r) => r.status === "done");
    return {
      total: rows.length,
      auto: done.filter((r) => r.verdict === "auto").length,
      review: done.filter((r) => r.verdict === "review").length,
      reject: done.filter((r) => r.verdict === "reject").length,
      failed: rows.filter((r) => r.status === "error").length,
    };
  }, [rows]);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setNotice(null);

    const room = MAX_FILES - rows.length;
    if (room <= 0) {
      setNotice(`한 번에 최대 ${MAX_FILES}건까지 처리합니다.`);
      return;
    }

    const next: Row[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        setNotice(`${file.name} — 이미지 또는 PDF만 올릴 수 있습니다.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setNotice(`${file.name} — 10MB를 넘어 제외했습니다.`);
        continue;
      }
      const dataUrl = await readDataUrl(file);
      next.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        previewUrl: dataUrl,
        status: "pending",
      });
    }
    if (next.length) setRows((prev) => [...prev, ...next]);
  }, [rows.length]);

  async function runAll() {
    const targets = rows.filter((r) => r.status === "pending" || r.status === "error");
    if (!targets.length) return;
    setRunning(true);

    // 전표는 서로 독립이지만 한꺼번에 던지면 한도에 걸린다. 3건씩 끊어서 보낸다.
    const CONCURRENCY = 3;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      setRows((prev) =>
        prev.map((r) => (batch.some((b) => b.id === r.id) ? { ...r, status: "working" } : r)),
      );
      await Promise.all(batch.map((r) => runOne(r)));
    }
    setRunning(false);
  }

  async function runOne(row: Row) {
    const comma = row.previewUrl.indexOf(",");
    const mimeType = row.previewUrl.slice(5, row.previewUrl.indexOf(";"));
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType, data: row.previewUrl.slice(comma + 1), tier }),
      });
      const body = await res.json();
      if (!res.ok) {
        patch(row.id, { status: "error", error: body?.error ?? "판독에 실패했습니다." });
        return;
      }
      patch(row.id, {
        status: "done",
        voucher: body.voucher,
        verdict: body.validation?.verdict,
        verdictLabel: body.validation?.verdictLabel,
        findings: body.validation?.findings ?? [],
        error: undefined,
      });
    } catch {
      patch(row.id, { status: "error", error: "네트워크 오류가 발생했습니다." });
    }
  }

  const patch = (id: string, p: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  /** 담당자가 값을 고치면 즉시 다시 검증한다 — 고쳤는데 판정이 그대로면 믿을 수 없다. */
  function handleEdit(id: string, voucher: Voucher) {
    const result = validateVoucher(voucher);
    patch(id, {
      voucher,
      verdict: result.verdict,
      verdictLabel: VERDICT_LABEL[result.verdict],
      findings: result.findings,
    });
  }

  function downloadCsv() {
    const done = rows.filter((r) => r.status === "done" && r.voucher);
    if (!done.length) return;
    const csv = vouchersToCsv(
      done.map((r) => ({ voucher: r.voucher!, verdictLabel: r.verdictLabel ?? "" })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `전표_${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pending = rows.some((r) => r.status === "pending" || r.status === "error");
  const anyDone = rows.some((r) => r.status === "done");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[25px]">전표리더</h1>
        <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--ink-soft)" }}>
          세금계산서 · 거래명세서 · 발주서를 읽어 ERP 입력용 데이터로 바꿉니다. 사업자번호 검증번호와
          금액 정합성을 기계가 대조해, <strong>사람이 봐야 할 건만 골라냅니다.</strong>
        </p>
      </header>

      <section
        className="card p-4"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
      >
        <div
          className="rounded-lg border border-dashed px-4 py-7 text-center transition-colors"
          style={{
            borderColor: dragging ? "var(--brand)" : "var(--line)",
            background: dragging ? "var(--brand-soft)" : "transparent",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
            전표 파일(이미지 · PDF)을 끌어다 놓거나
          </p>
          <button type="button" className="btn mt-2" onClick={() => inputRef.current?.click()}>
            파일 선택
          </button>
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            한 번에 최대 {MAX_FILES}건 · 건당 10MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {notice ? (
          <p className="mt-2 text-[12px]" style={{ color: "var(--warn)" }}>{notice}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--line)" }}>
            {([
              ["fast", "빠름", "대량 처리 · 저단가"],
              ["accurate", "정밀", "흐린 스캔 · 복잡한 표"],
            ] as const).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTier(id)}
                className="px-3 py-1.5 text-left text-[12px]"
                style={{
                  background: tier === id ? "var(--brand-soft)" : "transparent",
                  color: tier === id ? "var(--brand)" : "var(--ink-soft)",
                  fontWeight: tier === id ? 700 : 500,
                }}
                title={hint}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="button" className="btn" disabled={!pending || running} onClick={() => void runAll()}>
            {running ? "판독 중…" : `판독 시작${pending ? ` (${rows.filter((r) => r.status !== "done").length}건)` : ""}`}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!anyDone} onClick={downloadCsv}>
            CSV 내보내기
          </button>
          {rows.length ? (
            <button type="button" className="btn btn-ghost" onClick={() => setRows([])} disabled={running}>
              전체 비우기
            </button>
          ) : null}
        </div>

        {summary.total > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            <span className="badge badge-auto">자동 승인 {summary.auto}</span>
            <span className="badge badge-review">확인 권장 {summary.review}</span>
            <span className="badge badge-reject">검토 필요 {summary.reject}</span>
            {summary.failed ? <span className="badge badge-reject">판독 실패 {summary.failed}</span> : null}
          </div>
        ) : null}
      </section>

      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => (
          <VoucherCard key={row.id} row={row} onChange={handleEdit} />
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-[13px]" style={{ color: "var(--ink-soft)" }}>
          전표를 올리면 여기에 판독 결과가 쌓입니다.
        </p>
      ) : null}
    </main>
  );
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
