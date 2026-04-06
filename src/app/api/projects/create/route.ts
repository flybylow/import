import { NextResponse } from "next/server";

import { allocateProjectId, createEmptyTimelineProject } from "@/lib/create-project";

export const runtime = "nodejs";

type PostBody = {
  /** Exact id (must pass `isSafeProjectId`). */
  projectId?: string;
  /** Human label → slug; collision gets a short random suffix. */
  fromLabel?: string;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const explicitId =
    typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined;
  const fromLabel = typeof body.fromLabel === "string" ? body.fromLabel : undefined;

  const allocated = allocateProjectId({
    explicitId,
    fromLabel,
  });
  if (!allocated.ok) {
    return NextResponse.json({ error: allocated.error }, { status: 400 });
  }

  const { projectId } = allocated;

  const created = createEmptyTimelineProject(projectId);
  if (!created.ok) {
    return NextResponse.json({ error: created.error, projectId }, { status: created.status });
  }

  return NextResponse.json({
    projectId,
    timelinePath: created.timelineRelPath,
  });
}
