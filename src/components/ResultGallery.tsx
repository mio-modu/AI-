"use client";

export type ResultImage = { dataUrl: string; tokens: number };

export type ResultMeta = {
  modelLabel: string;
  aspectRatio: string;
  imageSize: string;
  succeeded: number;
  requested: number;
  failures: string[];
};

export default function ResultGallery({
  images,
  meta,
  prompt,
  loading,
  variations,
  aspectRatio,
}: {
  images: ResultImage[];
  meta: ResultMeta | null;
  prompt: string | null;
  loading: boolean;
  variations: number;
  aspectRatio: string;
}) {
  if (loading) {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: variations > 1 ? "1fr 1fr" : "1fr" }}>
        {Array.from({ length: variations }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border"
            style={{
              borderColor: "var(--line)",
              background: "var(--brand-soft)",
              aspectRatio: aspectRatio.replace(":", " / "),
            }}
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center"
        style={{ borderColor: "var(--line)" }}
      >
        <p className="text-[14px] font-semibold">아직 생성된 착용컷이 없습니다</p>
        <p className="mt-1.5 max-w-xs text-[12.5px]" style={{ color: "var(--ink-soft)" }}>
          왼쪽에서 상품 사진을 올리고 모델 · 배경 · 포즈를 고른 뒤 생성 버튼을 눌러주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {meta ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          <span>{meta.modelLabel}</span>
          <span>·</span>
          <span>
            {meta.aspectRatio} / {meta.imageSize}
          </span>
          <span>·</span>
          <span>
            {meta.succeeded}/{meta.requested}장 생성
          </span>
        </div>
      ) : null}

      {meta?.failures.length ? (
        <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "#fff4e6", color: "#9c3a00" }}>
          일부 컷이 실패했습니다 — {meta.failures[0]}
        </p>
      ) : null}

      <div className="grid gap-3" style={{ gridTemplateColumns: images.length > 1 ? "1fr 1fr" : "1fr" }}>
        {images.map((img, i) => (
          <figure
            key={i}
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            {/* 생성 결과는 base64 data URL이라 next/image 최적화를 거치지 않는다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.dataUrl} alt={`생성된 착용컷 ${i + 1}`} className="w-full" />
            <figcaption className="flex items-center justify-between px-3 py-2">
              <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                컷 {i + 1}
              </span>
              <a
                href={img.dataUrl}
                download={`착용컷_${stamp()}_${i + 1}.jpg`}
                className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-white"
                style={{ background: "var(--brand)" }}
              >
                다운로드
              </a>
            </figcaption>
          </figure>
        ))}
      </div>

      {prompt ? (
        <details className="card px-3.5 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold">
            이번 컷에 사용된 프롬프트 보기
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {prompt}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
