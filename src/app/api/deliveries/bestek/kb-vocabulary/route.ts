import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { assertSafeProjectId } from "@/lib/bestek/artifacts";
import { buildBestekKbVocabulary } from "@/lib/bestek/kb-vocabulary-for-bestek";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  try {
    assertSafeProjectId(projectId);
  } catch {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  const maxRaw = url.searchParams.get("max");
  const maxTerms = maxRaw
    ? Math.min(2000, Math.max(1, Number(maxRaw) || 600))
    : 600;

  const kbPath = path.join(process.cwd(), "data", `${projectId}-kb.ttl`);
  let kbTtl: string | null = null;
  let kbPresent = false;
  if (fs.existsSync(kbPath)) {
    try {
      kbTtl = fs.readFileSync(kbPath, "utf-8");
      kbPresent = true;
    } catch {
      kbTtl = null;
    }
  }

  const terms = buildBestekKbVocabulary({
    kbTtl,
    maxTerms,
    query: q || undefined,
  });

  return NextResponse.json({ projectId, kbPresent, terms });
}
