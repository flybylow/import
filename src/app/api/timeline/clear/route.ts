import { NextResponse } from "next/server";

import { resetTimelineFileToPrefixesOnly } from "@/lib/timeline/reset-timeline-file";

export const runtime = "nodejs";

type Body = { projectId?: string };

/**
 * POST /api/timeline/clear — replace timeline Turtle with prefixes only (all events removed).
 * Body: `{ "projectId": "<id>" }` (same id rules as other timeline APIs).
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const r = resetTimelineFileToPrefixesOnly(projectId);
    return NextResponse.json({
      ok: true as const,
      path: r.relPath,
      created: r.created,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Invalid projectId") {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
