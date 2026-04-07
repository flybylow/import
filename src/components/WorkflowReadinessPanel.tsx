"use client";

import { useState } from "react";

import { InfoDetails } from "@/components/InfoDetails";
import type { ReadinessLaneId, ReadinessStatus } from "@/lib/workflow-readiness";

export type WorkflowReadinessApiRow = {
  id: string;
  lane: ReadinessLaneId;
  label: string;
  detail?: string;
  status: ReadinessStatus;
  artifactPath?: string;
  href?: string;
};

export type WorkflowReadinessApiPayload = {
  projectId: string;
  generatedAt: string;
  timelineAuditEventCount: number;
  sidecarPath: string;
  sidecarLoaded: boolean;
  sidecarNotes: string | null;
  laneLabels: Record<ReadinessLaneId, string>;
  docPaths: Record<string, string>;
  rows: WorkflowReadinessApiRow[];
};

function statusLabel(s: ReadinessStatus): string {
  switch (s) {
    case "done":
      return "Done";
    case "partial":
      return "Partial";
    case "missing":
      return "Missing";
    case "optional":
      return "Optional";
    default:
      return s;
  }
}

function statusClass(s: ReadinessStatus): string {
  switch (s) {
    case "done":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "partial":
      return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
    case "missing":
      return "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100";
    case "optional":
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

const LANE_ORDER: ReadinessLaneId[] = [
  "technical",
  "audit",
  "bestek",
  "compliance",
  "reference",
];

/** Short lane tags for compact widget layout. */
const LANE_WIDGET_TAG: Record<ReadinessLaneId, string> = {
  technical: "Pipeline",
  audit: "Timeline",
  bestek: "Bestek",
  compliance: "Compliance",
  reference: "Extra",
};

function readinessTabId(lane: ReadinessLaneId): string {
  return `workflow-readiness-tab-${lane}`;
}

function readinessPanelId(lane: ReadinessLaneId): string {
  return `workflow-readiness-panel-${lane}`;
}

function WorkflowReadinessCompactTabs(props: {
  payload: WorkflowReadinessApiPayload;
  byLane: Map<ReadinessLaneId, WorkflowReadinessApiRow[]>;
  lanesWithRows: ReadinessLaneId[];
}) {
  const { payload, byLane, lanesWithRows } = props;
  const [pickedLane, setPickedLane] = useState<ReadinessLaneId | null>(null);
  const activeLane =
    pickedLane != null && lanesWithRows.includes(pickedLane)
      ? pickedLane
      : (lanesWithRows[0] ?? "technical");

  const activeRows = byLane.get(activeLane) ?? [];

  return (
    <div className="min-w-0 w-full max-w-[19rem] rounded-lg border border-zinc-200 bg-white px-2.5 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">Readiness</h3>
        <InfoDetails label="Traceability readiness — what this widget shows">
          <p className="mb-2 text-zinc-700 dark:text-zinc-300">
            Checks <span className="font-mono">data/&lt;projectId&gt;-*</span>: technical pipeline files,
            audit timeline (EPCIS, deliveries, schedule, BCF, bestek — see{" "}
            <span className="font-mono">docs/timeline-event-taxonomy.md</span>), bestek JSON, optional
            compliance and schedule sidecars.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Optional sidecar: <span className="font-mono">{payload.sidecarPath}</span>
            {payload.sidecarLoaded ? " (loaded)." : "."}
          </p>
        </InfoDetails>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {payload.timelineAuditEventCount} evts
        </span>
      </div>

      {payload.sidecarNotes ? (
        <p
          className="mt-1.5 truncate rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300"
          title={payload.sidecarNotes}
        >
          {payload.sidecarNotes}
        </p>
      ) : null}

      {lanesWithRows.length > 0 ? (
        <>
          <div
            role="tablist"
            aria-label="Readiness categories"
            className="mt-2 flex max-w-full flex-wrap gap-0.5 border-b border-zinc-200/80 pb-1 dark:border-zinc-700/80"
          >
            {lanesWithRows.map((lane) => {
              const selected = lane === activeLane;
              return (
                <button
                  key={lane}
                  type="button"
                  role="tab"
                  id={readinessTabId(lane)}
                  aria-selected={selected}
                  aria-controls={readinessPanelId(lane)}
                  className={`rounded-t px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    selected
                      ? "bg-zinc-100 text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
                  }`}
                  onClick={() => setPickedLane(lane)}
                >
                  {LANE_WIDGET_TAG[lane]}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={readinessPanelId(activeLane)}
            aria-labelledby={readinessTabId(activeLane)}
            className="mt-1.5 min-h-[2.5rem]"
          >
            <div className="grid grid-cols-1 gap-1">
              {activeRows.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-zinc-200/90 bg-white/80 px-2 py-1 shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/50"
                  title={r.detail ? `${r.label}: ${r.detail}` : r.label}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[11px] font-medium leading-tight text-zinc-800 dark:text-zinc-200">
                      {r.label}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-px text-[9px] font-medium ${statusClass(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                      {r.href ? (
                        <a
                          href={r.href}
                          className="text-[10px] font-medium text-violet-600 underline decoration-violet-400/60 underline-offset-2 dark:text-violet-400"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {r.artifactPath ? (
                    <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                      {r.artifactPath}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">No readiness rows.</p>
      )}

      <p className="mt-2 text-[9px] text-zinc-500 dark:text-zinc-500">
        <span className="font-mono">docs/workflow-readiness.md</span>
      </p>
    </div>
  );
}

export default function WorkflowReadinessPanel(props: {
  payload: WorkflowReadinessApiPayload | null;
  error: string | null;
  loading: boolean;
  /** Denser typography and spacing (workflow dashboard). */
  compact?: boolean;
}) {
  const { payload, error, loading, compact } = props;
  const c = Boolean(compact);

  if (loading && !payload) {
    return (
      <div
        className={`rounded-lg border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-400 ${
          c ? "min-w-0 w-full max-w-[19rem] px-3 py-2 text-xs shadow-sm" : "mt-6 px-4 py-3 text-sm"
        }`}
      >
        Loading traceability readiness…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 ${
          c ? "min-w-0 w-full max-w-[19rem] px-3 py-2 text-xs shadow-sm" : "mt-6 px-4 py-3 text-sm"
        }`}
      >
        Readiness: {error}
      </div>
    );
  }

  if (!payload) return null;

  const byLane = new Map<ReadinessLaneId, WorkflowReadinessApiRow[]>();
  for (const lane of LANE_ORDER) byLane.set(lane, []);
  for (const r of payload.rows) {
    const list = byLane.get(r.lane);
    if (list) list.push(r);
    else byLane.set(r.lane, [r]);
  }

  if (c) {
    const lanesWithRows = LANE_ORDER.filter((lane) => (byLane.get(lane) ?? []).length > 0);
    return (
      <WorkflowReadinessCompactTabs
        payload={payload}
        byLane={byLane}
        lanesWithRows={lanesWithRows}
      />
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-violet-200/80 bg-white/90 px-4 py-4 dark:border-violet-900/50 dark:bg-zinc-950/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Traceability readiness</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Three lanes: technical pipeline, audit timeline (EPCIS, deliveries, schedule, BCF, bestek — see{" "}
            <span className="font-mono text-violet-700 dark:text-violet-300">docs/timeline-event-taxonomy.md</span>
            ), and spec/deliveries JSON under <span className="font-mono">data/</span>. Optional sidecar:{" "}
            <span className="font-mono">{payload.sidecarPath}</span>
            {payload.sidecarLoaded ? " (loaded)" : ""}.
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
          {payload.timelineAuditEventCount} timeline AuditEvent(s)
        </p>
      </div>

      {payload.sidecarNotes ? (
        <p className="mt-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
          {payload.sidecarNotes}
        </p>
      ) : null}

      <div className="mt-4 space-y-5">
        {LANE_ORDER.map((lane) => {
          const rows = byLane.get(lane) ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={lane}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                {payload.laneLabels[lane] ?? lane}
              </h4>
              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-zinc-800 dark:text-zinc-200">{r.label}</span>
                      {r.detail ? (
                        <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                          {r.detail}
                        </span>
                      ) : null}
                      {r.artifactPath ? (
                        <span className="mt-0.5 block font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                          {r.artifactPath}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                      {r.href ? (
                        <a
                          href={r.href}
                          className="text-xs font-medium text-violet-600 underline decoration-violet-400/60 underline-offset-2 dark:text-violet-400"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-500">
        Roadmap: <span className="font-mono">docs/roadmap-milestones.md</span> · Full spec:{" "}
        <span className="font-mono">docs/workflow-readiness.md</span>
      </p>
    </div>
  );
}
