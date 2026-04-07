import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import {
  buildWorkflowReadinessRows,
  countTimelineAuditEventsInTurtle,
  READINESS_LANE_LABEL,
  type ReadinessLaneId,
  type ReadinessStatus,
  type WorkflowReadinessRow,
  type WorkflowReadinessSidecarV1,
} from "@/lib/workflow-readiness";

export const runtime = "nodejs";

const VALID_LANES = new Set<ReadinessLaneId>([
  "technical",
  "audit",
  "bestek",
  "compliance",
  "reference",
]);

const VALID_STATUS = new Set<ReadinessStatus>(["done", "partial", "missing", "optional"]);

function statSnap(dataDir: string, fileName: string) {
  const abs = path.join(dataDir, fileName);
  const relativePath = path.join("data", fileName).replace(/\\/g, "/");
  if (!fs.existsSync(abs)) {
    return { relativePath, exists: false as const };
  }
  const st = fs.statSync(abs);
  return {
    relativePath,
    exists: true as const,
    byteSize: st.size,
  };
}

function parseSidecar(raw: string): WorkflowReadinessSidecarV1 | null {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    const extra = o.extraRows;
    if (extra !== undefined && !Array.isArray(extra)) return null;
    return j as WorkflowReadinessSidecarV1;
  } catch {
    return null;
  }
}

function normalizeExtraRows(rows: WorkflowReadinessSidecarV1["extraRows"]): WorkflowReadinessRow[] {
  if (!Array.isArray(rows)) return [];
  const out: WorkflowReadinessRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : "";
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim() : "";
    const lane = r.lane as ReadinessLaneId;
    const status = r.status as ReadinessStatus;
    if (!id || !label || !VALID_LANES.has(lane) || !VALID_STATUS.has(status)) continue;
    out.push({
      id: `sidecar-${id}`,
      lane,
      label,
      detail: typeof r.detail === "string" ? r.detail : undefined,
      status,
      href: typeof r.href === "string" ? r.href : undefined,
      artifactPath: typeof r.artifactPath === "string" ? r.artifactPath : undefined,
    });
  }
  return out;
}

/**
 * GET /api/workflow/readiness?projectId=example
 * Traceability readiness for the workflow dashboard + optional `data/<projectId>-workflow-readiness-sidecar.json`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId` query param" }, { status: 400 });
  }
  if (!isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid `projectId`" }, { status: 400 });
  }

  const cwd = process.cwd();
  const dataDir = path.join(cwd, "data");

  const timelinePath = path.join(dataDir, `${projectId}-timeline.ttl`);
  let timelineAuditEventCount = 0;
  if (fs.existsSync(timelinePath)) {
    try {
      const content = fs.readFileSync(timelinePath, "utf-8");
      timelineAuditEventCount = countTimelineAuditEventsInTurtle(content);
    } catch {
      timelineAuditEventCount = 0;
    }
  }

  const files = {
    ifc: statSnap(dataDir, `${projectId}.ifc`),
    parsedTtl: statSnap(dataDir, `${projectId}.ttl`),
    enrichedTtl: statSnap(dataDir, `${projectId}-enriched.ttl`),
    kbTtl: statSnap(dataDir, `${projectId}-kb.ttl`),
    calcJson: statSnap(dataDir, `${projectId}-calc-latest.json`),
    timelineTtl: statSnap(dataDir, `${projectId}-timeline.ttl`),
    deliveriesTtl: statSnap(dataDir, `${projectId}-deliveries.ttl`),
    phase0Groups: statSnap(dataDir, `${projectId}-phase0-element-groups.json`),
    bestekBindings: statSnap(dataDir, `${projectId}-bestek-bindings.json`),
    bestekMatching: statSnap(dataDir, `${projectId}-bestek-material-matching.json`),
    productCoupling: statSnap(dataDir, `${projectId}-product-coupling.json`),
    complianceEvents: statSnap(dataDir, `${projectId}-compliance-events.ttl`),
    scheduleLinks: statSnap(dataDir, `${projectId}-schedule-links.json`),
  };

  let sidecarNotes: string | undefined;
  let sidecarRows: WorkflowReadinessRow[] = [];
  const sidecarAbs = path.join(dataDir, `${projectId}-workflow-readiness-sidecar.json`);
  if (fs.existsSync(sidecarAbs)) {
    try {
      const parsed = parseSidecar(fs.readFileSync(sidecarAbs, "utf-8"));
      if (parsed?.notes && typeof parsed.notes === "string") {
        sidecarNotes = parsed.notes.trim() || undefined;
      }
      sidecarRows = normalizeExtraRows(parsed?.extraRows);
    } catch {
      // ignore invalid sidecar
    }
  }

  const rows = [...buildWorkflowReadinessRows({ projectId, timelineAuditEventCount, files }), ...sidecarRows];

  return NextResponse.json({
    projectId,
    generatedAt: new Date().toISOString(),
    timelineAuditEventCount,
    sidecarPath: `data/${projectId}-workflow-readiness-sidecar.json`,
    sidecarLoaded: sidecarRows.length > 0 || Boolean(sidecarNotes),
    sidecarNotes: sidecarNotes ?? null,
    laneLabels: READINESS_LANE_LABEL,
    docPaths: {
      workflowReadiness: "docs/workflow-readiness.md",
      timelineTaxonomy: "docs/timeline-event-taxonomy.md",
      timelineEpcis: "docs/timeline-epcis-integration.md",
      roadmap: "docs/roadmap-milestones.md",
    },
    rows,
  });
}
