import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import {
  ingestLeveringsbon,
  type LeveringsbonInput,
} from "@/lib/deliveries-importer";
import { appendDeliveriesIngestTurtle } from "@/lib/deliveries-persist";
import { appendTimelineAuditEvent } from "@/lib/timeline/append-event";

export const runtime = "nodejs";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseLeveringsbon(body: unknown): LeveringsbonInput | null {
  if (!isRecord(body)) return null;
  const itemsRaw = body.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items: LeveringsbonInput["items"] = [];
  for (const row of itemsRaw) {
    if (!isRecord(row)) return null;
    const description = row.description;
    if (typeof description !== "string" || !description.trim()) return null;
    const item: LeveringsbonInput["items"][number] = {
      description: description.trim(),
    };
    if (typeof row.quantity === "number" && Number.isFinite(row.quantity)) {
      item.quantity = row.quantity;
    }
    if (typeof row.unit === "string") item.unit = row.unit;
    if (typeof row.lot === "string") item.lot = row.lot;
    items.push(item);
  }

  const out: LeveringsbonInput = { items };
  if (typeof body.afleverbon === "string") out.afleverbon = body.afleverbon;
  if (typeof body.date === "string") out.date = body.date;
  if (typeof body.supplier === "string") out.supplier = body.supplier;
  if (typeof body.werfAddress === "string") out.werfAddress = body.werfAddress;
  return out;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseLeveringsbon(body);
  if (!input || input.items.length === 0) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details:
          "Expected JSON with non-empty items[]; each item needs a non-empty description string.",
      },
      { status: 400 }
    );
  }

  try {
    const result = ingestLeveringsbon(input);

    const projectId =
      isRecord(body) && typeof body.projectId === "string"
        ? body.projectId.trim()
        : "";
    const recordTimeline =
      isRecord(body) && body.recordTimelineEvent === true;
    const appendTurtle =
      isRecord(body) && body.appendDeliveriesTurtle === true;

    const persistence: {
      /** Echoes the project id used for any writes (use for deep links). */
      projectId?: string;
      timeline?: { eventId: string; path: string };
      deliveriesTtl?: { path: string };
    } = {};

    if (projectId && isSafeProjectId(projectId)) {
      persistence.projectId = projectId;
      if (recordTimeline) {
        const eventId = randomUUID();
        const doc = input.afleverbon?.trim() || "(no afleverbon)";
        const msg = `Leveringsbon ${doc}: ${result.summary.matched}/${result.summary.total} lines matched, avg confidence ${result.summary.avgConfidence}`;
        const { relPath } = appendTimelineAuditEvent(projectId, {
          eventId,
          timestampIso: new Date().toISOString(),
          actorSystem: true,
          actorLabel: "deliveries-importer",
          eventAction: "delivery_document_added",
          message: msg,
          source: "deliveries-ingest",
        });
        persistence.timeline = { eventId, path: relPath };
      }
      if (appendTurtle) {
        const { relPath } = appendDeliveriesIngestTurtle({
          projectId,
          turtle: result.turtle,
          note: input.afleverbon,
        });
        persistence.deliveriesTtl = { path: relPath };
      }
    }

    const hasPersistence =
      persistence.timeline !== undefined ||
      persistence.deliveriesTtl !== undefined;

    return NextResponse.json(
      hasPersistence ? { ...result, persistence } : result,
      { status: 200 }
    );
  } catch (e) {
    console.error("deliveries/ingest:", e);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
