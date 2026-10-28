"use client";

import { useCallback, useRef, useState } from "react";

export type UploadedImage = {
  id: string;
  name: string;
  mimeType: string;
  /** base64 본문 (data: 접두사 제외) */
  data: string;
  previewUrl: string;
};

const MAX_FILES = 3;
const MAX_BYTES = 7 * 1024 * 1024;

export default function Uploader({
  images,
  onChange,
}: {
  images: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);

      const room = MAX_FILES - images.length;
      if (room <= 0) {
        setError(`상품 사진은 최대 ${MAX_FILES}장까지 올릴 수 있습니다.`);
        return;
      }

      const picked = Array.from(files).slice(0, room);
      const accepted: UploadedImage[] = [];

      for (const file of picked) {
        if (!file.type.startsWith("image/")) {
          setError("이미지 파일만 올릴 수 있습니다.");
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`${file.name} — 7MB를 넘어서 제외했습니다.`);
          continue;
        }
        const dataUrl = await readAsDataUrl(file);
        const comma = dataUrl.indexOf(",");
        accepted.push({
          id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          name: file.name,
          mimeType: file.type,
          data: dataUrl.slice(comma + 1),
          previewUrl: dataUrl,
        });
      }

      if (accepted.length > 0) onChange([...images, ...accepted]);
    },
    [images, onChange],
  );

  return (
    <section>
      <div className="field-title">상품 사진</div>
      <div className="field-desc">
        최대 {MAX_FILES}장. 같은 상품의 정면 · 디테일 · 후면을 함께 올리면 재현도가 올라갑니다.
      </div>

      <div
        className="mt-2.5 rounded-xl border border-dashed p-5 text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--brand)" : "var(--line)",
          background: dragging ? "var(--brand-soft)" : "var(--surface)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
          여기로 사진을 끌어다 놓거나
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          파일 선택
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p className="mt-2 text-[12px]" style={{ color: "#d9480f" }}>
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-lg border"
              style={{ borderColor: "var(--line)" }}
            >
              {/* 업로드 미리보기는 로컬 data URL이라 next/image 최적화 대상이 아니다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt={img.name} className="aspect-square w-full object-cover" />
              <button
                type="button"
                aria-label={`${img.name} 삭제`}
                onClick={() => onChange(images.filter((i) => i.id !== img.id))}
                className="absolute right-1 top-1 h-6 w-6 rounded-md bg-black/60 text-[14px] leading-none text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
