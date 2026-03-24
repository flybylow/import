import { NextResponse } from "next/server";

import {
  cleanPipelineArtifacts,
  isSafeProjectId,
} from "@/lib/clean-pipeline-artifacts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = String(body?.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }
  if (!isSafeProjectId(projectId)) {
    return NextResponse.json(
      { error: "Invalid `projectId` (use letters, numbers, - and _ only)" },
      { status: 400 }
    );
  }

  const result = cleanPipelineArtifacts(projectId);
  return NextResponse.json({ ok: true, ...result });
}
