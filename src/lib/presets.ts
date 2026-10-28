/**
 * 착용컷 생성기 프리셋 정의.
 *
 * 셀러는 영어 프롬프트를 쓸 줄 모른다는 전제로 설계했다.
 * UI에서는 한국어 라벨만 고르고, 실제 모델에 들어가는 영문 지시문(`prompt`)은
 * 여기 정의된 값이 그대로 사용된다.
 */

export type PresetOption = {
  id: string;
  label: string;
  /** UI 보조 설명. 셀러가 뭘 고르는지 알게 해주는 한 줄. */
  hint: string;
  /** 프롬프트에 삽입되는 영문 지시문. */
  prompt: string;
};

/** 상품 카테고리 — 카테고리마다 "보존해야 할 디테일"과 프레이밍이 달라진다. */
export const CATEGORIES: (PresetOption & { framing: string })[] = [
  {
    id: "top",
    label: "상의",
    hint: "티셔츠 · 셔츠 · 니트 · 블라우스",
    prompt:
      "The product is a top (t-shirt, shirt, knit or blouse). Preserve the neckline shape, sleeve length, shoulder line, hem length, print placement, buttons and all stitching exactly.",
    framing: "Frame from head to mid-thigh so the full top and its hemline are clearly visible.",
  },
  {
    id: "outer",
    label: "아우터",
    hint: "자켓 · 코트 · 패딩 · 가디건",
    prompt:
      "The product is an outerwear piece (jacket, coat, padding or cardigan). Preserve the lapel/collar construction, closure type, pocket placement, quilting or weave pattern, length and all hardware exactly.",
    framing: "Frame the full body so the complete outerwear silhouette and length are visible.",
  },
  {
    id: "dress",
    label: "원피스",
    hint: "원피스 · 점프수트 · 세트",
    prompt:
      "The product is a dress, jumpsuit or matching set. Preserve the silhouette, waistline, skirt length, pleating or draping, pattern scale and all trims exactly.",
    framing: "Frame the full body head to toe so the entire length and drape are visible.",
  },
  {
    id: "bottom",
    label: "하의",
    hint: "팬츠 · 스커트 · 데님",
    prompt:
      "The product is a bottom (pants, skirt or denim). Preserve the rise, fit, leg or hem line, wash/fade pattern, pocket shape, seams and hardware exactly.",
    framing:
      "Frame from the waist to below the feet, slightly low camera angle, so the full leg line and hem break are visible.",
  },
  {
    id: "shoes",
    label: "신발",
    hint: "스니커즈 · 부츠 · 구두",
    prompt:
      "The product is footwear. Preserve the exact silhouette, sole profile, material texture, lacing, color blocking and every logo-free design detail.",
    framing:
      "Low camera angle focused on the lower legs and feet, shoes sharp and dominant in the frame.",
  },
  {
    id: "bag",
    label: "가방",
    hint: "백 · 크로스백 · 백팩",
    prompt:
      "The product is a bag. Preserve the exact shape, proportions, strap construction, hardware, stitching and material grain.",
    framing:
      "Frame the upper body and the bag together, bag clearly presented and sharp, held or worn naturally.",
  },
  {
    id: "accessory",
    label: "액세서리",
    hint: "모자 · 스카프 · 주얼리",
    prompt:
      "The product is an accessory. Preserve its exact shape, scale relative to the body, material finish and every detail.",
    framing: "Tight upper-body or detail framing that makes the accessory the clear subject.",
  },
];

