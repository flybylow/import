/**
 * Workflow dashboard: traceability readiness rows (three lanes + optional sidecar).
 * Server: `GET /api/workflow/readiness`. Spec: `docs/workflow-readiness.md`.
 */

export type ReadinessLaneId = "technical" | "audit" | "bestek" | "compliance" | "reference";

export type ReadinessStatus = "done" | "partial" | "missing" | "optional";

export type WorkflowReadinessRow = {
  id: string;
  lane: ReadinessLaneId;
  label: string;
  detail?: string;
  status: ReadinessStatus;
  /** Relative under repo root, e.g. `data/foo-timeline.ttl` */
  artifactPath?: string;
  /** In-app or external link */
  href?: string;
};

export type WorkflowReadinessSidecarV1 = {
  version?: 1;
  /** Shown above the table on the dashboard */
  notes?: string;
  /** Extra rows (e.g. project-specific documents). Status is explicit — not inferred from disk. */
  extraRows?: Array<{
    id: string;
    lane: ReadinessLaneId;
    label: string;
    detail?: string;
    status: ReadinessStatus;
    href?: string;
    artifactPath?: string;
  }>;
};

/** Count `timeline:AuditEvent` blocks in Turtle (prefix-agnostic: matches `a timeline:AuditEvent`). */
export function countTimelineAuditEventsInTurtle(content: string): number {
  if (!content.trim()) return 0;
  const re = /\ba\s+timeline:AuditEvent\b/g;
  const m = content.match(re);
  return m?.length ?? 0;
}

export type ReadinessFileSnap = {
  relativePath: string;
  exists: boolean;
  byteSize?: number;
};

function row(
  r: Omit<WorkflowReadinessRow, "lane"> & { lane: ReadinessLaneId }
): WorkflowReadinessRow {
  return r;
}

/**
 * Build default readiness rows from on-disk snapshots + timeline parse count.
 * Does not read sidecar; merge `extraRows` in the API route after validation.
 */
