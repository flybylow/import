import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import {
  ingestLeveringsbon,
  type LeveringsbonInput,
} from "@/lib/deliveries-importer";
import { appendDeliveriesIngestTurtle } from "@/lib/deliveries-persist";
import { appendTimelineAuditEvent } from "@/lib/timeline/append-event";
import { matchForTimelineDocumentKind } from "@/lib/timeline-document-matching";

export const runtime = "nodejs";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function truncateTimelineLine(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Line 1 = human context (note id, supplier, werf); line 2 = match stats (stable for parsers). */
function leveringsbonTimelineMessage(
  input: LeveringsbonInput,
  matched: number,
  total: number,
  avgConfidence: number
): string {
  const doc = input.afleverbon?.trim() || "";
  const supplier = input.supplier?.trim();
  const werf = input.werfAddress?.trim();
  const bits: string[] = ["Leveringsbon"];
  if (doc) bits.push(doc);
  else bits.push("(no afleverbon)");
  if (supplier) bits.push(supplier);
  if (werf) bits.push(truncateTimelineLine(werf, 72));
  const line1 = bits.join(" · ");
  const line2 = `${matched}/${total} lines matched, avg confidence ${avgConfidence}`;
  return `${line1}\n${line2}`;
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
        const msg = leveringsbonTimelineMessage(
          input,
          result.summary.matched,
          result.summary.total,
          result.summary.avgConfidence
        );
        const leverMatch = matchForTimelineDocumentKind("leveringsbon");
        let timestampIso = new Date().toISOString();
        if (input.date?.trim()) {
          const ms = Date.parse(input.date.trim());
          if (!Number.isNaN(ms)) {
            timestampIso = new Date(ms).toISOString();
          }
        }
        const { relPath } = appendTimelineAuditEvent(projectId, {
          eventId,
          timestampIso,
          actorSystem: true,
          actorLabel: "deliveries-importer",
          eventAction: leverMatch?.eventAction ?? "delivery_document_added",
          message: msg,
          source: leverMatch?.defaultSource ?? "deliveries-ingest",
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
