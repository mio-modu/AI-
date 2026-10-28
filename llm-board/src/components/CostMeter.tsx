"use client";

import { formatKrw, PRICING_LAST_VERIFIED } from "@/lib/pricing";

/**
 * 비용 계기판.
 *
 * 이 보드를 쓰는 이유가 "구독보다 싼가"이므로, 그 답을 맨 위에 숫자로 둔다.
 */
export default function CostMeter({
  monthKrw,
  calls,
  subscriptionKrw,
  onChangeSubscription,
}: {
  monthKrw: number;
  calls: number;
  subscriptionKrw: number;
  onChangeSubscription: (v: number) => void;
}) {
  const saved = subscriptionKrw - monthKrw;
  const ratio = subscriptionKrw > 0 ? Math.min(100, (monthKrw / subscriptionKrw) * 100) : 0;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            이번 달 사용액
          </div>
          <div className="num text-[26px] font-extrabold leading-tight">{formatKrw(monthKrw)}</div>
          <div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            {calls.toLocaleString("ko-KR")}회 호출
          </div>
        </div>

        <div className="flex-1 min-w-[200px]">
          <div className="mb-1.5 flex items-center justify-between text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            <span>구독 대비</span>
            <span className="num font-bold" style={{ color: saved >= 0 ? "var(--ok)" : "var(--warn)" }}>
              {saved >= 0 ? `${formatKrw(saved)} 절약` : `${formatKrw(-saved)} 초과`}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${ratio}%`, background: saved >= 0 ? "var(--ok)" : "var(--warn)" }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            <span>월 구독료</span>
            <input
              className="sel num w-24 px-2 py-0.5 text-[11.5px]"
              inputMode="numeric"
              value={subscriptionKrw}
              onChange={(e) => onChangeSubscription(Number(e.target.value.replace(/\D/g, "")) || 0)}
            />
            <span>원 기준</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--ink-soft)" }}>
        토큰 수는 각 API가 돌려준 실제 값입니다. 금액은 요금표(확인일 {PRICING_LAST_VERIFIED}) 기준으로
        환산한 값이라, 요금이 바뀌었다면 <code>src/lib/pricing.ts</code>를 고치면 과거 기록까지 다시 계산됩니다.
      </p>
    </section>
  );
}
