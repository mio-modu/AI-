"use client";

import type { Voucher } from "@/lib/schema";
import type { Finding, Verdict } from "@/lib/validate";

export type Row = {
  id: string;
  fileName: string;
  previewUrl: string;
  status: "pending" | "working" | "done" | "error";
  error?: string;
  voucher?: Voucher;
  verdict?: Verdict;
  verdictLabel?: string;
  findings?: Finding[];
};

/**
 * 전표 한 건. 판정 배지 → 지적사항 → 교정 폼 순으로 쌓는다.
 * 담당자가 제일 먼저 알아야 할 것은 "이 건을 내가 봐야 하는가"이므로 그것이 맨 위다.
 */
export default function VoucherCard({
  row,
  onChange,
}: {
  row: Row;
  onChange: (id: string, v: Voucher) => void;
}) {
  const v = row.voucher;
  const bad = (field: string) =>
    row.findings?.some((f) => f.field === field && f.severity === "error") ?? false;

  const set = (patch: Partial<Voucher>) => v && onChange(row.id, { ...v, ...patch });
  const setParty = (key: "supplier" | "buyer", patch: Record<string, string>) =>
    v && onChange(row.id, { ...v, [key]: { ...v[key], ...patch } });

  return (
    <article className="card overflow-hidden">
      <header
        className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5"
        style={{ borderColor: "var(--line)" }}
      >
        <span className="truncate text-[13px] font-semibold">{row.fileName}</span>
        <span className="ml-auto flex items-center gap-2">
          {row.status === "working" ? (
            <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
              판독 중…
            </span>
          ) : null}
          {row.verdict ? (
            <span className={`badge badge-${row.verdict}`}>{row.verdictLabel}</span>
          ) : null}
        </span>
      </header>

      {row.status === "error" ? (
        <p className="px-4 py-3 text-[12.5px]" style={{ color: "var(--bad)" }}>
          {row.error}
        </p>
      ) : null}

      {row.findings?.length ? (
        <ul className="flex flex-col gap-1 px-4 py-3">
          {row.findings.map((f, i) => (
            <li
              key={i}
              className="rounded-md px-2.5 py-1.5 text-[12px] leading-snug"
              style={{
                background: f.severity === "error" ? "var(--bad-soft)" : "var(--warn-soft)",
                color: f.severity === "error" ? "var(--bad)" : "var(--warn)",
              }}
            >
              {f.message}
            </li>
          ))}
        </ul>
      ) : null}

      {v ? (
        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          {/* 원본 — 담당자가 숫자를 눈으로 대조해야 하므로 항상 옆에 둔다. */}
          <a href={row.previewUrl} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.previewUrl}
              alt={`${row.fileName} 원본`}
              className="w-full rounded-lg border object-contain"
              style={{ borderColor: "var(--line)", maxHeight: 420 }}
            />
          </a>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="문서종류" value={v.docType} onChange={(x) => set({ docType: x as Voucher["docType"] })} />
              <Field label="작성일자" value={v.issueDate} bad={bad("issueDate")} onChange={(x) => set({ issueDate: x })} />
            </div>

            <PartyBlock
              title="공급자"
              regNo={v.supplier?.regNo ?? ""}
              name={v.supplier?.name ?? ""}
              ceo={v.supplier?.ceo ?? ""}
              badReg={bad("supplier.regNo")}
              onChange={(p) => setParty("supplier", p)}
            />
            <PartyBlock
              title="공급받는자"
              regNo={v.buyer?.regNo ?? ""}
              name={v.buyer?.name ?? ""}
              ceo={v.buyer?.ceo ?? ""}
              badReg={bad("buyer.regNo")}
              onChange={(p) => setParty("buyer", p)}
            />

            <div className="grid grid-cols-3 gap-2.5">
              <Field label="공급가액" value={v.supplyAmount} numeric bad={bad("supplyAmount")} onChange={(x) => set({ supplyAmount: Number(x) || 0 })} />
              <Field label="세액" value={v.taxAmount} numeric bad={bad("taxAmount")} onChange={(x) => set({ taxAmount: Number(x) || 0 })} />
              <Field label="합계금액" value={v.totalAmount} numeric bad={bad("totalAmount")} onChange={(x) => set({ totalAmount: Number(x) || 0 })} />
            </div>

            {v.items?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ color: "var(--ink-soft)" }}>
                      <th className="px-1.5 py-1 text-left font-semibold">품목</th>
                      <th className="px-1.5 py-1 text-right font-semibold">수량</th>
                      <th className="px-1.5 py-1 text-right font-semibold">단가</th>
                      <th className="px-1.5 py-1 text-right font-semibold">공급가액</th>
                      <th className="px-1.5 py-1 text-right font-semibold">세액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.items.map((it, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                        <td className="px-1.5 py-1">{it.name}</td>
                        <td className="num px-1.5 py-1">{it.qty ?? ""}</td>
                        <td className="num px-1.5 py-1">{fmt(it.unitPrice)}</td>
                        <td className="num px-1.5 py-1">{fmt(it.supplyAmount)}</td>
                        <td className="num px-1.5 py-1">{fmt(it.taxAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function PartyBlock({
  title, regNo, name, ceo, badReg, onChange,
}: {
  title: string; regNo: string; name: string; ceo: string;
  badReg: boolean; onChange: (p: Record<string, string>) => void;
}) {
  return (
    <div>
      <div className="lbl">{title}</div>
      <div className="grid grid-cols-3 gap-2.5">
        <Field label="사업자번호" value={regNo} bad={badReg} onChange={(x) => onChange({ regNo: x })} />
        <Field label="상호" value={name} onChange={(x) => onChange({ name: x })} />
        <Field label="대표자" value={ceo} onChange={(x) => onChange({ ceo: x })} />
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, bad, numeric,
}: {
  label: string; value: string | number | undefined;
  onChange: (v: string) => void; bad?: boolean; numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <input
        className={`fld${numeric ? " num" : ""}`}
        data-bad={bad ? "true" : "false"}
        value={value ?? ""}
        inputMode={numeric ? "numeric" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function fmt(n: number | undefined): string {
  return typeof n === "number" ? n.toLocaleString("ko-KR") : "";
}