export function buildWorkflowReadinessRows(input: {
  projectId: string;
  timelineAuditEventCount: number;
  files: {
    ifc: ReadinessFileSnap;
    parsedTtl: ReadinessFileSnap;
    enrichedTtl: ReadinessFileSnap;
    kbTtl: ReadinessFileSnap;
    calcJson: ReadinessFileSnap;
    timelineTtl: ReadinessFileSnap;
    deliveriesTtl: ReadinessFileSnap;
    phase0Groups: ReadinessFileSnap;
    bestekBindings: ReadinessFileSnap;
    bestekMatching: ReadinessFileSnap;
    productCoupling: ReadinessFileSnap;
    complianceEvents: ReadinessFileSnap;
    scheduleLinks: ReadinessFileSnap;
  };
}): WorkflowReadinessRow[] {
  const { projectId, timelineAuditEventCount, files: f } = input;
  const pid = projectId;

  const technical: WorkflowReadinessRow[] = [
    row({
      id: "tech-ifc",
      lane: "technical",
      label: "IFC model on disk",
      status: f.ifc.exists ? "done" : "missing",
      artifactPath: f.ifc.relativePath,
      href: `/bim?projectId=${encodeURIComponent(pid)}&view=building`,
    }),
    row({
      id: "tech-parsed",
      lane: "technical",
      label: "Parsed graph (Phase 1)",
      status: f.parsedTtl.exists ? "done" : "missing",
      artifactPath: f.parsedTtl.relativePath,
      href: `/`,
    }),
    row({
      id: "tech-enriched",
      lane: "technical",
      label: "Enriched graph (quantities / layers)",
      status: f.enrichedTtl.exists ? "done" : f.parsedTtl.exists ? "partial" : "missing",
      detail: f.enrichedTtl.exists ? undefined : "Run enrich after parse",
      artifactPath: f.enrichedTtl.relativePath,
      href: `/`,
    }),
    row({
      id: "tech-kb",
      lane: "technical",
      label: "Knowledge base (materials → EPD)",
      status: f.kbTtl.exists ? "done" : f.enrichedTtl.exists ? "partial" : "missing",
      artifactPath: f.kbTtl.relativePath,
      href: `/kb?projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "tech-calc",
      lane: "technical",
      label: "Latest carbon calculation (JSON)",
      status: f.calcJson.exists ? "done" : f.kbTtl.exists ? "partial" : "missing",
      artifactPath: f.calcJson.relativePath,
      href: `/calculate?projectId=${encodeURIComponent(pid)}`,
    }),
  ];

  const timelineDone = f.timelineTtl.exists && timelineAuditEventCount > 0;
  const timelinePartial = f.timelineTtl.exists && timelineAuditEventCount === 0;

  const audit: WorkflowReadinessRow[] = [
    row({
      id: "audit-file",
      lane: "audit",
      label: "Audit timeline file",
      status: f.timelineTtl.exists ? "done" : "missing",
      detail: f.timelineTtl.exists ? `${timelineAuditEventCount} AuditEvent(s)` : "data/<projectId>-timeline.ttl",
      artifactPath: f.timelineTtl.relativePath,
      href: `/timeline?projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "audit-events",
      lane: "audit",
      label: "Timeline populated (≥1 event)",
      status: timelineDone ? "done" : timelinePartial ? "partial" : f.timelineTtl.exists ? "partial" : "missing",
      detail: "Includes EPCIS (`epcis_supply_chain_event`), deliveries, schedule, BCF, bestek saves — see docs",
      href: `/timeline?projectId=${encodeURIComponent(pid)}`,
    }),
  ];

  const bestek: WorkflowReadinessRow[] = [
    row({
      id: "bestek-phase0",
      lane: "bestek",
      label: "IFC element groups (phase 0 JSON)",
      status: f.phase0Groups.exists ? "done" : "optional",
      artifactPath: f.phase0Groups.relativePath,
      href: `/deliveries?tab=specification&projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "bestek-bindings",
      lane: "bestek",
      label: "Bestek bindings (architect)",
      status: f.bestekBindings.exists ? "done" : "optional",
      artifactPath: f.bestekBindings.relativePath,
      href: `/deliveries?tab=specification&projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "bestek-matching",
      lane: "bestek",
      label: "Bestek ↔ material matching",
      status: f.bestekMatching.exists ? "done" : "optional",
      artifactPath: f.bestekMatching.relativePath,
      href: `/deliveries/match-materials?projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "bestek-deliveries-ttl",
      lane: "bestek",
      label: "Deliveries RDF (leveringsbon lines)",
      status: f.deliveriesTtl.exists ? "done" : "optional",
      artifactPath: f.deliveriesTtl.relativePath,
      href: `/deliveries?tab=ingest&projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "bestek-coupling",
      lane: "bestek",
      label: "Product coupling (contractor)",
      status: f.productCoupling.exists ? "done" : "optional",
      artifactPath: f.productCoupling.relativePath,
      href: `/deliveries?tab=specification&projectId=${encodeURIComponent(pid)}`,
    }),
  ];

  const compliance: WorkflowReadinessRow[] = [
    row({
      id: "compliance-ttl",
      lane: "compliance",
      label: "Compliance run history (TTL)",
      status: f.complianceEvents.exists ? "done" : "optional",
      artifactPath: f.complianceEvents.relativePath,
      href: `/calculate?projectId=${encodeURIComponent(pid)}`,
    }),
    row({
      id: "compliance-schedule-links",
      lane: "compliance",
      label: "Schedule links sidecar (task ↔ material)",
      status: f.scheduleLinks.exists ? "done" : "optional",
      detail: "Optional JSON for MS Project import hints",
      artifactPath: f.scheduleLinks.relativePath,
      href: `/timeline?projectId=${encodeURIComponent(pid)}`,
    }),
  ];

  return [...technical, ...audit, ...bestek, ...compliance];
}

export const READINESS_LANE_LABEL: Record<ReadinessLaneId, string> = {
  technical: "Technical pipeline",
  audit: "Audit timeline",
  bestek: "Spec & deliveries package",
  compliance: "Compliance & planning hints",
  reference: "Reference / project-specific",
};