/** 모델 프리셋 — 타깃 고객층에 맞춰 고른다. */
export const MODELS: PresetOption[] = [
  {
    id: "kr-f-20s",
    label: "20대 한국 여성",
    hint: "가장 무난한 기본값",
    prompt:
      "Korean female model in her mid-20s, 168cm, natural slim build, clean minimal makeup, black hair in a soft low ponytail, relaxed confident expression.",
  },
  {
    id: "kr-f-30s",
    label: "30대 한국 여성",
    hint: "오피스 · 베이직 브랜드",
    prompt:
      "Korean female model in her early 30s, 167cm, elegant natural build, refined natural makeup, shoulder-length dark brown hair, calm composed expression.",
  },
  {
    id: "kr-f-curvy",
    label: "한국 여성 · 55~66",
    hint: "실측 핏 강조 · 플러스 사이즈",
    prompt:
      "Korean female model in her late 20s, 165cm, natural curvy build (Korean size 66), healthy proportions, soft natural makeup, long wavy dark hair, warm friendly expression.",
  },
  {
    id: "kr-m-20s",
    label: "20대 한국 남성",
    hint: "캐주얼 · 스트릿",
    prompt:
      "Korean male model in his mid-20s, 182cm, lean athletic build, clean short black hair, natural skin, calm understated expression.",
  },
  {
    id: "kr-m-30s",
    label: "30대 한국 남성",
    hint: "비즈니스 · 포멀",
    prompt:
      "Korean male model in his early 30s, 180cm, solid athletic build, neat side-parted dark hair, groomed appearance, confident composed expression.",
  },
  {
    id: "kr-senior-f",
    label: "5060 한국 여성",
    hint: "시니어 · 미시 브랜드",
    prompt:
      "Korean female model in her mid-50s, 162cm, graceful natural build, soft natural makeup, neat shoulder-length hair with natural gray tones, warm dignified expression.",
  },
  {
    id: "kr-kid-f",
    label: "아동 여아",
    hint: "아동복 (7~9세)",
    prompt:
      "Korean girl child model around 8 years old, age-appropriate natural appearance, no makeup, simple neat hair, cheerful natural expression, modest fully-covered age-appropriate styling, simple standing pose.",
  },
  {
    id: "kr-kid-m",
    label: "아동 남아",
    hint: "아동복 (7~9세)",
    prompt:
      "Korean boy child model around 8 years old, age-appropriate natural appearance, short neat hair, cheerful natural expression, modest fully-covered age-appropriate styling, simple standing pose.",
  },
  {
    id: "global-f",
    label: "글로벌 여성",
    hint: "해외 셀링 · 영문 스토어",
    prompt:
      "International female model in her mid-20s, 175cm, slim build, neutral ethnicity with warm skin tone, minimal makeup, natural styled hair, editorial expression.",
  },
];

/** 씬(배경) 프리셋. */
export const SCENES: PresetOption[] = [
  {
    id: "studio-white",
    label: "화이트 스튜디오",
    hint: "상세페이지 기본 · 누끼 느낌",
    prompt:
      "Bright minimal photo studio, seamless pure white backdrop, large softbox key light from front-left with gentle fill, soft natural contact shadow on the floor.",
  },
  {
    id: "studio-gray",
    label: "웜 그레이 스튜디오",
    hint: "고급스러운 베이직",
    prompt:
      "Minimal photo studio, seamless warm light-gray backdrop, soft diffused key light, subtle gradient falloff, gentle floor shadow.",
  },
  {
    id: "studio-beige",
    label: "베이지 스튜디오",
    hint: "따뜻한 감성 · 내추럴",
    prompt:
      "Minimal photo studio, seamless warm beige backdrop, soft warm diffused lighting, cozy natural tone, gentle shadow.",
  },
  {
    id: "street-city",
    label: "도심 거리",
    hint: "데일리 · 스트릿 무드",
    prompt:
      "Clean urban street in daytime, modern buildings softly blurred in the background, natural overcast daylight, shallow depth of field.",
  },
  {
    id: "cafe",
    label: "카페 인테리어",
    hint: "데일리룩 · 감성 커머스",
    prompt:
      "Warm modern cafe interior, wooden and concrete textures softly blurred behind, soft natural window light from the side.",
  },
  {
    id: "home-natural",
    label: "자연광 홈",
    hint: "홈웨어 · 라운지웨어",
    prompt:
      "Bright minimal home interior, large window with soft natural daylight, light linen and wood tones, airy calm atmosphere.",
  },
  {
    id: "outdoor-nature",
    label: "야외 자연",
    hint: "아웃도어 · 봄가을 시즌",
    prompt:
      "Outdoor natural setting with soft greenery blurred in the background, golden-hour natural sunlight, warm gentle rim light.",
  },
  {
    id: "resort",
    label: "리조트 · 해변",
    hint: "여름 · 바캉스 시즌",
    prompt:
      "Bright seaside resort setting, soft sand and ocean blurred in the background, clear warm sunlight, summer vacation atmosphere.",
  },
  {
    id: "office",
    label: "오피스",
    hint: "포멀 · 비즈니스 캐주얼",
    prompt:
      "Modern minimal office interior softly blurred behind, clean neutral tones, soft even daylight from large windows.",
  },
];

