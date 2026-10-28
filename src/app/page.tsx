"use client";

import { useMemo, useState } from "react";
import OptionGrid from "@/components/OptionGrid";
import Uploader, { type UploadedImage } from "@/components/Uploader";
import ResultGallery, { type ResultImage, type ResultMeta } from "@/components/ResultGallery";
import {
  ASPECT_RATIOS,
  CATEGORIES,
  IMAGE_SIZES,
  MODELS,
  POSES,
  QUALITY_TIERS,
  SCENES,
} from "@/lib/presets";

export default function Home() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const [poseId, setPoseId] = useState(POSES[1].id);
  const [aspectRatio, setAspectRatio] = useState<string>(ASPECT_RATIOS[0].id);
  const [quality, setQuality] = useState<string>(QUALITY_TIERS[0].id);
  const [imageSize, setImageSize] = useState<string>("2K");
  const [variations, setVariations] = useState(2);
  const [extra, setExtra] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultImage[]>([]);
  const [meta, setMeta] = useState<ResultMeta | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  const tier = useMemo(
    () => QUALITY_TIERS.find((t) => t.id === quality) ?? QUALITY_TIERS[0],
    [quality],
  );
  const availableSizes = useMemo(
    () => IMAGE_SIZES.filter((s) => (tier.sizes as readonly string[]).includes(s.id)),
    [tier],
  );

  // 고품질 티어에서만 쓰던 4K로 둔 채 빠름으로 내려오면 선택값이 티어 밖으로 벗어난다.
  const effectiveSize = (tier.sizes as readonly string[]).includes(imageSize)
    ? imageSize
    : tier.sizes[tier.sizes.length - 1];

  const canGenerate = images.length > 0 && !loading;

  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          modelId,
          sceneId,
          poseId,
          extra,
          quality,
          aspectRatio,
          imageSize: effectiveSize,
          variations,
          references: images.map((i) => ({ mimeType: i.mimeType, data: i.data })),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "생성에 실패했습니다.");
        return;
      }

      setResults(body.images ?? []);
      setMeta(body.meta ?? null);
      setPrompt(body.prompt ?? null);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">착용컷 생성기</h1>
        <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--ink-soft)" }}>
          상품 사진 한 장이면 됩니다. 모델 · 배경 · 코디까지 자동으로 맞춘 커머스용 착용컷을 만들어
          드립니다.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* 좌: 설정 패널 */}
        <div className="card flex flex-col gap-6 p-5">
          <Uploader images={images} onChange={setImages} />

          <OptionGrid
            title="상품 카테고리"
            description="카테고리에 따라 보존할 디테일과 컷 구성이 달라집니다."
            options={CATEGORIES}
            value={categoryId}
            onChange={setCategoryId}
            columns={2}
          />

          <OptionGrid
            title="모델"
            description="타깃 고객층에 맞춰 고르세요."
            options={MODELS}
            value={modelId}
            onChange={setModelId}
            columns={2}
          />

          <OptionGrid
            title="배경 · 분위기"
            options={SCENES}
            value={sceneId}
            onChange={setSceneId}
            columns={2}
          />

          <OptionGrid title="포즈 · 컷 구성" options={POSES} value={poseId} onChange={setPoseId} columns={2} />

          <OptionGrid
            title="출력 비율"
            description="업로드할 채널에 맞는 비율을 고르세요."
            options={ASPECT_RATIOS}
            value={aspectRatio}
            onChange={setAspectRatio}
            columns={3}
          />

          <OptionGrid
            title="품질"
            description="메인컷은 고품질, 대량 생성은 빠름을 권장합니다."
            options={QUALITY_TIERS.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
            value={quality}
            onChange={setQuality}
            columns={2}
          />

          <OptionGrid
            title="해상도"
            options={availableSizes}
            value={effectiveSize}
            onChange={setImageSize}
            columns={3}
          />

          <section>
            <div className="field-title">한 번에 만들 컷 수</div>
            <div className="field-desc">여러 장을 뽑아 가장 좋은 컷을 고르는 방식을 권장합니다.</div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="opt text-center"
                  data-active={variations === n}
                  onClick={() => setVariations(n)}
                >
                  <div className="opt-label text-center">{n}장</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="field-title">추가 요청 (선택)</div>
            <div className="field-desc">예: 소매를 걷어 올린 모습으로, 가을 느낌 톤으로</div>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              placeholder="원하는 연출을 한국어로 적어주세요."
              className="mt-2.5 w-full resize-y rounded-lg border px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </section>

          <div>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
              className="w-full rounded-xl py-3 text-[14px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--brand)" }}
            >
              {loading ? "생성 중… (최대 2분)" : "착용컷 생성하기"}
            </button>
            {images.length === 0 ? (
              <p className="mt-2 text-center text-[12px]" style={{ color: "var(--ink-soft)" }}>
                상품 사진을 먼저 올려주세요.
              </p>
            ) : null}
            {error ? (
              <p className="mt-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "#fff5f5", color: "#c92a2a" }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>

        {/* 우: 결과. 설정 패널이 길어서 스크롤 중에도 결과가 보이도록 고정한다. */}
        <div className="lg:sticky lg:top-6">
          <div className="card max-h-[calc(100vh-3rem)] overflow-y-auto p-5">
            <ResultGallery
              images={results}
              meta={meta}
              prompt={prompt}
              loading={loading}
              variations={variations}
              aspectRatio={aspectRatio}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
