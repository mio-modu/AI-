import { CATEGORIES, MODELS, POSES, SCENES, findPreset } from "./presets";

export type PromptInput = {
  categoryId: string;
  modelId: string;
  sceneId: string;
  poseId: string;
  /** 셀러가 직접 적는 추가 요청. 한국어로 들어와도 모델이 이해한다. */
  extra?: string;
  /** 레퍼런스 이미지 장수. 2장 이상이면 "같은 상품의 여러 각도"로 해석하게 한다. */
  referenceCount: number;
};

/**
 * 카테고리별 자동 코디 규칙.
 *
 * 착용컷의 성패는 "판매 상품이 주인공으로 남는가"에서 갈린다.
 * 함께 입히는 옷은 반드시 무채색·베이직으로 고정해서 시선을 뺏지 않게 한다.
 */
const COORDINATION: Record<string, string> = {
  top: "Pair with simple high-waisted straight denim or plain neutral trousers and clean minimal shoes. Nothing patterned or colorful.",
  outer:
    "Layer over a plain neutral inner top and simple straight trousers, with clean minimal shoes. The inner layers must stay visually quiet.",
  dress: "Add only clean minimal shoes. No jacket, no bag, no competing layers.",
  bottom:
    "Pair with a plain fitted neutral top, tucked or half-tucked so the waistline of the product is clearly visible, and clean minimal shoes.",
  shoes:
    "Pair with simple slim or straight trousers cropped or rolled so the footwear is fully unobstructed, plus a plain neutral top.",
  bag: "Dress the model in a quiet neutral outfit with no pattern so the bag is the clear focal point.",
  accessory:
    "Dress the model in a plain neutral outfit with no pattern or distracting detail so the accessory stands out.",
};

/**
 * 프리셋 선택값을 모델에 보낼 단일 영문 프롬프트로 합성한다.
 *
 * 구조를 고정한 이유: 섹션 순서와 라벨을 매번 동일하게 유지해야
 * 같은 설정에서 결과 편차가 줄고, 어떤 항목이 결과를 바꿨는지 추적할 수 있다.
 */
export function buildPrompt(input: PromptInput): string {
  const category = CATEGORIES.find((c) => c.id === input.categoryId) ?? CATEGORIES[0];
  const model = findPreset(MODELS, input.modelId) ?? MODELS[0];
  const scene = findPreset(SCENES, input.sceneId) ?? SCENES[0];
  const pose = findPreset(POSES, input.poseId) ?? POSES[0];

  const referenceNote =
    input.referenceCount > 1
      ? `You are given ${input.referenceCount} reference images of THE SAME single product from different angles or details. Combine them into one consistent understanding of the product.`
      : "You are given 1 reference image of the product.";

  const sections = [
    "You are a professional e-commerce fashion photographer and retoucher.",
    "",
    "TASK",
    `${referenceNote} Generate ONE photorealistic commercial photograph of a model wearing or carrying that exact product.`,
    "",
    "ABSOLUTE CONSTRAINTS — these outrank every other instruction:",
    "- Reproduce the product EXACTLY as it appears in the reference: identical color and shade, fabric texture, print/graphic artwork and its placement and scale, stitching, trims and hardware.",
    "- Do NOT redesign, restyle, recolor, simplify or embellish the product. Do not add or remove any design element.",
    "- Do NOT invent brand names, logos, or text anywhere in the image.",
    `- ${category.prompt}`,
    "- The product must sit on the body with physically correct fit, drape, folds and contact shadows.",
    "",
    "MODEL",
    model.prompt,
    "",
    "POSE & FRAMING",
    pose.prompt,
    category.framing,
    "",
    "STYLING",
    COORDINATION[category.id] ?? COORDINATION.top,
    "",
    "SCENE & LIGHTING",
    scene.prompt,
    "",
    "CAMERA",
    "Shot on a full-frame camera with an 85mm lens at f/2.8, natural perspective, tack-sharp focus on the product, subtle background falloff, true-to-life color, commercial retouching quality.",
    "",
    "OUTPUT RULES",
    "- A single clean photograph suitable for a product detail page.",
    "- No text, no watermark, no logo, no border, no collage, no split frame.",
    "- Realistic human anatomy: correct hands with five fingers, natural proportions, no distortion.",
    "- Natural skin texture. Do not over-smooth into a plastic look.",
  ];

  const extra = input.extra?.trim();
  if (extra) {
    sections.push(
      "",
      "ADDITIONAL REQUEST FROM THE SELLER (apply unless it conflicts with the ABSOLUTE CONSTRAINTS)",
      extra,
    );
  }

  return sections.join("\n");
}
