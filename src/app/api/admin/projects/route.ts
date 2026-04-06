import path from "path";
import { NextResponse } from "next/server";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import {
  deleteProjectWorkspace,
  discoverProjectIdsInDataDir,
  summarizeProjectWorkspace,
} from "@/lib/data-project-workspace";

export const runtime = "nodejs";

/**
 * GET /api/admin/projects — workspace ids found under `data/` plus size / file hints.
 * DELETE /api/admin/projects?projectId=… — remove all known artifacts for that id (destructive).
 */
export async function GET() {
  const cwd = process.cwd();
  const ids = discoverProjectIdsInDataDir(path.join(cwd, "data"));
  const projects = ids.map((id) => {
    const s = summarizeProjectWorkspace(id, cwd);
    return {
      id: s.id,
      fileCount: s.presentFiles.length,
      hasCalcHistoryDir: s.hasCalcHistoryDir,
      totalBytes: s.totalBytes,
      samplePaths: s.presentFiles.slice(0, 6),
    };
  });
  return NextResponse.json({ projects });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }
  if (!isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }
  try {
    const result = deleteProjectWorkspace(projectId);
    const removedCount = result.removedFiles.length + result.removedDirs.length;
    if (removedCount === 0) {
      return NextResponse.json(
        {
          error: `No workspace files found for ${projectId}`,
          ...result,
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true as const, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
