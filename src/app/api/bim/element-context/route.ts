import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { getElementSpatialContextFromKbTtl } from "@/lib/bim-element-spatial-context";
import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";

export const runtime = "nodejs";

/**
 * Spatial parents / siblings from project KB (`bot:containsElement` chain).
 * GET /api/bim/element-context?projectId=…&expressId=…
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const expressRaw = url.searchParams.get("expressId")?.trim() ?? "";

  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing projectId" }, { status: 400 });
  }

  const expressId = Number.parseInt(expressRaw, 10);
  if (!Number.isFinite(expressId) || expressId < 0) {
    return NextResponse.json({ error: "Invalid or missing expressId" }, { status: 400 });
  }

  const kbPath = path.join(process.cwd(), "data", `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) {
    return NextResponse.json(
      {
        error: "KB not found",
        hint: `Expected data/${projectId}-kb.ttl (run pipeline / KB build).`,
      },
      { status: 404 }
    );
  }

  const ttl = fs.readFileSync(kbPath, "utf-8");
  const context = getElementSpatialContextFromKbTtl(ttl, expressId);

  return NextResponse.json({
    projectId,
    expressId,
    kbPath: `data/${projectId}-kb.ttl`,
    context,
  });
}
