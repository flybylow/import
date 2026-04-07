import fs from "fs";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { appendTimelineAuditEvent, timelineTtlPath } from "@/lib/timeline/append-event";
import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { isPidMilestoneKey } from "@/lib/timeline-pid-milestones";
import { isTimelineEventAction } from "@/lib/timeline-events-vocab";
import { parseTimelineTtl } from "@/lib/timeline-events";
import type { TimelineEventPayload } from "@/lib/timeline-events";

export const runtime = "nodejs";

const fileNameFor = (projectId: string) => `${projectId}-timeline.ttl`;

type PostBody = {
  projectId?: string;
  eventAction?: string;
  message?: string;
  actorLabel?: string;
  actorSystem?: boolean;
  targetExpressId?: number | null;
  /** Optional dpp:material/… or EPC URI — stored as `timeline:materialReference`. */
  materialReference?: string | null;
  /** Optional ISO timestamp (e.g. back-dated manual log). Defaults to now. */
  timestampIso?: string;
  /** Required when `eventAction` is `pid_reference_milestone`. */
  pidMilestoneKey?: string | null;
  /** Optional `"0"`…`"9"` process phase index. */
  pidLifecyclePhase?: string | null;
  /** Optional narrative state hint for UI (not authoritative). */
  pidStateHint?: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim() ?? "";
  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const absPath = timelineTtlPath(projectId);
  const relPath = `data/${fileNameFor(projectId)}`;

  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ projectId, path: relPath, events: [] });
  }

  const ttl = fs.readFileSync(absPath, "utf-8");
  const events = parseTimelineTtl(ttl);
  return NextResponse.json({ projectId, path: relPath, events });
}

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

  const actionRaw = typeof body.eventAction === "string" ? body.eventAction.trim() : "";
  if (!actionRaw || !isTimelineEventAction(actionRaw)) {
    return NextResponse.json(
      { error: "Invalid or missing `eventAction` (must be a known vocabulary value)" },
      { status: 400 }
    );
  }

  const message =
    typeof body.message === "string" && body.message.trim() ? body.message.trim() : undefined;

  const actorLabel =
    typeof body.actorLabel === "string" && body.actorLabel.trim()
      ? body.actorLabel.trim()
      : "operator";

  const actorSystem = body.actorSystem === true;

  let targetExpressId: number | undefined;
  if (body.targetExpressId !== undefined && body.targetExpressId !== null) {
    const n = Number(body.targetExpressId);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Invalid `targetExpressId`" }, { status: 400 });
    }
    targetExpressId = Math.floor(n);
  }

  const materialReference =
    typeof body.materialReference === "string" && body.materialReference.trim()
      ? body.materialReference.trim()
      : undefined;

  let pidReferenceFields: TimelineEventPayload["pidReferenceFields"];
  if (actionRaw === "pid_reference_milestone") {
    const rawKey =
      typeof body.pidMilestoneKey === "string" ? body.pidMilestoneKey.trim() : "";
    if (!rawKey || !isPidMilestoneKey(rawKey)) {
      return NextResponse.json(
        {
          error: "Invalid or missing `pidMilestoneKey` for pid_reference_milestone",
          details: "Must be an allowlisted milestone key (see src/lib/timeline-pid-milestones.ts)",
        },
        { status: 400 }
      );
    }
    const phaseRaw =
      typeof body.pidLifecyclePhase === "string" ? body.pidLifecyclePhase.trim() : "";
    const phase =
      phaseRaw && /^[0-9]$/.test(phaseRaw) ? phaseRaw : undefined;
    const hintRaw =
      typeof body.pidStateHint === "string" && body.pidStateHint.trim()
        ? body.pidStateHint.trim()
        : undefined;
    pidReferenceFields = {
      milestoneKey: rawKey,
      ...(phase ? { lifecyclePhase: phase } : {}),
      ...(hintRaw ? { stateHint: hintRaw } : {}),
    };
  }

  const eventId = randomUUID();
  let timestampIso = new Date().toISOString();
  if (typeof body.timestampIso === "string" && body.timestampIso.trim()) {
    const ms = Date.parse(body.timestampIso.trim());
    if (!Number.isNaN(ms)) {
      timestampIso = new Date(ms).toISOString();
    }
  }

  const payload: TimelineEventPayload = {
    eventId,
    timestampIso,
    actorSystem,
    actorLabel,
    eventAction: actionRaw,
    ...(message ? { message } : {}),
    ...(targetExpressId !== undefined ? { targetExpressId } : {}),
    ...(materialReference ? { materialReference } : {}),
    ...(pidReferenceFields ? { pidReferenceFields } : {}),
    source: "form",
  };

  const { relPath } = appendTimelineAuditEvent(projectId, payload);

  return NextResponse.json({
    ok: true,
    eventId,
    path: relPath,
    timestampIso,
    eventAction: actionRaw,
  });
}
