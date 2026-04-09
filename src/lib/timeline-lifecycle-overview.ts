import {
  TIMELINE_EVENT_LABELS,
  isTimelineEventAction,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";
import {
  PID_MILESTONE_KEYS,
  PID_MILESTONE_LABELS,
  PID_MILESTONE_SHORT_LABELS,
  type PidMilestoneKey,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";
import {
  ACTOR_LANE_ORDER,
  actorLaneForTimelineEvent,
  type ActorLaneId,
} from "@/lib/timeline-actor-lanes";
import {
  parseCustomSlotLabelFromMessage,
  parseCustomSlotReferencePhaseFromMessage,
} from "@/lib/deliveries-pid-custom-slot-message";
import {
  REFERENCE_PHASE_IDS,
  REFERENCE_PHASE_LABELS,
  type ReferencePhaseId,
  isReferencePhaseId,
  milestoneKeysForPhase,
  PID_MILESTONE_REFERENCE_PHASE,
} from "@/lib/timeline-reference-phase";

const TEMPLATE_SEED_ID = "pid-template-seed";

/** Minimal event shape for pure derivation (client + server). */
export type LifecycleOverviewEvent = {
  eventId: string;
  timestampIso: string;
  actorSystem: boolean;
  actorLabel: string;
  eventAction: TimelineEventAction;
  message?: string;
  source?: string;
  bestekBindingSaveBatchId?: string;
  pidReferenceFields?: {
    milestoneKey?: string;
    lifecyclePhase?: string;
  };
};

/**
 * Human title for lifecycle matrix / dense lists: PID milestone uses {@link PID_MILESTONE_LABELS},
 * not the generic “PID / process milestone” string.
 */
function clipMatrixTitle(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function compactBestekBindingsLine(ev: LifecycleOverviewEvent): string {
  const msg = ev.message?.trim();
  const batch = ev.bestekBindingSaveBatchId?.trim();
  const batchFrag = batch ? `${batch.slice(0, 8)}…` : "";

  if (msg) {
    let s = msg.replace(/\s*data\/\S+\s*/gi, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/\bbatch\s+[0-9a-f-]{8}[0-9a-f-]*/gi, "").trim();
    const gr = s.match(/(\d+)\s*groep/i);
    const n = gr?.[1];
    if (n && batchFrag) return clipMatrixTitle(`Bestek · ${n} gr · ${batchFrag}`, 52);
    if (n) return clipMatrixTitle(`Bestek · ${n} gr${batchFrag ? ` · ${batchFrag}` : ""}`, 52);
    return clipMatrixTitle(s || TIMELINE_EVENT_LABELS.bestek_bindings_milestone, 48);
  }
  if (batchFrag) return `Bestek · ${batchFrag}`;
  return TIMELINE_EVENT_LABELS.bestek_bindings_milestone;
}

export function lifecycleMatrixEventTitle(ev: LifecycleOverviewEvent): string {
  const msg = ev.message?.trim();

  if (ev.eventAction === "manual_note" && msg) {
    const slotLabel = parseCustomSlotLabelFromMessage(msg);
    if (slotLabel) return slotLabel;
  }

  if (ev.eventAction === "pid_reference_milestone") {
    const mk = ev.pidReferenceFields?.milestoneKey;
    if (mk && isPidMilestoneKey(mk)) return PID_MILESTONE_LABELS[mk];
    if (msg) return msg;
    return TIMELINE_EVENT_LABELS.pid_reference_milestone;
  }

  if (ev.eventAction === "bestek_bindings_milestone") {
    if (msg) return msg;
    const batch = ev.bestekBindingSaveBatchId?.trim();
    if (batch) return `${TIMELINE_EVENT_LABELS.bestek_bindings_milestone} · ${batch}`;
    return TIMELINE_EVENT_LABELS.bestek_bindings_milestone;
  }

  if (msg) return msg;

  if (isTimelineEventAction(ev.eventAction)) {
    return TIMELINE_EVENT_LABELS[ev.eventAction];
  }
  return ev.eventAction;
}

/** One-line caption for dense grids; full prose stays in {@link lifecycleMatrixEventTitle}. */
export function lifecycleMatrixEventTitleShort(ev: LifecycleOverviewEvent): string {
  if (ev.eventAction === "manual_note") {
    const msg = ev.message?.trim();
    if (msg) {
      const slotLabel = parseCustomSlotLabelFromMessage(msg);
      if (slotLabel) return clipMatrixTitle(slotLabel, 48);
    }
  }

  if (ev.eventAction === "pid_reference_milestone") {
    const mk = ev.pidReferenceFields?.milestoneKey;
    if (mk && isPidMilestoneKey(mk)) return PID_MILESTONE_SHORT_LABELS[mk];
    const msg = ev.message?.trim();
    if (msg) return clipMatrixTitle(msg, 40);
    return TIMELINE_EVENT_LABELS.pid_reference_milestone;
  }

  if (ev.eventAction === "bestek_bindings_milestone") {
    return compactBestekBindingsLine(ev);
  }

  return clipMatrixTitle(lifecycleMatrixEventTitle(ev), 48);
}

/**
 * Compact glyph for the lifecycle swimlane matrix — full labels stay in tooltips
 * ({@link lifecycleMatrixEventTitle}).
 */
export type LifecycleMatrixEventIconKind =
  | "document"
  | "ifc_model"
  | "pipeline"
  | "milestone"
  | "bestek"
  | "product"
  | "note"
  | "site"
  | "evidence"
  | "export"
  | "compliance"
  | "schedule"
  | "bcf"
  | "supply"
  | "calc"
  | "generic";

export function lifecycleMatrixEventIconKind(ev: LifecycleOverviewEvent): LifecycleMatrixEventIconKind {
  switch (ev.eventAction) {
    case "document_original_stored":
    case "document_reference_logged":
    case "delivery_document_added":
      return "document";
    case "model_imported":
      return "ifc_model";
    case "parse_enrich_completed":
    case "kb_built":
      return "pipeline";
    case "pid_reference_milestone":
      return "milestone";
    case "bestek_bindings_milestone":
    case "bestek_element_group_binding":
      return "bestek";
    case "product_coupling_updated":
      return "product";
    case "manual_note":
      return "note";
    case "site_report_added":
      return "site";
    case "evidence_linked":
      return "evidence";
    case "data_exported":
      return "export";
    case "compliance_evaluation_recorded":
      return "compliance";
    case "epcis_supply_chain_event":
      return "supply";
    case "construction_schedule_task":
      return "schedule";
    case "bcf_coordination_event":
      return "bcf";
    case "calculation_run":
      return "calc";
    default:
      return "generic";
  }
}

/** Chronological “now” row: last past/today before future-only tail, else closest instant to wall clock. */
export function timelineJumpToNowEventId(events: LifecycleOverviewEvent[]): string | null {
  if (events.length === 0) return null;

  function calendarDayTense(iso: string): "past" | "today" | "future" | "unknown" {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    const startOf = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const evT = startOf(d);
    const todayT = startOf(new Date());
    if (evT < todayT) return "past";
    if (evT > todayT) return "future";
    return "today";
  }

  let lastPastOrToday: string | null = null;
  for (const ev of events) {
    const tense = calendarDayTense(ev.timestampIso);
    if (tense === "today" || tense === "past") {
      lastPastOrToday = ev.eventId;
    }
  }
  if (lastPastOrToday) return lastPastOrToday;

  const nowMs = Date.now();
  let bestId: string | null = null;
  let bestAbs = Infinity;
  for (const ev of events) {
    const t = Date.parse(ev.timestampIso);
    if (Number.isNaN(t)) continue;
    const abs = Math.abs(t - nowMs);
    if (abs < bestAbs) {
      bestAbs = abs;
      bestId = ev.eventId;
    }
  }
  return bestId;
}

function tsMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Human-readable actor line for UI and lifecycle phase histograms.
 * Template-seeded rows use `actorLabel` + `source` both `pid-template-seed` — show once, plainly.
 */
export function lifecycleActorDisplayLabel(ev: {
  actorSystem: boolean;
  actorLabel: string;
  source?: string;
}): string {
  if (ev.actorSystem) return "System";
  const label = (ev.actorLabel ?? "").trim();
  const src = (ev.source ?? "").trim();

  if (
    (label === TEMPLATE_SEED_ID && src === TEMPLATE_SEED_ID) ||
    (label === TEMPLATE_SEED_ID && !src) ||
    (!label && src === TEMPLATE_SEED_ID)
  ) {
    return "Template seed (synthetic spacing)";
  }

  if (label && src && label === src) return label;
  if (label && src) return `${label} · ${src}`;
  return label || src || "—";
}

/**
 * Heuristic: non-PID actions bucketed into a reference phase for “other activity”.
 * Plain `manual_note` stays unassigned; structured Deliveries custom-slot bodies carry `phase:` for bucketing.
 */
const ACTION_REFERENCE_PHASE: Partial<Record<TimelineEventAction, ReferencePhaseId>> = {
  model_imported: "0",
  parse_enrich_completed: "0",
  kb_built: "0",
  bestek_element_group_binding: "0",
  bestek_bindings_milestone: "0",
  /** Phase-2 checklist slot “Product ↔ bestek coupling”; same event type as design-time saves. */
  product_coupling_updated: "2",
  calculation_run: "0",
  /** Completion / handover — aligns with phase 3 checklist slot “Compliance evaluation”. */
  compliance_evaluation_recorded: "3",
  delivery_document_added: "2",
  document_reference_logged: "2",
  document_original_stored: "2",
  site_report_added: "2",
  epcis_supply_chain_event: "2",
  evidence_linked: "2",
  construction_schedule_task: "2",
  bcf_coordination_event: "2",
  data_exported: "3",
};

export function eventReferencePhase(ev: LifecycleOverviewEvent): ReferencePhaseId | null {
  if (ev.eventAction === "pid_reference_milestone") {
    const raw = ev.pidReferenceFields?.lifecyclePhase?.trim() ?? "";
    if (raw && isReferencePhaseId(raw)) return raw;
    const mk = ev.pidReferenceFields?.milestoneKey;
    if (mk && isPidMilestoneKey(mk)) return PID_MILESTONE_REFERENCE_PHASE[mk];
    return "0";
  }
  if (ev.eventAction === "manual_note") {
    const fromSlot = parseCustomSlotReferencePhaseFromMessage(ev.message ?? "");
    if (fromSlot != null) return fromSlot;
    return null;
  }
  return ACTION_REFERENCE_PHASE[ev.eventAction] ?? null;
}

export type MilestoneCoverageStatus = "missing" | "template_only" | "real";

export type MilestoneCoverage = {
  key: PidMilestoneKey;
  label: string;
  status: MilestoneCoverageStatus;
  latestIso?: string;
  latestEventId?: string;
  latestIsTemplate: boolean;
};

export type PhaseLifecycleRow = {
  phase: ReferencePhaseId;
  phaseLabel: string;
  milestones: MilestoneCoverage[];
  /** Non-PID events (and unassigned) counted toward this phase only via heuristic. */
  otherEventCount: number;
  /** Event counts by fixed lane ({@link actorLaneForTimelineEvent}), non-zero only. */
  actorLanes: { lane: ActorLaneId; count: number }[];
};

export type LifecycleOverviewResult = {
  phases: PhaseLifecycleRow[];
  unassignedEventCount: number;
  /** Phases that contain `nowEventId` when provided (for highlight). */
  nowPhases: ReferencePhaseId[];
};

function milestoneStatusForKey(
  key: PidMilestoneKey,
  pidEvents: LifecycleOverviewEvent[]
): MilestoneCoverage {
  const rows = pidEvents
    .filter(
      (e) =>
        e.eventAction === "pid_reference_milestone" &&
        e.pidReferenceFields?.milestoneKey === key
    )
    .sort((a, b) => tsMs(a.timestampIso) - tsMs(b.timestampIso));

  if (rows.length === 0) {
    return {
      key,
      label: PID_MILESTONE_LABELS[key],
      status: "missing",
      latestIsTemplate: false,
    };
  }

  const latest = rows[rows.length - 1]!;
  const hasReal = rows.some((e) => (e.source ?? "").trim() !== TEMPLATE_SEED_ID);
  const allTemplate = rows.every((e) => (e.source ?? "").trim() === TEMPLATE_SEED_ID);
  const status: MilestoneCoverageStatus = hasReal
    ? "real"
    : allTemplate
      ? "template_only"
      : "real";

  return {
    key,
    label: PID_MILESTONE_LABELS[key],
    status,
    latestIso: latest.timestampIso,
    latestEventId: latest.eventId,
    latestIsTemplate: (latest.source ?? "").trim() === TEMPLATE_SEED_ID,
  };
}

/**
 * Build phase rows + milestone coverage + per-phase actor histogram from the append-only log.
 */
export function buildLifecycleOverview(
  events: LifecycleOverviewEvent[],
  opts?: { nowEventId?: string | null }
): LifecycleOverviewResult {
  const pidRows = events.filter((e) => e.eventAction === "pid_reference_milestone");

  const phaseLanes = new Map<ReferencePhaseId, Map<ActorLaneId, number>>();
  for (const id of REFERENCE_PHASE_IDS) {
    const inner = new Map<ActorLaneId, number>();
    for (const lane of ACTOR_LANE_ORDER) inner.set(lane, 0);
    phaseLanes.set(id, inner);
  }

  let unassigned = 0;
  for (const ev of events) {
    const phase = eventReferencePhase(ev);
    if (phase == null) {
      unassigned += 1;
      continue;
    }
    const m = phaseLanes.get(phase);
    if (!m) continue;
    const lane = actorLaneForTimelineEvent(ev);
    m.set(lane, (m.get(lane) ?? 0) + 1);
  }

  const nowId = opts?.nowEventId?.trim() || null;
  const nowPhases: ReferencePhaseId[] = [];
  if (nowId) {
    const hit = events.find((e) => e.eventId === nowId);
    const p = hit ? eventReferencePhase(hit) : null;
    if (p) nowPhases.push(p);
  }

  const phases: PhaseLifecycleRow[] = REFERENCE_PHASE_IDS.map((phase) => {
    const keys = milestoneKeysForPhase(phase);
    const milestones = keys.map((k) => milestoneStatusForKey(k, pidRows));

    const otherEventCount = events.filter((e) => {
      if (e.eventAction === "pid_reference_milestone") return false;
      return eventReferencePhase(e) === phase;
    }).length;

    const laneMap = phaseLanes.get(phase)!;
    const actorLanes = ACTOR_LANE_ORDER.map((lane) => ({
      lane,
      count: laneMap.get(lane) ?? 0,
    })).filter((x) => x.count > 0);

    return {
      phase,
      phaseLabel: REFERENCE_PHASE_LABELS[phase],
      milestones,
      otherEventCount,
      actorLanes,
    };
  });

  return { phases, unassignedEventCount: unassigned, nowPhases };
}

/** Rows: phases 0–9 + unassigned. Columns: distinct `eventAction` values (sorted). For `/timeline?view=lifecycle` probe UI. */
export type LifecyclePhaseActionMatrix = {
  columnActions: string[];
  /** One row per phase, then final row for unassigned */
  rowLabels: { phase: ReferencePhaseId | "unassigned"; shortLabel: string }[];
  /** grid[row][col] */
  grid: number[][];
};

/**
 * **Actor swimlanes × phase**: one row per fixed lane (Bouwheer / Architect / Construction / Other),
 * columns = reference phases 0–9 plus unassigned. Same counting rules as {@link buildLifecycleOverview}
 * (`eventReferencePhase` + `actorLaneForTimelineEvent`).
 */
export type LifecycleActorPhaseCell = {
  /** Chronological within cell */
  events: LifecycleOverviewEvent[];
};

export type LifecycleActorPhaseMatrix = {
  rowLanes: ActorLaneId[];
  /** Phases 0–9, then `"unassigned"` */
  columnKeys: (ReferencePhaseId | "unassigned")[];
  /** Full labels for `title=` on column headers */
  columnTitles: string[];
  /** cells[laneIndex][colIndex] */
  cells: LifecycleActorPhaseCell[][];
};

export function buildLifecycleActorPhaseMatrix(
  events: LifecycleOverviewEvent[]
): LifecycleActorPhaseMatrix {
  const rowLanes: ActorLaneId[] = [...ACTOR_LANE_ORDER];
  const columnKeys: (ReferencePhaseId | "unassigned")[] = [
    ...REFERENCE_PHASE_IDS,
    "unassigned",
  ];
  const columnTitles = [
    ...REFERENCE_PHASE_IDS.map(
      (p) => `Phase ${p} — ${REFERENCE_PHASE_LABELS[p]}`
    ),
    "Unassigned — event not mapped to a reference phase",
  ];
  const cells: LifecycleActorPhaseCell[][] = rowLanes.map(() =>
    columnKeys.map(() => ({ events: [] as LifecycleOverviewEvent[] }))
  );

  for (const ev of events) {
    const lane = actorLaneForTimelineEvent(ev);
    const phase = eventReferencePhase(ev);
    const colIdx =
      phase == null ? columnKeys.length - 1 : REFERENCE_PHASE_IDS.indexOf(phase);
    if (colIdx < 0) continue;
    const rowIdx = rowLanes.indexOf(lane);
    if (rowIdx < 0) continue;
    cells[rowIdx]![colIdx]!.events.push(ev);
  }

  const ts = (iso: string) => Date.parse(iso) || 0;
  for (const row of cells) {
    for (const cell of row) {
      cell.events.sort((a, b) => ts(a.timestampIso) - ts(b.timestampIso));
    }
  }

  return { rowLanes, columnKeys, columnTitles, cells };
}

export function buildLifecyclePhaseActionMatrix(
  events: LifecycleOverviewEvent[]
): LifecyclePhaseActionMatrix {
  const actionsInData = new Set<string>();
  for (const ev of events) actionsInData.add(ev.eventAction);
  const columnActions = [...actionsInData].sort();

  const rowLabels: LifecyclePhaseActionMatrix["rowLabels"] = [
    ...REFERENCE_PHASE_IDS.map((p) => ({
      phase: p,
      shortLabel: `${p} · ${REFERENCE_PHASE_LABELS[p]}`,
    })),
    { phase: "unassigned", shortLabel: "— · Unassigned" },
  ];

  const grid = rowLabels.map(() => columnActions.map(() => 0));

  for (const ev of events) {
    const phase = eventReferencePhase(ev);
    const rowIdx =
      phase == null ? rowLabels.length - 1 : REFERENCE_PHASE_IDS.indexOf(phase);
    if (rowIdx < 0) continue;
    const colIdx = columnActions.indexOf(ev.eventAction);
    if (colIdx < 0) continue;
    grid[rowIdx]![colIdx]! += 1;
  }

  return { columnActions, rowLabels, grid };
}

export type LifecyclePhaseEventBuckets = {
  phases: Array<{
    phase: ReferencePhaseId;
    phaseLabel: string;
    events: LifecycleOverviewEvent[];
  }>;
  unassigned: LifecycleOverviewEvent[];
};

/** Every event placed in exactly one bucket: reference phase or unassigned. Chronological within bucket. */
export function groupLifecycleEventsByPhase(
  events: LifecycleOverviewEvent[]
): LifecyclePhaseEventBuckets {
  const unassigned: LifecycleOverviewEvent[] = [];
  const byPhase = new Map<ReferencePhaseId, LifecycleOverviewEvent[]>();
  for (const id of REFERENCE_PHASE_IDS) {
    byPhase.set(id, []);
  }

  for (const ev of events) {
    const p = eventReferencePhase(ev);
    if (p == null) {
      unassigned.push(ev);
      continue;
    }
    byPhase.get(p)!.push(ev);
  }

  const phases = REFERENCE_PHASE_IDS.map((phase) => ({
    phase,
    phaseLabel: REFERENCE_PHASE_LABELS[phase],
    events: (byPhase.get(phase) ?? []).sort((a, b) => tsMs(a.timestampIso) - tsMs(b.timestampIso)),
  }));

  unassigned.sort((a, b) => tsMs(a.timestampIso) - tsMs(b.timestampIso));
  return { phases, unassigned };
}

export type PhaseBucketTabId = ReferencePhaseId | "unassigned";

/** Which By-phase tab contains this `eventId`, if any. */
export function phaseBucketTabForEventId(
  eventId: string,
  buckets: LifecyclePhaseEventBuckets
): PhaseBucketTabId | null {
  for (const p of buckets.phases) {
    if (p.events.some((e) => e.eventId === eventId)) return p.phase;
  }
  if (buckets.unassigned.some((e) => e.eventId === eventId)) return "unassigned";
  return null;
}