/** 포즈 · 컷 구성 프리셋. */
export const POSES: PresetOption[] = [
  {
    id: "front-full",
    label: "정면 전신",
    hint: "상세페이지 메인컷",
    prompt:
      "Standing straight facing the camera, full body, arms relaxed at the sides, weight evenly balanced, natural neutral posture.",
  },
  {
    id: "three-quarter",
    label: "3/4 전신",
    hint: "가장 자연스러운 기본 컷",
    prompt:
      "Standing in a three-quarter turn toward the camera, full body, weight shifted onto one leg, arms relaxed, natural confident posture.",
  },
  {
    id: "upper-body",
    label: "상반신 클로즈업",
    hint: "소재 · 디테일 강조",
    prompt:
      "Upper body framing from the head to the waist, slight turn, one hand relaxed near the body, calm expression.",
  },
  {
    id: "detail",
    label: "디테일 컷",
    hint: "원단 · 봉제 · 핏 어필",
    prompt:
      "Close-up detail shot of the product on the body, cropped tightly on the key design detail, fabric texture and stitching clearly readable, hands may gently frame the detail.",
  },
  {
    id: "walking",
    label: "워킹 샷",
    hint: "드레이프 · 흐름 표현",
    prompt:
      "Candid mid-stride walking shot, full body, natural arm swing, fabric in gentle motion, looking off-camera.",
  },
  {
    id: "sitting",
    label: "앉은 자세",
    hint: "라운지 · 편안한 무드",
    prompt:
      "Seated naturally on a simple neutral stool or step, full body visible, relaxed posture, hands resting naturally.",
  },
  {
    id: "back",
    label: "뒷모습",
    hint: "백 디테일 · 핏 확인",
    prompt:
      "Standing with the back to the camera, full body, head turned slightly to the side, showing the back construction of the product clearly.",
  },
];

/** 출력 비율 — 커머스 채널별로 요구 비율이 다르다. */
export const ASPECT_RATIOS = [
  { id: "4:5", label: "4:5", hint: "상세페이지 · 인스타 피드" },
  { id: "1:1", label: "1:1", hint: "썸네일 · 마켓 등록" },
  { id: "3:4", label: "3:4", hint: "네이버 스마트스토어" },
  { id: "2:3", label: "2:3", hint: "룩북 · 세로 배너" },
  { id: "9:16", label: "9:16", hint: "릴스 · 숏폼 · 스토리" },
  { id: "16:9", label: "16:9", hint: "가로 배너 · 유튜브" },
] as const;

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];

/** 품질 티어 — 속도/단가와 품질의 트레이드오프를 셀러에게 그대로 노출한다. */
export const QUALITY_TIERS = [
  {
    id: "fast",
    label: "빠름",
    model: "gemini-3.1-flash-image",
    modelLabel: "Nano Banana 2",
    hint: "대량 생성용 · 가장 저렴",
    sizes: ["1K", "2K"] as const,
  },
  {
    id: "pro",
    label: "고품질",
    model: "gemini-3-pro-image",
    modelLabel: "Nano Banana Pro",
    hint: "메인컷 · 디테일 보존 우수",
    sizes: ["1K", "2K", "4K"] as const,
  },
] as const;

export type QualityTierId = (typeof QUALITY_TIERS)[number]["id"];
export type ImageSize = "1K" | "2K" | "4K";

export const IMAGE_SIZES: { id: ImageSize; label: string; hint: string }[] = [
  { id: "1K", label: "1K", hint: "약 1024px · 웹 업로드용" },
  { id: "2K", label: "2K", hint: "약 2048px · 상세페이지 권장" },
  { id: "4K", label: "4K", hint: "약 4096px · 인쇄 · 확대컷" },
];

export function findPreset(list: PresetOption[], id: string): PresetOption | undefined {
  return list.find((p) => p.id === id);
}
