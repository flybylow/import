import type { EPCISEvent, EPCISMappedActionType } from "@/lib/timeline/types";
import type { TimelineEpcisFields, TimelineEventPayload } from "@/lib/timeline-events";

/** Separator between human summary and full JSON in `timeline:message`. */
export const EPCIS_JSON_SEPARATOR = "\n\n--- EPCIS JSON ---\n";

const KNOWN_BIZ_STEPS = new Set([
  "shipping",
  "receiving",
  "inspecting",
  "accepting",
  "storing",
  "packing",
  "unpacking",
]);

export function mapBizStepToMappedAction(bizStep: string | undefined): EPCISMappedActionType {
  const b = (bizStep ?? "").toLowerCase();
  const m: Record<string, EPCISMappedActionType> = {
    shipping: "delivery",
    receiving: "delivery",
    inspecting: "inspection",
    accepting: "inspection",
    storing: "site_update",
    packing: "delivery",
    unpacking: "site_update",
  };
  return m[b] ?? "note";
}

export function extractActor(sourceList: EPCISEvent["sourceList"]): string {
  if (!sourceList?.length) return "unknown-party";
  const s = sourceList[0]?.source?.trim();
  return s || "unknown-party";
}

/** One string per distinct EPCIS facet (biz step, quantity, disposition, party roles). */
export function epcisHumanNotesFromFields(f: TimelineEpcisFields): string[] {
  const notes: string[] = [];

  if (f.bizStep?.trim()) {
    notes.push(f.bizStep.trim().replace(/_/g, " "));
  }

  if (f.quantityListJson?.trim()) {
    try {
      const arr = JSON.parse(f.quantityListJson) as Array<{ quantity?: number; uom?: string }>;
      const qty = arr[0];
      if (qty !== undefined) {
        const u = qty.uom?.trim() || "—";
        notes.push(`${qty.quantity ?? "—"} ${u}`);
      }
    } catch {
      /* skip */
    }
  }

  if (f.disposition?.trim()) {
    notes.push(f.disposition.trim().replace(/_/g, " "));
  }

  if (f.sourceListJson?.trim()) {
    try {
      const arr = JSON.parse(f.sourceListJson) as Array<{ type?: string }>;
      const t = arr[0]?.type?.replace(/_/g, " ").trim();
      if (t) notes.push(`from ${t}`);
    } catch {
      /* skip */
    }
  }

  if (f.destinationListJson?.trim()) {
    try {
      const arr = JSON.parse(f.destinationListJson) as Array<{ type?: string }>;
      const t = arr[0]?.type?.replace(/_/g, " ").trim();
      if (t) notes.push(`to ${t}`);
    } catch {
      /* skip */
    }
  }

  return notes;
}

export function formatEPCISHumanNotes(epcis: EPCISEvent): string[] {
  const notes = epcisHumanNotesFromFields(buildTimelineEpcisFields(epcis));
  return notes.length > 0 ? notes : ["EPCIS event"];
}

/** Legacy single-line summary (`a | b | c`) for APIs or search snippets. */
export function formatEPCISDescription(epcis: EPCISEvent): string {
  return formatEPCISHumanNotes(epcis).join(" | ");
}

/**
 * Human lines before `EPCIS_JSON_SEPARATOR` in `timeline:message`, or derived from
 * `epcisFields`. Supports newline-separated (new), pipe-separated (legacy), or single line.
 */
export function getEpcisHumanNotesForRow(ev: {
  message?: string;
  epcisFields?: TimelineEpcisFields;
}): string[] {
  if (ev.epcisFields) {
    const fromFields = epcisHumanNotesFromFields(ev.epcisFields);
    if (fromFields.length > 0) return fromFields;
  }

  const msg = ev.message;
  if (!msg?.trim()) return [];

  const idx = msg.indexOf(EPCIS_JSON_SEPARATOR);
  const block = (idx >= 0 ? msg.slice(0, idx) : msg).trim();
  if (!block) return [];

  if (block.includes("\n")) {
    return block.split(/\n/).map((s) => s.trim()).filter(Boolean);
  }
  if (block.includes(" | ")) {
    return block.split(" | ").map((s) => s.trim()).filter(Boolean);
  }
  return [block];
}

