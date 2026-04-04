import * as $rdf from "rdflib";

import {
  TIMELINE_NS,
  type TimelineEventAction,
  isTimelineEventAction,
} from "@/lib/timeline-events-vocab";

const RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const TL = $rdf.Namespace(TIMELINE_NS);

/** Structured GS1 EPCIS fields stored as separate `timeline:*` literals (queryable + graph UI). */
export type TimelineEpcisFields = {
  eventType?: string;
  gs1EventId?: string;
  bizStep?: string;
  disposition?: string;
  /** EPCIS `action` (e.g. ADD), not timeline vocabulary */
  captureAction?: string;
  epcListJson?: string;
  quantityListJson?: string;
  sourceListJson?: string;
  destinationListJson?: string;
  readPointId?: string;
  bizLocationId?: string;
};

export type TimelineEventPayload = {
  eventId: string;
  timestampIso: string;
  actorSystem: boolean;
  actorLabel: string;
  eventAction: TimelineEventAction;
  message?: string;
  targetExpressId?: number;
  /** Provenance, e.g. `epcis` for automated ingest */
  source?: string;
  /** 0–1 structured-data confidence (EPCIS default 0.95) */
  confidence?: number;
  /** Primary EPC / product instance URI from EPCIS */
  materialReference?: string;
  /** When set (EPCIS ingest), mirrored as dedicated RDF predicates */
  epcisFields?: TimelineEpcisFields;
};

export type ParsedTimelineEvent = {
  uri: string;
  eventId: string;
  timestampIso: string;
  actorSystem: boolean;
  actorLabel: string;
  eventAction: TimelineEventAction;
  message?: string;
  targetExpressId?: number;
  source?: string;
  confidence?: number;
  materialReference?: string;
  epcisFields?: TimelineEpcisFields;
};

function turtleString(s: string): string {
  return JSON.stringify(s);
}

/**
 * One `timeline:AuditEvent` resource; prefixes not included.
 */
