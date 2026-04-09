import * as $rdf from "rdflib";

import {
  TIMELINE_NS,
  type TimelineEventAction,
  isTimelineEventAction,
} from "@/lib/timeline-events-vocab";

const RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const TL = $rdf.Namespace(TIMELINE_NS);

/** MS Project / schedule import — optional structured literals on `timeline:AuditEvent`. */
export type TimelineScheduleFields = {
  taskUid?: string;
  taskName?: string;
  startIso?: string;
  finishIso?: string;
  percentComplete?: string;
  outlineNumber?: string;
  wbs?: string;
};

/** BCF 2.0 import — optional structured literals. */
export type TimelineBcfFields = {
  topicGuid?: string;
  /** First component GUID (backward compatible). */
  ifcGuid?: string;
  /** JSON string array of all `IfcGuid` values from the topic viewpoint (BCF 2.0). */
  bcfIfcGuidsJson?: string;
  sourceArchive?: string;
  verbalStatus?: string;
};

/** Bestek UI — one named IFC-type group. */
export type TimelineBestekBindingFields = {
  /** Shared UUID for all rows from one Save bindings (same as milestone `bestekBindingSaveBatchId`). */
  bindingBatchId?: string;
  groupId?: string;
  architectName?: string;
  /** EPD slug from material dictionary when architect selected a row */
  bestekMaterialSlug?: string;
  ifcType?: string;
  elementCount?: string;
  articleNumber?: string;
  /** e.g. m², m³, st, kg — opmetingsstaat unit */
  articleUnit?: string;
  articleQuantity?: string;
  /** Architect EUR unit price (same string as saved in bindings JSON). */
  articleUnitPriceEur?: string;
  approvedBrandsJson?: string;
  orEquivalent?: string;
};

/** Contractor product rows saved from deliveries bestek UI. */
export type TimelineProductCouplingFields = {
  couplingRowsJson?: string;
  couplingSignatureSha256?: string;
};

/** Belgian reference lifecycle milestone — `pid_reference_milestone` only. */
export type TimelinePidReferenceFields = {
  /** Optional process phase index as string `"0"`…`"9"` */
  lifecyclePhase?: string;
  /** Allowlisted key, e.g. `pid_opened` — see `timeline-pid-milestones.ts` */
  milestoneKey: string;
  /** Optional UI hint (OPENED, ACCUMULATING, …) — not authoritative state */
  stateHint?: string;
};

/** Stored project document — `document_original_stored` only; path is under `data/` for `/api/file`. */
export type TimelineDocumentStorageFields = {
  /** e.g. `<projectId>-documents/<eventId>/scan.pdf` — `GET /api/file?name=` */
  storedRelPath: string;
  originalFilename: string;
  byteLength: number;
  mimeType?: string;
  /** invoice | site_update | contract | photo | other */
  category?: string;
};

export function parseBcfIfcGuidsJsonField(raw?: string): string[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return [
      ...new Set(
        v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((s) => s.trim())
      ),
    ];
  } catch {
    return [];
  }
}

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
  scheduleFields?: TimelineScheduleFields;
  bcfFields?: TimelineBcfFields;
  bestekBindingFields?: TimelineBestekBindingFields;
  /** Present on `bestek_bindings_milestone` — same id as `bindingBatchId` on row events. */
  bestekBindingSaveBatchId?: string;
  productCouplingFields?: TimelineProductCouplingFields;
  pidReferenceFields?: TimelinePidReferenceFields;
  documentStorageFields?: TimelineDocumentStorageFields;
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
  scheduleFields?: TimelineScheduleFields;
  bcfFields?: TimelineBcfFields;
  bestekBindingFields?: TimelineBestekBindingFields;
  bestekBindingSaveBatchId?: string;
  productCouplingFields?: TimelineProductCouplingFields;
  pidReferenceFields?: TimelinePidReferenceFields;
  documentStorageFields?: TimelineDocumentStorageFields;
};