export function validateEPCIS(epcis: EPCISEvent): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!epcis.eventTime?.trim()) {
    errors.push("eventTime is required");
  } else if (Number.isNaN(Date.parse(epcis.eventTime))) {
    errors.push("eventTime must be valid ISO 8601");
  }

  if (!epcis.eventID?.trim()) {
    errors.push("eventID is required");
  }

  const t = epcis.type;
  if (!t || !["ObjectEvent", "AggregationEvent", "TransactionEvent"].includes(t)) {
    errors.push("type must be ObjectEvent, AggregationEvent, or TransactionEvent");
  }

  if (epcis.bizStep !== undefined && epcis.bizStep !== null && epcis.bizStep !== "") {
    const bs = epcis.bizStep.toLowerCase();
    if (!KNOWN_BIZ_STEPS.has(bs)) {
      errors.push(
        `bizStep '${epcis.bizStep}' not recognized. Use one of: ${[...KNOWN_BIZ_STEPS].join(", ")}`
      );
    }
  }

  if (epcis.kbMaterialId !== undefined && epcis.kbMaterialId !== null) {
    const n = Number(epcis.kbMaterialId);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push("kbMaterialId must be a positive integer when present");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build TTL payload: always `epcis_supply_chain_event` + RDF source/confidence/materialReference.
 * `mappedAction` is returned separately for API consumers.
 */
export function epcisToTimelinePayload(
  epcis: EPCISEvent,
  eventId: string
): { payload: TimelineEventPayload; mappedAction: EPCISMappedActionType } {
  const actor = extractActor(epcis.sourceList);
  const kbFromPayload =
    epcis.kbMaterialId != null && Number.isFinite(Number(epcis.kbMaterialId))
      ? Math.floor(Number(epcis.kbMaterialId))
      : undefined;
  const epcFromList = epcis.epcList?.[0]?.trim();
  /** Prefer explicit KB id for `timeline:materialReference` so UI links to `/kb?focusMaterialId=`. */
  const materialRef =
    kbFromPayload != null && kbFromPayload > 0
      ? String(kbFromPayload)
      : epcFromList || undefined;
  const mappedAction = mapBizStepToMappedAction(epcis.bizStep);

  const humanNotes = formatEPCISHumanNotes(epcis);
  const human = humanNotes.join("\n");
  const jsonBlock = JSON.stringify(epcis);
  const message = `${human}${EPCIS_JSON_SEPARATOR}${jsonBlock}`;

  const epcisFields = buildTimelineEpcisFields(epcis);

  const payload: TimelineEventPayload = {
    eventId,
    timestampIso: epcis.eventTime.trim(),
    actorSystem: false,
    actorLabel: actor,
    eventAction: "epcis_supply_chain_event",
    message,
    source: "epcis",
    confidence: 0.95,
    ...(materialRef ? { materialReference: materialRef } : {}),
    epcisFields,
  };

  return { payload, mappedAction };
}

/** RDF-friendly snapshot of EPCIS fields (also drives graph property nodes). */
export function buildTimelineEpcisFields(epcis: EPCISEvent): TimelineEpcisFields {
  const f: TimelineEpcisFields = {
    eventType: epcis.type,
    gs1EventId: epcis.eventID?.trim(),
  };
  if (epcis.bizStep) f.bizStep = epcis.bizStep;
  if (epcis.disposition) f.disposition = epcis.disposition;
  if (epcis.action) f.captureAction = epcis.action;
  if (epcis.epcList?.length) f.epcListJson = JSON.stringify(epcis.epcList);
  if (epcis.quantityList?.length) f.quantityListJson = JSON.stringify(epcis.quantityList);
  if (epcis.sourceList?.length) f.sourceListJson = JSON.stringify(epcis.sourceList);
  if (epcis.destinationList?.length) f.destinationListJson = JSON.stringify(epcis.destinationList);
  if (epcis.readPoint?.id) f.readPointId = epcis.readPoint.id;
  if (epcis.bizLocation?.id) f.bizLocationId = epcis.bizLocation.id;
  return f;
}