export function timelineEventToTurtle(p: TimelineEventPayload): string {
  const node = `timeline:event-${p.eventId}`;
  const actorBool = p.actorSystem ? '"true"^^xsd:boolean' : '"false"^^xsd:boolean';
  const lines: string[] = [
    `${node}`,
    `    a timeline:AuditEvent ;`,
    `    timeline:eventId ${turtleString(p.eventId)} ;`,
    `    timeline:timestamp ${turtleString(p.timestampIso)}^^xsd:dateTime ;`,
    `    timeline:actorSystem ${actorBool} ;`,
    `    timeline:actorLabel ${turtleString(p.actorLabel)} ;`,
    `    timeline:eventAction ${turtleString(p.eventAction)}`,
  ];
  if (p.message !== undefined && p.message.trim()) {
    lines[lines.length - 1] += " ;";
    lines.push(`    timeline:message ${turtleString(p.message.trim())}`);
  }
  if (p.targetExpressId !== undefined && Number.isFinite(p.targetExpressId)) {
    lines[lines.length - 1] += " ;";
    lines.push(
      `    timeline:targetExpressId "${Math.floor(p.targetExpressId)}"^^xsd:integer`
    );
  }
  if (p.source !== undefined && p.source.trim()) {
    lines[lines.length - 1] += " ;";
    lines.push(`    timeline:source ${turtleString(p.source.trim())}`);
  }
  if (p.confidence !== undefined && Number.isFinite(p.confidence)) {
    lines[lines.length - 1] += " ;";
    const c = Math.round(p.confidence * 100) / 100;
    lines.push(`    timeline:confidence "${c}"^^xsd:decimal`);
  }
  if (p.materialReference !== undefined && p.materialReference.trim()) {
    lines[lines.length - 1] += " ;";
    lines.push(`    timeline:materialReference ${turtleString(p.materialReference.trim())}`);
  }
  if (p.epcisFields) {
    const e = p.epcisFields;
    const addStr = (pred: string, val?: string) => {
      if (val === undefined) return;
      const t = val.trim();
      if (!t) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(t)}`);
    };
    addStr("epcisEventType", e.eventType);
    addStr("epcisGs1EventId", e.gs1EventId);
    addStr("epcisBizStep", e.bizStep);
    addStr("epcisDisposition", e.disposition);
    addStr("epcisCaptureAction", e.captureAction);
    addStr("epcisEpcListJson", e.epcListJson);
    addStr("epcisQuantityListJson", e.quantityListJson);
    addStr("epcisSourceListJson", e.sourceListJson);
    addStr("epcisDestinationListJson", e.destinationListJson);
    addStr("epcisReadPointId", e.readPointId);
    addStr("epcisBizLocationId", e.bizLocationId);
  }
  lines[lines.length - 1] += " .";
  return `${lines.join("\n")}\n`;
}

export function timelineFilePrefixes(): string {
  return `@prefix timeline: <${TIMELINE_NS}> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

`;
}

function lit(store: $rdf.Store, subj: unknown, pred: unknown): string | undefined {
  const t = store.any(subj as any, pred as any, null);
  return t?.value;
}

function litBool(store: $rdf.Store, subj: unknown, pred: unknown): boolean {
  const v = lit(store, subj, pred);
  return v === "true" || v === "1";
}

function litInt(store: $rdf.Store, subj: unknown, pred: unknown): number | undefined {
  const v = lit(store, subj, pred);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function litDecimal(store: $rdf.Store, subj: unknown, pred: unknown): number | undefined {
  return litInt(store, subj, pred);
}

function parseEpcisFieldsFromStore(
  store: $rdf.Store,
  subj: unknown
): TimelineEpcisFields | undefined {
  const eventType = lit(store, subj, TL("epcisEventType"));
  const gs1EventId = lit(store, subj, TL("epcisGs1EventId"));
  const bizStep = lit(store, subj, TL("epcisBizStep"));
  const disposition = lit(store, subj, TL("epcisDisposition"));
  const captureAction = lit(store, subj, TL("epcisCaptureAction"));
  const epcListJson = lit(store, subj, TL("epcisEpcListJson"));
  const quantityListJson = lit(store, subj, TL("epcisQuantityListJson"));
  const sourceListJson = lit(store, subj, TL("epcisSourceListJson"));
  const destinationListJson = lit(store, subj, TL("epcisDestinationListJson"));
  const readPointId = lit(store, subj, TL("epcisReadPointId"));
  const bizLocationId = lit(store, subj, TL("epcisBizLocationId"));

  if (
    !eventType &&
    !gs1EventId &&
    !bizStep &&
    !disposition &&
    !captureAction &&
    !epcListJson &&
    !quantityListJson &&
    !sourceListJson &&
    !destinationListJson &&
    !readPointId &&
    !bizLocationId
  ) {
    return undefined;
  }

  const o: TimelineEpcisFields = {};
  if (eventType) o.eventType = eventType;
  if (gs1EventId) o.gs1EventId = gs1EventId;
  if (bizStep) o.bizStep = bizStep;
  if (disposition) o.disposition = disposition;
  if (captureAction) o.captureAction = captureAction;
  if (epcListJson) o.epcListJson = epcListJson;
  if (quantityListJson) o.quantityListJson = quantityListJson;
  if (sourceListJson) o.sourceListJson = sourceListJson;
  if (destinationListJson) o.destinationListJson = destinationListJson;
  if (readPointId) o.readPointId = readPointId;
  if (bizLocationId) o.bizLocationId = bizLocationId;
  return o;
}

/**
 * Best-effort parse of `data/<projectId>-timeline.ttl` for listing in UI.
 */
export function parseTimelineTtl(ttl: string): ParsedTimelineEvent[] {
  if (!ttl.trim()) return [];

  const store = $rdf.graph();
  try {
    $rdf.parse(ttl, store, TIMELINE_NS, "text/turtle");
  } catch {
    return [];
  }

  const typeNode = TL("AuditEvent");
  const stmts = store.statementsMatching(null as any, RDF("type"), typeNode);

  const seen = new Set<string>();
  const out: ParsedTimelineEvent[] = [];

  for (const st of stmts) {
    const subj = st.subject;
    const key = subj.value;
    if (seen.has(key)) continue;
    seen.add(key);

    const eventId = lit(store, subj, TL("eventId")) ?? "";
    const timestampIso = lit(store, subj, TL("timestamp")) ?? "";
    const actorLabel = lit(store, subj, TL("actorLabel")) ?? "";
    const actorSystem = litBool(store, subj, TL("actorSystem"));
    const actionRaw = lit(store, subj, TL("eventAction")) ?? "";
    if (!isTimelineEventAction(actionRaw)) continue;

    const message = lit(store, subj, TL("message"));
    const targetExpressId = litInt(store, subj, TL("targetExpressId"));
    const source = lit(store, subj, TL("source"));
    const confidence = litDecimal(store, subj, TL("confidence"));
    const materialReference = lit(store, subj, TL("materialReference"));
    const epcisFields = parseEpcisFieldsFromStore(store, subj);

    out.push({
      uri: key,
      eventId,
      timestampIso,
      actorSystem,
      actorLabel,
      eventAction: actionRaw,
      ...(message ? { message } : {}),
      ...(targetExpressId !== undefined ? { targetExpressId } : {}),
      ...(source ? { source } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(materialReference ? { materialReference } : {}),
      ...(epcisFields ? { epcisFields } : {}),
    });
  }

  out.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
  return out;
}
