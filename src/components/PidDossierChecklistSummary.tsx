"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  matchExpectationEvents,
  PHASE_DOCUMENT_EXPECTATIONS,
  type PhaseDocumentExpectation,
} from "@/lib/lifecycle-phase-document-expectations";
import { missingPhaseSlotActionHref } from "@/lib/deliveries-pid-slot-action-href";
import { formatDossierTimestamp } from "@/lib/pid-dossier-from-timeline";
import { groupLifecycleEventsByPhase } from "@/lib/timeline-lifecycle-overview";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";
import {
  deliveriesPidChecklistRowHover,
  deliveriesPidChecklistStatusTextClass,
  deliveriesPidChecklistSummaryShell,
  deliveriesPidChecklistTableHeader,
  deliveriesPidChecklistTableRowBorder,
  deliveriesPidChecklistTableWrap,
  deliveriesPidHairlineDivider,
} from "@/lib/deliveries-pid-ui";
import {
  REFERENCE_PHASE_IDS,
  REFERENCE_PHASE_LABELS,
  type ReferencePhaseId,
} from "@/lib/timeline-reference-phase";

function timelineEventHref(projectId: string, eventId: string): string {
  return `/timeline?projectId=${encodeURIComponent(projectId)}&eventId=${encodeURIComponent(eventId)}`;
}

function exampleSnippet(exp: PhaseDocumentExpectation): string {
  const m = exp.mockExamples?.[0]?.trim();
  if (m) return m;
  const h = exp.formatHints?.[0]?.trim();
  return h ?? "—";
}

type RowStatus = "satisfied" | "missing" | "guidance";

/** Same rules as {@link PhaseDocumentActionBar} / timeline checklist. */
function rowStatus(
  exp: PhaseDocumentExpectation,
  phaseEvents: LifecycleOverviewEvent[]
): RowStatus {
  if (exp.guidanceOnly) return "guidance";
  return matchExpectationEvents(phaseEvents, exp).length > 0 ? "satisfied" : "missing";
}

