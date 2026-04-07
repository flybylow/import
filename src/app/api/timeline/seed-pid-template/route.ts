import fs from "fs";
import { NextResponse } from "next/server";

import { appendTimelineAuditEvent, timelineTtlPath } from "@/lib/timeline/append-event";
import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { buildPidTemplateEventPayloads } from "@/lib/timeline-pid-template";
import { parseTimelineTtl } from "@/lib/timeline-events";

export const runtime = "nodejs";

type PostBody = {
  projectId?: string;
  /** ISO date or datetime for the first template milestone. */
  baseDateIso?: string | null;
  /** Days between milestones (default 30, min 1, max 3650). */
  spacingDays?: number | null;
  /** If true, append even when the file already has `pid_reference_milestone` rows. */
  force?: boolean | null;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const rawBase =
    typeof body.baseDateIso === "string" && body.baseDateIso.trim()
      ? body.baseDateIso.trim()
      : undefined;
  const baseMs = rawBase ? Date.parse(rawBase) : Date.now();
  if (Number.isNaN(baseMs)) {
    return NextResponse.json({ error: "Invalid `baseDateIso`" }, { status: 400 });
  }

  const spacing =
    typeof body.spacingDays === "number" && Number.isFinite(body.spacingDays)
      ? body.spacingDays
      : 30;

  const force = body.force === true;
  const absPath = timelineTtlPath(projectId);
  const relPath = `data/${projectId}-timeline.ttl`;

  if (!force && fs.existsSync(absPath) && fs.statSync(absPath).size > 0) {
    const ttl = fs.readFileSync(absPath, "utf-8");
    const existing = parseTimelineTtl(ttl);
    const hasPid = existing.some((e) => e.eventAction === "pid_reference_milestone");
    if (hasPid) {
      return NextResponse.json(
        {
          error: "Timeline already contains PID milestone events",
          details:
            "Pass `\"force\": true` to append the template anyway, or clear/rename the timeline file first.",
        },
        { status: 409 }
      );
    }
  }

  const payloads = buildPidTemplateEventPayloads({ baseMs, spacingDays: spacing });
  for (const payload of payloads) {
    appendTimelineAuditEvent(projectId, payload);
  }

  return NextResponse.json({
    ok: true,
    projectId,
    path: relPath,
    appended: payloads.length,
  });
}
