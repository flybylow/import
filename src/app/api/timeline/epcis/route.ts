import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { appendTimelineAuditEvent } from "@/lib/timeline/append-event";
import { epcisToTimelinePayload, validateEPCIS } from "@/lib/timeline/epcis";
import type { EPCISEvent, IngestEPCISRequest, IngestEPCISResponse } from "@/lib/timeline/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: IngestEPCISRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const raw = body.epcisEvent;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "`epcisEvent` is required" }, { status: 400 });
  }

  const epcisEvent = raw as EPCISEvent;
  const validation = validateEPCIS(epcisEvent);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid EPCIS event", details: validation.errors.join("; ") },
      { status: 400 }
    );
  }

  const eventId = randomUUID();
  const { payload, mappedAction } = epcisToTimelinePayload(epcisEvent, eventId);

  try {
    appendTimelineAuditEvent(projectId, payload);
  } catch (e) {
    console.error("POST /api/timeline/epcis append failed", e);
    return NextResponse.json(
      { error: "Failed to ingest EPCIS event", details: String(e) },
      { status: 500 }
    );
  }

  const qty = epcisEvent.quantityList?.[0];
  const created = new Date().toISOString();

  const response: IngestEPCISResponse = {
    eventId,
    epcisEventId: epcisEvent.eventID,
    created,
    status: "logged",
    mappedTimeline: {
      timestamp: payload.timestampIso,
      actionType: mappedAction,
      materialReference: payload.materialReference,
      actor: payload.actorLabel,
      quantity: qty?.quantity,
      uom: qty?.uom,
    },
  };

  return NextResponse.json(response, { status: 201 });
}