export default function PidDossierChecklistSummary(props: {
  projectId: string;
  lifecycleEvents: LifecycleOverviewEvent[];
  /** `all` = every reference phase 0–9; else one phase only. */
  phaseFilter: ReferencePhaseId | "all";
}) {
  const { projectId, lifecycleEvents, phaseFilter } = props;
  const pid = projectId.trim();

  const phases = useMemo(
    () => (phaseFilter === "all" ? [...REFERENCE_PHASE_IDS] : [phaseFilter]),
    [phaseFilter]
  );

  const buckets = useMemo(
    () => groupLifecycleEventsByPhase(lifecycleEvents),
    [lifecycleEvents]
  );

  const { rows, requiredTotal, satisfiedTotal, guidanceTotal } = useMemo(() => {
    let requiredTotal = 0;
    let satisfiedTotal = 0;
    let guidanceTotal = 0;
    const rows: Array<{
      key: string;
      phase: ReferencePhaseId;
      exp: PhaseDocumentExpectation;
      status: RowStatus;
      proofEventId?: string;
      proofTimestampIso?: string;
    }> = [];

    for (const phase of phases) {
      const phaseEvents = buckets.phases.find((p) => p.phase === phase)?.events ?? [];
      for (const exp of PHASE_DOCUMENT_EXPECTATIONS[phase]) {
        const st = rowStatus(exp, phaseEvents);
        if (st === "guidance") {
          guidanceTotal += 1;
          rows.push({
            key: `${phase}-${exp.id}`,
            phase,
            exp,
            status: "guidance",
          });
          continue;
        }
        const matches = matchExpectationEvents(phaseEvents, exp);
        if (!exp.guidanceOnly && exp.match) {
          requiredTotal += 1;
          if (st === "satisfied") satisfiedTotal += 1;
        }
        const first = matches[0];
        rows.push({
          key: `${phase}-${exp.id}`,
          phase,
          exp,
          status: st,
          proofEventId: first?.eventId,
          proofTimestampIso: first?.timestampIso,
        });
      }
    }
    return { rows, requiredTotal, satisfiedTotal, guidanceTotal };
  }, [buckets, phases]);

  if (!pid) {
    return (
      <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">Set a project id to see checklist totals.</p>
    );
  }

  const scopeLabel =
    phaseFilter === "all"
      ? "All phases (0–9)"
      : `Phase ${phaseFilter} — ${REFERENCE_PHASE_LABELS[phaseFilter]}`;

  return (
    <div
      className={deliveriesPidChecklistSummaryShell}
      role="region"
      aria-label="PID document checklist summary"
    >
      <div className={`flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 ${deliveriesPidHairlineDivider}`}>
        <p className="m-0 text-[11px] font-semibold text-zinc-900 dark:text-zinc-50">{scopeLabel}</p>
        <p className="m-0 text-[11px] tabular-nums text-zinc-700 dark:text-zinc-200">
          <span className="font-semibold text-emerald-800 dark:text-emerald-200">{satisfiedTotal}</span>
          <span className="text-zinc-500 dark:text-zinc-500"> / </span>
          <span className="font-medium">{requiredTotal}</span>
          <span className="ml-1 text-zinc-500 dark:text-zinc-400">required on timeline</span>
          {guidanceTotal > 0 ? (
            <span className="ml-2 text-[10px] text-zinc-500 dark:text-zinc-400">
              +{guidanceTotal} hint{guidanceTotal === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
      </div>

      <div className={deliveriesPidChecklistTableWrap}>
        <table className="w-full border-collapse text-left text-[10px] text-zinc-800 dark:text-zinc-200">
          <thead className={deliveriesPidChecklistTableHeader}>
            <tr>
              {phaseFilter === "all" ? (
                <th scope="col" className={`border-b px-2 py-1.5 ${deliveriesPidHairlineDivider}`}>
                  Phase
                </th>
              ) : null}
              <th scope="col" className={`border-b px-2 py-1.5 ${deliveriesPidHairlineDivider}`}>
                Requirement
              </th>
              <th scope="col" className={`border-b px-2 py-1.5 ${deliveriesPidHairlineDivider}`}>
                Status
              </th>
              <th scope="col" className={`border-b px-2 py-1.5 ${deliveriesPidHairlineDivider}`}>
                Example / format
              </th>
              <th scope="col" className={`border-b px-2 py-1.5 ${deliveriesPidHairlineDivider}`}>
                Logged
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { exp, phase, status, proofEventId, proofTimestampIso } = row;
              const href =
                status === "satisfied" && proofEventId
                  ? timelineEventHref(pid, proofEventId)
                  : missingPhaseSlotActionHref(pid, phase, exp);
              const example = exampleSnippet(exp);
              const statusLabel =
                status === "satisfied" ? "On file" : status === "missing" ? "To do" : "Hint only";
              const statusClass = deliveriesPidChecklistStatusTextClass(status);

              const labelCell =
                href != null ? (
                  <Link
                    href={href}
                    className="font-medium leading-snug text-violet-800 underline underline-offset-2 hover:text-violet-950 dark:text-violet-200 dark:hover:text-violet-100"
                    title={status === "satisfied" ? "Open timeline proof" : "Register or log evidence"}
                  >
                    {exp.label}
                  </Link>
                ) : (
                  <span className="font-medium leading-snug">{exp.label}</span>
                );

              return (
                <tr
                  key={row.key}
                  className={href != null ? deliveriesPidChecklistRowHover : ""}
                >
                  {phaseFilter === "all" ? (
                    <td className={`px-2 py-1.5 font-mono tabular-nums ${deliveriesPidChecklistTableRowBorder}`}>
                      {phase}
                    </td>
                  ) : null}
                  <td className={`px-2 py-1.5 align-top ${deliveriesPidChecklistTableRowBorder}`}>{labelCell}</td>
                  <td
                    className={`px-2 py-1.5 align-top font-medium ${deliveriesPidChecklistTableRowBorder} ${statusClass}`}
                  >
                    {statusLabel}
                  </td>
                  <td
                    className={`px-2 py-1.5 align-top text-zinc-600 dark:text-zinc-400 ${deliveriesPidChecklistTableRowBorder}`}
                  >
                    <span className="line-clamp-2 break-words" title={example}>
                      {example}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-1.5 align-top font-mono text-[9px] text-zinc-500 dark:text-zinc-400 ${deliveriesPidChecklistTableRowBorder}`}
                  >
                    {status === "satisfied" && proofTimestampIso
                      ? formatDossierTimestamp(proofTimestampIso)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