/** Round-trip parsed rows back into `TimelineEventPayload` for `timelineEventToTurtle`. */
export function parsedTimelineEventToPayload(ev: ParsedTimelineEvent): TimelineEventPayload {
  return {
    eventId: ev.eventId,
    timestampIso: ev.timestampIso,
    actorSystem: ev.actorSystem,
    actorLabel: ev.actorLabel,
    eventAction: ev.eventAction,
    ...(ev.message !== undefined && ev.message !== "" ? { message: ev.message } : {}),
    ...(ev.targetExpressId !== undefined ? { targetExpressId: ev.targetExpressId } : {}),
    ...(ev.source !== undefined && ev.source !== "" ? { source: ev.source } : {}),
    ...(ev.confidence !== undefined ? { confidence: ev.confidence } : {}),
    ...(ev.materialReference !== undefined && ev.materialReference !== ""
      ? { materialReference: ev.materialReference }
      : {}),
    ...(ev.epcisFields !== undefined ? { epcisFields: ev.epcisFields } : {}),
    ...(ev.scheduleFields !== undefined ? { scheduleFields: ev.scheduleFields } : {}),
    ...(ev.bcfFields !== undefined ? { bcfFields: ev.bcfFields } : {}),
    ...(ev.bestekBindingFields !== undefined ? { bestekBindingFields: ev.bestekBindingFields } : {}),
    ...(ev.bestekBindingSaveBatchId !== undefined && ev.bestekBindingSaveBatchId !== ""
      ? { bestekBindingSaveBatchId: ev.bestekBindingSaveBatchId }
      : {}),
    ...(ev.productCouplingFields !== undefined ? { productCouplingFields: ev.productCouplingFields } : {}),
    ...(ev.pidReferenceFields !== undefined ? { pidReferenceFields: ev.pidReferenceFields } : {}),
    ...(ev.documentStorageFields !== undefined ? { documentStorageFields: ev.documentStorageFields } : {}),
  };
}

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
  if (p.scheduleFields) {
    const s = p.scheduleFields;
    const addSch = (pred: string, val?: string) => {
      if (val === undefined) return;
      const t = val.trim();
      if (!t) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(t)}`);
    };
    addSch("scheduleTaskUid", s.taskUid);
    addSch("scheduleTaskName", s.taskName);
    addSch("scheduleStart", s.startIso);
    addSch("scheduleFinish", s.finishIso);
    addSch("schedulePercentComplete", s.percentComplete);
    addSch("scheduleOutlineNumber", s.outlineNumber);
    addSch("scheduleWbs", s.wbs);
  }
  if (p.bcfFields) {
    const b = p.bcfFields;
    const addB = (pred: string, val?: string) => {
      if (val === undefined) return;
      const t = val.trim();
      if (!t) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(t)}`);
    };
    addB("bcfTopicGuid", b.topicGuid);
    addB("bcfIfcGuid", b.ifcGuid);
    addB("bcfIfcGuidsJson", b.bcfIfcGuidsJson);
    addB("bcfSourceArchive", b.sourceArchive);
    addB("bcfVerbalStatus", b.verbalStatus);
  }
  if (p.bestekBindingFields) {
    const bk = p.bestekBindingFields;
    const addBk = (pred: string, val?: string) => {
      if (val === undefined) return;
      const s = val.trim();
      if (!s) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(s)}`);
    };
    addBk("bestekGroupId", bk.groupId);
    addBk("bestekArchitectName", bk.architectName);
    addBk("bestekMaterialSlug", bk.bestekMaterialSlug);
    addBk("bestekIfcType", bk.ifcType);
    addBk("bestekElementCount", bk.elementCount);
    addBk("bestekArticleNumber", bk.articleNumber);
    addBk("bestekArticleUnit", bk.articleUnit);
    addBk("bestekArticleQuantity", bk.articleQuantity);
    addBk("bestekArticleUnitPriceEur", bk.articleUnitPriceEur);
    addBk("bestekApprovedBrandsJson", bk.approvedBrandsJson);
    addBk("bestekOrEquivalent", bk.orEquivalent);
    addBk("bestekBindingBatchId", bk.bindingBatchId);
  }
  if (p.bestekBindingSaveBatchId !== undefined && p.bestekBindingSaveBatchId.trim()) {
    lines[lines.length - 1] += " ;";
    lines.push(
      `    timeline:bestekBindingSaveBatchId ${turtleString(p.bestekBindingSaveBatchId.trim())}`
    );
  }
  if (p.productCouplingFields) {
    const pc = p.productCouplingFields;
    const addPc = (pred: string, val?: string) => {
      if (val === undefined) return;
      const s = val.trim();
      if (!s) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(s)}`);
    };
    addPc("productCouplingRowsJson", pc.couplingRowsJson);
    addPc("productCouplingSignatureSha256", pc.couplingSignatureSha256);
  }
  if (p.pidReferenceFields) {
    const pr = p.pidReferenceFields;
    const addPr = (pred: string, val?: string) => {
      if (val === undefined) return;
      const s = val.trim();
      if (!s) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(s)}`);
    };
    addPr("pidLifecyclePhase", pr.lifecyclePhase);
    addPr("pidMilestoneKey", pr.milestoneKey);
    addPr("pidStateHint", pr.stateHint);
  }
  if (p.documentStorageFields) {
    const d = p.documentStorageFields;
    const addDoc = (pred: string, val?: string) => {
      if (val === undefined) return;
      const s = val.trim();
      if (!s) return;
      lines[lines.length - 1] += " ;";
      lines.push(`    timeline:${pred} ${turtleString(s)}`);
    };
    addDoc("documentStoredRelPath", d.storedRelPath);
    addDoc("documentOriginalFilename", d.originalFilename);
    if (Number.isFinite(d.byteLength) && d.byteLength >= 0) {
      lines[lines.length - 1] += " ;";
      lines.push(
        `    timeline:documentByteLength "${Math.floor(d.byteLength)}"^^xsd:integer`
      );
    }
    addDoc("documentMimeType", d.mimeType);
    addDoc("documentCategory", d.category);
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

/** Parsed instant for ascending sort; invalid / empty timestamps sink to the end. */
function timelineTimestampSortKeyAsc(iso: string): number {
  const t = Date.parse(iso.trim());
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Oldest-first (chronological); stable tie-break on `eventId` (ascending) when instants match. */
export function compareParsedTimelineEventsAsc(a: ParsedTimelineEvent, b: ParsedTimelineEvent): number {
  const diff =
    timelineTimestampSortKeyAsc(a.timestampIso) - timelineTimestampSortKeyAsc(b.timestampIso);
  if (diff !== 0) return diff;
  return a.eventId.localeCompare(b.eventId);
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

function parseScheduleFieldsFromStore(
  store: $rdf.Store,
  subj: unknown
): TimelineScheduleFields | undefined {
  const taskUid = lit(store, subj, TL("scheduleTaskUid"));
  const taskName = lit(store, subj, TL("scheduleTaskName"));
  const startIso = lit(store, subj, TL("scheduleStart"));
  const finishIso = lit(store, subj, TL("scheduleFinish"));
  const percentComplete = lit(store, subj, TL("schedulePercentComplete"));
  const outlineNumber = lit(store, subj, TL("scheduleOutlineNumber"));
  const wbs = lit(store, subj, TL("scheduleWbs"));
  if (
    !taskUid &&
    !taskName &&
    !startIso &&
    !finishIso &&
    !percentComplete &&
    !outlineNumber &&
    !wbs
  ) {
    return undefined;
  }
  const o: TimelineScheduleFields = {};
  if (taskUid) o.taskUid = taskUid;
  if (taskName) o.taskName = taskName;
  if (startIso) o.startIso = startIso;
  if (finishIso) o.finishIso = finishIso;
  if (percentComplete) o.percentComplete = percentComplete;
  if (outlineNumber) o.outlineNumber = outlineNumber;
  if (wbs) o.wbs = wbs;
  return o;
}

function parseBcfFieldsFromStore(store: $rdf.Store, subj: unknown): TimelineBcfFields | undefined {
  const topicGuid = lit(store, subj, TL("bcfTopicGuid"));
  const ifcGuid = lit(store, subj, TL("bcfIfcGuid"));
  const bcfIfcGuidsJson = lit(store, subj, TL("bcfIfcGuidsJson"));
  const sourceArchive = lit(store, subj, TL("bcfSourceArchive"));
  const verbalStatus = lit(store, subj, TL("bcfVerbalStatus"));
  if (!topicGuid && !ifcGuid && !bcfIfcGuidsJson && !sourceArchive && !verbalStatus) return undefined;
  const o: TimelineBcfFields = {};
  if (topicGuid) o.topicGuid = topicGuid;
  if (ifcGuid) o.ifcGuid = ifcGuid;
  if (bcfIfcGuidsJson) o.bcfIfcGuidsJson = bcfIfcGuidsJson;
  if (sourceArchive) o.sourceArchive = sourceArchive;
  if (verbalStatus) o.verbalStatus = verbalStatus;
  return o;
}

function parseBestekBindingFieldsFromStore(
  store: $rdf.Store,
  subj: unknown
): TimelineBestekBindingFields | undefined {
  const bindingBatchId = lit(store, subj, TL("bestekBindingBatchId"));
  const groupId = lit(store, subj, TL("bestekGroupId"));
  const architectName = lit(store, subj, TL("bestekArchitectName"));
  const bestekMaterialSlug = lit(store, subj, TL("bestekMaterialSlug"));
  const ifcType = lit(store, subj, TL("bestekIfcType"));
  const elementCount = lit(store, subj, TL("bestekElementCount"));
  const articleNumber = lit(store, subj, TL("bestekArticleNumber"));
  const articleUnit = lit(store, subj, TL("bestekArticleUnit"));
  const articleQuantity = lit(store, subj, TL("bestekArticleQuantity"));
  const articleUnitPriceEur = lit(store, subj, TL("bestekArticleUnitPriceEur"));
  const approvedBrandsJson = lit(store, subj, TL("bestekApprovedBrandsJson"));
  const orEquivalent = lit(store, subj, TL("bestekOrEquivalent"));
  if (
    !bindingBatchId &&
    !groupId &&
    !architectName &&
    !bestekMaterialSlug &&
    !ifcType &&
    !elementCount &&
    !articleNumber &&
    !articleUnit &&
    !articleQuantity &&
    !articleUnitPriceEur &&
    !approvedBrandsJson &&
    !orEquivalent
  ) {
    return undefined;
  }
  const o: TimelineBestekBindingFields = {};
  if (bindingBatchId) o.bindingBatchId = bindingBatchId;
  if (groupId) o.groupId = groupId;
  if (architectName) o.architectName = architectName;
  if (bestekMaterialSlug) o.bestekMaterialSlug = bestekMaterialSlug;
  if (ifcType) o.ifcType = ifcType;
  if (elementCount) o.elementCount = elementCount;
  if (articleNumber) o.articleNumber = articleNumber;
  if (articleUnit) o.articleUnit = articleUnit;
  if (articleQuantity) o.articleQuantity = articleQuantity;
  if (articleUnitPriceEur) o.articleUnitPriceEur = articleUnitPriceEur;
  if (approvedBrandsJson) o.approvedBrandsJson = approvedBrandsJson;
  if (orEquivalent) o.orEquivalent = orEquivalent;
  return o;
}

function parseProductCouplingFieldsFromStore(
  store: $rdf.Store,
  subj: unknown
): TimelineProductCouplingFields | undefined {
  const couplingRowsJson = lit(store, subj, TL("productCouplingRowsJson"));
  const couplingSignatureSha256 = lit(store, subj, TL("productCouplingSignatureSha256"));
  if (!couplingRowsJson && !couplingSignatureSha256) return undefined;
  const o: TimelineProductCouplingFields = {};
  if (couplingRowsJson) o.couplingRowsJson = couplingRowsJson;
  if (couplingSignatureSha256) o.couplingSignatureSha256 = couplingSignatureSha256;
  return o;
}

function parsePidReferenceFieldsFromStore(
  store: $rdf.Store,
  subj: unknown
): TimelinePidReferenceFields | undefined {
  const milestoneKey = lit(store, subj, TL("pidMilestoneKey"));
  const lifecyclePhase = lit(store, subj, TL("pidLifecyclePhase"));
  const stateHint = lit(store, subj, TL("pidStateHint"));
  if (!milestoneKey?.trim()) return undefined;
  const o: TimelinePidReferenceFields = { milestoneKey: milestoneKey.trim() };
  if (lifecyclePhase?.trim()) o.lifecyclePhase = lifecyclePhase.trim();
  if (stateHint?.trim()) o.stateHint = stateHint.trim();
  return o;
}

function parseDocumentStorageFieldsFromStore(
  store: $rdf.Store,
  subj: unknown
): TimelineDocumentStorageFields | undefined {
  const storedRelPath = lit(store, subj, TL("documentStoredRelPath"));
  const originalFilename = lit(store, subj, TL("documentOriginalFilename"));
  const byteLength = litInt(store, subj, TL("documentByteLength"));
  if (!storedRelPath?.trim() || !originalFilename?.trim() || byteLength === undefined) {
    return undefined;
  }
  const mimeType = lit(store, subj, TL("documentMimeType"));
  const category = lit(store, subj, TL("documentCategory"));
  const o: TimelineDocumentStorageFields = {
    storedRelPath: storedRelPath.trim(),
    originalFilename: originalFilename.trim(),
    byteLength,
  };
  if (mimeType?.trim()) o.mimeType = mimeType.trim();
  if (category?.trim()) o.category = category.trim();
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
    const scheduleFields = parseScheduleFieldsFromStore(store, subj);
    const bcfFields = parseBcfFieldsFromStore(store, subj);
    const bestekBindingFields = parseBestekBindingFieldsFromStore(store, subj);
    const productCouplingFields = parseProductCouplingFieldsFromStore(store, subj);
    const bestekBindingSaveBatchId = lit(store, subj, TL("bestekBindingSaveBatchId"));
    const pidReferenceFields = parsePidReferenceFieldsFromStore(store, subj);
    const documentStorageFields = parseDocumentStorageFieldsFromStore(store, subj);

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
      ...(scheduleFields ? { scheduleFields } : {}),
      ...(bcfFields ? { bcfFields } : {}),
      ...(bestekBindingFields ? { bestekBindingFields } : {}),
      ...(bestekBindingSaveBatchId ? { bestekBindingSaveBatchId } : {}),
      ...(productCouplingFields ? { productCouplingFields } : {}),
      ...(pidReferenceFields ? { pidReferenceFields } : {}),
      ...(documentStorageFields ? { documentStorageFields } : {}),
    });
  }

  out.sort(compareParsedTimelineEventsAsc);
  return out;
}
