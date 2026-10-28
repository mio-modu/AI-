import { NextRequest, NextResponse } from "next/server";
import { ExtractError, extractVoucher, type ExtractTier } from "@/lib/gemini";
import { validateVoucher, VERDICT_LABEL } from "@/lib/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

/** base64 기준 상한. 원본 약 10MB. */
const MAX_FILE_CHARS = 14_000_000;

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해 주세요." },
      { status: 500 },
    );
  }

  let body: { mimeType?: unknown; data?: unknown; tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { mimeType, data } = body;
  if (typeof mimeType !== "string" || typeof data !== "string" || !data) {
    return NextResponse.json({ error: "전표 파일이 없습니다." }, { status: 400 });
  }
  if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") {
    return NextResponse.json(
      { error: "이미지 또는 PDF 파일만 올릴 수 있습니다." },
      { status: 400 },
    );
  }
  if (data.length > MAX_FILE_CHARS) {
    return NextResponse.json({ error: "파일 용량이 너무 큽니다. 10MB 이하로 올려주세요." }, { status: 413 });
  }

  const tier: ExtractTier = body.tier === "accurate" ? "accurate" : "fast";

  try {
    const { voucher, usage, model } = await extractVoucher({ tier, mimeType, data });
    const validation = validateVoucher(voucher);

    return NextResponse.json({
      voucher,
      validation: { ...validation, verdictLabel: VERDICT_LABEL[validation.verdict] },
      meta: { model, ...usage },
    });
  } catch (err) {
    if (err instanceof ExtractError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "판독 중 오류가 발생했습니다." }, { status: 500 });
  }
}
