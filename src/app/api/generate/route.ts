import { NextRequest, NextResponse } from "next/server";
import { buildPrompt } from "@/lib/prompt";
import { GeminiError, generateImage, type ReferenceImage } from "@/lib/gemini";
import { ASPECT_RATIOS, IMAGE_SIZES, QUALITY_TIERS } from "@/lib/presets";

export const runtime = "nodejs";
// 4K 고품질 생성은 1분을 넘길 수 있다.
export const maxDuration = 300;

const MAX_REFERENCES = 3;
const MAX_VARIATIONS = 4;
/** base64 기준 장당 상한. 원본 약 7MB 정도까지 허용된다. */
const MAX_REFERENCE_CHARS = 10_000_000;

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해 주세요." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const references = Array.isArray(body.references) ? body.references : [];
  if (references.length === 0) {
    return NextResponse.json({ error: "상품 사진을 최소 1장 올려주세요." }, { status: 400 });
  }
  if (references.length > MAX_REFERENCES) {
    return NextResponse.json(
      { error: `상품 사진은 최대 ${MAX_REFERENCES}장까지 올릴 수 있습니다.` },
      { status: 400 },
    );
  }

  for (const ref of references) {
    if (typeof ref?.data !== "string" || typeof ref?.mimeType !== "string") {
      return NextResponse.json({ error: "상품 사진 데이터가 올바르지 않습니다." }, { status: 400 });
    }
    if (!ref.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 올릴 수 있습니다." }, { status: 400 });
    }
    if (ref.data.length > MAX_REFERENCE_CHARS) {
      return NextResponse.json(
        { error: "상품 사진 용량이 너무 큽니다. 장당 7MB 이하로 올려주세요." },
        { status: 413 },
      );
    }
  }

  const tier = QUALITY_TIERS.find((t) => t.id === body.quality) ?? QUALITY_TIERS[0];
  const aspectRatio = ASPECT_RATIOS.find((a) => a.id === body.aspectRatio)?.id ?? "4:5";
  const requestedSize = IMAGE_SIZES.find((s) => s.id === body.imageSize)?.id ?? "2K";
  // 티어가 지원하지 않는 해상도는 조용히 떨어뜨리지 않고 그 티어의 최대치로 맞춘다.
  const imageSize = (tier.sizes as readonly string[]).includes(requestedSize)
    ? requestedSize
    : tier.sizes[tier.sizes.length - 1];

  const variations = clamp(Number(body.variations) || 1, 1, MAX_VARIATIONS);

  const prompt = buildPrompt({
    categoryId: String(body.categoryId ?? ""),
    modelId: String(body.modelId ?? ""),
    sceneId: String(body.sceneId ?? ""),
    poseId: String(body.poseId ?? ""),
    extra: typeof body.extra === "string" ? body.extra : undefined,
    referenceCount: references.length,
  });

  const cleanRefs: ReferenceImage[] = references.map((r) => ({
    mimeType: r.mimeType,
    data: r.data,
  }));

  // 변형컷은 서로 독립이므로 병렬로 돌린다. 일부가 실패해도 성공분은 돌려준다.
  const settled = await Promise.allSettled(
    Array.from({ length: variations }, () =>
      generateImage({
        model: tier.model,
        prompt,
        references: cleanRefs,
        aspectRatio,
        imageSize,
      }),
    ),
  );

  const images: { dataUrl: string; tokens: number }[] = [];
  const failures: string[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      const { image, usage } = result.value;
      images.push({
        dataUrl: `data:${image.mimeType};base64,${image.data}`,
        tokens: usage.imageTokens,
      });
    } else {
      const reason = result.reason;
      failures.push(
        reason instanceof GeminiError || reason instanceof Error
          ? reason.message
          : "알 수 없는 오류가 발생했습니다.",
      );
    }
  }

  if (images.length === 0) {
    const status = settled[0]?.status === "rejected" && settled[0].reason instanceof GeminiError
      ? settled[0].reason.status
      : 502;
    return NextResponse.json(
      { error: failures[0] ?? "이미지 생성에 실패했습니다." },
      { status },
    );
  }

  return NextResponse.json({
    images,
    prompt,
    meta: {
      model: tier.model,
      modelLabel: tier.modelLabel,
      aspectRatio,
      imageSize,
      requested: variations,
      succeeded: images.length,
      failures,
    },
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

type RequestBody = {
  categoryId?: unknown;
  modelId?: unknown;
  sceneId?: unknown;
  poseId?: unknown;
  extra?: unknown;
  quality?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  variations?: unknown;
  references?: { mimeType: string; data: string }[];
};
