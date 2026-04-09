import { NextResponse } from "next/server";

import {
  isSafeTimelineEventId,
  removeTimelineEventsFromDisk,
} from "@/lib/timeline/delete-timeline-events";

export const runtime = "nodejs";

type Body = { projectId?: string; eventIds?: unknown };

/**
 * POST /api/timeline/delete-events — remove one or more `timeline:AuditEvent` rows and rewrite Turtle.
 * Body: `{ "projectId": "<id>", "eventIds": ["uuid", …] }`
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const rawIds = body.eventIds;
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "eventIds must be a non-empty array" }, { status: 400 });
  }
  const eventIds: string[] = [];
  for (const x of rawIds) {
    if (typeof x !== "string" || !x.trim()) {
      return NextResponse.json({ error: "Each eventId must be a non-empty string" }, { status: 400 });
    }
    const t = x.trim();
    if (!isSafeTimelineEventId(t)) {
      return NextResponse.json({ error: `Invalid eventId: ${t}` }, { status: 400 });
    }
    eventIds.push(t);
  }

  try {
    const r = removeTimelineEventsFromDisk(projectId, eventIds);
    return NextResponse.json({
      ok: true as const,
      path: r.relPath,
      removedCount: r.removedCount,
      remainingCount: r.remainingCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg === "Invalid projectId" ||
      msg.startsWith("Invalid eventId") ||
      msg === "No eventIds" ||
      msg.startsWith("Too many eventIds")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "Timeline file not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "No matching events to remove") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
