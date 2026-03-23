import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PipelineRequest = {
  projectId?: string;
};

export async function POST(request: Request) {
  let body: PipelineRequest;
  try {
    body = (await request.json()) as PipelineRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const inputTtlPath = path.join(dataDir, `${projectId}.ttl`);
  const enrichedTtlPath = path.join(dataDir, `${projectId}-enriched.ttl`);

  if (!fs.existsSync(inputTtlPath)) {
    return NextResponse.json(
      { error: `Input TTL not found: data/${projectId}.ttl` },
      { status: 404 }
    );
  }

  // Pipeline MVP: Step 1 Enrich (copy for now).
  fs.copyFileSync(inputTtlPath, enrichedTtlPath);

  // Step 2/3/Export are currently stubs.
  return NextResponse.json({
    projectId,
    steps: {
      enrich: { status: "done", ttlPath: `data/${projectId}-enriched.ttl` },
      translate: { status: "stubbed" },
      calculate: { status: "stubbed" },
      export: { status: "stubbed" },
    },
    outputFile: null,
  });
}

