"use client";

import Link from "next/link";

import {
  PHASE_DOCUMENT_EXPECTATIONS,
  matchExpectationEvents,
  type PhaseDocumentExpectation,
} from "@/lib/lifecycle-phase-document-expectations";
import type { TimelineDocumentStorageFields, TimelinePidReferenceFields } from "@/lib/timeline-events";
import {
  TIMELINE_EVENT_LABELS,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";
import {
  eventReferencePhase,
  groupLifecycleEventsByPhase,
} from "@/lib/timeline-lifecycle-overview";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";
import { missingPhaseSlotActionHref } from "@/lib/deliveries-pid-slot-action-href";
import {
  deliveriesPidInspectorBadgeClass,
  deliveriesPidSlotCardClass,
  deliveriesPidSlotCardFrame,
} from "@/lib/deliveries-pid-ui";
import {
  REFERENCE_PHASE_IDS,
  REFERENCE_PHASE_LABELS,
  type ReferencePhaseId,
} from "@/lib/timeline-reference-phase";

/** Subset of parsed timeline rows — matches {@link ParsedRow} on `/timeline`. */
export type TimelinePhaseInspectorEvent = {
  eventId: string;
  timestampIso: string;
  actorSystem: boolean;
  actorLabel: string;
  eventAction: TimelineEventAction;
  message?: string;
  source?: string;
  bestekBindingSaveBatchId?: string;
  pidReferenceFields?: TimelinePidReferenceFields;
  documentStorageFields?: TimelineDocumentStorageFields;
};

function toLifecycle(ev: TimelinePhaseInspectorEvent): LifecycleOverviewEvent {
  return {
    eventId: ev.eventId,
    timestampIso: ev.timestampIso,
    actorSystem: ev.actorSystem,
    actorLabel: ev.actorLabel,
    eventAction: ev.eventAction,
    message: ev.message,
    source: ev.source,
    bestekBindingSaveBatchId: ev.bestekBindingSaveBatchId,
    pidReferenceFields: ev.pidReferenceFields,
  };
}

function timelineEventHref(projectId: string, eventId: string): string {
  return `/timeline?projectId=${encodeURIComponent(projectId)}&eventId=${encodeURIComponent(eventId)}`;
}

type RowStatus = "satisfied" | "missing" | "guidance";

function rowStatus(
  exp: PhaseDocumentExpectation,
  phaseEvents: LifecycleOverviewEvent[]
): RowStatus {
  if (exp.guidanceOnly) return "guidance";
  return matchExpectationEvents(phaseEvents, exp).length > 0 ? "satisfied" : "missing";
}

export default function TimelinePhaseDocumentInspector(props: {
  contextEvent: TimelinePhaseInspectorEvent;
  allEvents: TimelinePhaseInspectorEvent[];
  projectId: string;
  /**
   * When set, the checklist uses this reference phase instead of deriving it from `contextEvent`
   * (e.g. Deliveries → PID with a phase picker or URL focus).
   */
  phaseOverride?: ReferencePhaseId;
  /** List every phase’s expectations (Deliveries PID “Show all phases”). */
  showAllPhasesChecklist?: boolean;
  /** When true (e.g. Deliveries PID), omit the phase title + rules blurb; checklist cards only. */
  embed?: boolean;
}) {
  const { contextEvent, allEvents, projectId, phaseOverride, showAllPhasesChecklist, embed } = props;
  const lifeCtx = toLifecycle(contextEvent);
  const phase = showAllPhasesChecklist
    ? null
    : phaseOverride !== undefined
      ? phaseOverride
      : eventReferencePhase(lifeCtx);
  const allLife = allEvents.map(toLifecycle);
  const buckets = groupLifecycleEventsByPhase(allLife);
  const phaseEvents =
    phase != null ? buckets.phases.find((p) => p.phase === phase)?.events ?? [] : [];

  const expectations: PhaseDocumentExpectation[] =
    phase != null ? PHASE_DOCUMENT_EXPECTATIONS[phase] : [];

  const phaseTitle = showAllPhasesChecklist
    ? "All reference phases (0–9)"
    : phase != null
      ? `Phase ${phase} — ${REFERENCE_PHASE_LABELS[phase]}`
      : "No reference phase";

  function renderExpectationList(
    phaseId: ReferencePhaseId,
    exps: PhaseDocumentExpectation[],
    eventsForPhase: LifecycleOverviewEvent[]
  ) {
    if (exps.length === 0) return null;
    return (
      <div
        className="-mx-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
        role="region"
        aria-label={`Phase ${phaseId} — document expectations (scroll horizontally)`}
      >
        <ul className="m-0 flex w-max list-none flex-row flex-nowrap items-stretch gap-2 px-1 py-0">
          {exps.map((exp) => {
            const st = rowStatus(exp, eventsForPhase);
            const matches = exp.guidanceOnly ? [] : matchExpectationEvents(eventsForPhase, exp);
            const badge = deliveriesPidInspectorBadgeClass(st);
            const label = st === "satisfied" ? "Matched" : st === "missing" ? "Missing" : "Mock / hint";

            return (
              <li
                key={`${phaseId}-${exp.id}`}
                className={`${deliveriesPidSlotCardFrame} p-2 ${deliveriesPidSlotCardClass(st)}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[11px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                        {exp.label}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-snug text-zinc-500 dark:text-zinc-400">
                        {exp.formatHints.join(" · ")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1 py-px text-[8px] font-semibold uppercase leading-tight tracking-wide ${badge}`}
                    >
                      {label}
                    </span>
                  </div>
                  {exp.mockExamples?.length ? (
                    <div className="mt-0.5 border-t border-zinc-200/80 pt-1.5 dark:border-zinc-700/80">
                      <p className="m-0 text-[8px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Mock examples
                      </p>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-3 text-[9px] italic leading-snug text-zinc-600 dark:text-zinc-400">
                        {exp.mockExamples.map((ex) => (
                          <li key={ex} className="break-words">
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {matches.length > 0 ? (
                    <ul className="mt-0.5 list-none space-y-0.5 p-0 text-[9px] leading-snug">
                      {matches.map((m) => (
                        <li key={m.eventId}>
                          <Link
                            href={timelineEventHref(projectId, m.eventId)}
                            className="font-mono text-violet-700 underline underline-offset-2 dark:text-violet-400"
                          >
                            {m.eventId.slice(0, 8)}…
                          </Link>
                          <span className="text-zinc-500"> · </span>
                          <span>{TIMELINE_EVENT_LABELS[m.eventAction]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {st !== "guidance" && projectId.trim() ? (
                    <p className="mt-auto pt-1 text-[9px]">
                      <Link
                        href={missingPhaseSlotActionHref(projectId, phaseId, exp)}
                        className="font-medium text-violet-700 underline underline-offset-2 dark:text-violet-400"
                      >
                        Register in app →
                      </Link>
                    </p>
                  ) : st === "guidance" && projectId.trim() ? (
                    <p className="mt-auto pt-1 text-[9px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Register uploads/refs under{" "}
                      <Link
                        href={`/deliveries?tab=pid&projectId=${encodeURIComponent(projectId.trim())}#deliveries-pid-document`}
                        className="text-violet-700 underline dark:text-violet-400"
                      >
                        Deliveries → PID
                      </Link>{" "}
                      (phase 2 heuristics).
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
      {!embed ? (
        <div className="rounded-md border border-zinc-200/80 bg-white/90 px-2 py-1.5 dark:border-zinc-600/50 dark:bg-zinc-900/45">
          <p className="m-0 font-semibold text-zinc-900 dark:text-zinc-100">{phaseTitle}</p>
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            {showAllPhasesChecklist ? (
              <>
                Each card is matched against events in <strong className="font-medium">its</strong> reference phase
                bucket (<span className="font-mono">eventReferencePhase</span>). Scroll phases vertically; scroll
                cards horizontally. Mock filenames are examples only.
              </>
            ) : (
              <>
                This event is bucketed with <strong className="font-medium">reference phase</strong> heuristics (see{" "}
                <code className="rounded bg-zinc-100 px-0.5 font-mono text-[9px] dark:bg-zinc-800">
                  eventReferencePhase
                </code>{" "}
                in code and <span className="font-mono">docs/pid-lifecycle-timeline-events.md</span>). Cards below
                (scroll horizontally) show which <strong className="font-medium">matching timeline events</strong>{" "}
                already satisfy each slot; mock names are examples only.
              </>
            )}
          </p>
          {!showAllPhasesChecklist && phase == null ? (
            <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
              Unassigned events have no phase checklist — pick a PID milestone or a mapped action to anchor
              phase context.
            </p>
          ) : null}
        </div>
      ) : !showAllPhasesChecklist && phase == null ? (
        <p className="m-0 rounded-md border border-amber-200/90 bg-amber-50/90 px-2 py-1.5 text-[10px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200">
          Unassigned events have no phase checklist — pick a PID milestone or a mapped action to anchor phase
          context.
        </p>
      ) : null}

      {showAllPhasesChecklist ? (
        <div className="space-y-4">
          {REFERENCE_PHASE_IDS.map((phaseId) => {
            const evs = buckets.phases.find((p) => p.phase === phaseId)?.events ?? [];
            const exps = PHASE_DOCUMENT_EXPECTATIONS[phaseId];
            const list = renderExpectationList(phaseId, exps, evs);
            if (!list) return null;
            return (
              <section key={phaseId} className="space-y-2" aria-label={`Phase ${phaseId} checklist`}>
                <h4 className="m-0 text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Phase {phaseId} — {REFERENCE_PHASE_LABELS[phaseId]}
                </h4>
                {list}
              </section>
            );
          })}
        </div>
      ) : phase != null && expectations.length > 0 ? (
        renderExpectationList(phase, expectations, phaseEvents)
      ) : null}

      <p className="m-0 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        Stored uploads and references are listed on the <strong className="font-medium">phase action bar</strong>{" "}
        (Deliveries → PID or Timeline → Docs), not here. Full phase matrix:{" "}
        <span className="font-mono">/timeline?view=lifecycle</span>
      </p>
    </div>
  );
}
