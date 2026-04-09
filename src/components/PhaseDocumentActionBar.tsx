"use client";

import Link from "next/link";

import {
  PHASE_DOCUMENT_EXPECTATIONS,
  matchExpectationEvents,
  type PhaseDocumentExpectation,
} from "@/lib/lifecycle-phase-document-expectations";
import { deliveriesPidTabUrl } from "@/lib/deliveries-pid-url-context";
import { missingPhaseSlotActionHref } from "@/lib/deliveries-pid-slot-action-href";
import type { TimelineDocumentStorageFields, TimelinePidReferenceFields } from "@/lib/timeline-events";
import {
  TIMELINE_EVENT_LABELS,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";
import { groupLifecycleEventsByPhase } from "@/lib/timeline-lifecycle-overview";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";
import {
  deliveriesPidActionBarShellDeliveries,
  deliveriesPidActionBarShellTimeline,
  deliveriesPidSlotCardClass,
  deliveriesPidSlotCardFrame,
  deliveriesPidSlotTag,
} from "@/lib/deliveries-pid-ui";
import type { ReferencePhaseId } from "@/lib/timeline-reference-phase";

/** Minimal event shape — compatible with {@link ParsedRow} / timeline rows. */
export type PhaseActionBarEvent = {
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

function toLifecycle(ev: PhaseActionBarEvent): LifecycleOverviewEvent {
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

function slotHref(
  projectId: string,
  phase: ReferencePhaseId,
  exp: PhaseDocumentExpectation,
  phaseEvents: LifecycleOverviewEvent[]
): string {
  const st = rowStatus(exp, phaseEvents);
  if (st === "satisfied") {
    const matches = matchExpectationEvents(phaseEvents, exp);
    const first = matches[0];
    if (first) return timelineEventHref(projectId, first.eventId);
  }
  return missingPhaseSlotActionHref(projectId, phase, exp);
}

export default function PhaseDocumentActionBar(props: {
  projectId: string;
  phase: ReferencePhaseId | null;
  allEvents: PhaseActionBarEvent[];
  variant?: "deliveries" | "timeline";
}) {
  const { projectId, phase, allEvents, variant = "deliveries" } = props;
  const pid = projectId.trim();

  const shell =
    variant === "timeline" ? deliveriesPidActionBarShellTimeline : deliveriesPidActionBarShellDeliveries;

  if (!pid) {
    return (
      <div className={shell} role="region" aria-label="Phase document actions">
        <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">Set a project id first.</p>
      </div>
    );
  }

  if (phase == null) {
    return (
      <div className={shell} role="region" aria-label="Phase document actions">
        <p className="m-0 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
          No <strong className="font-medium">reference phase</strong> for this context — open the checklist in
          Deliveries to work by phase.
        </p>
        <p className="mt-1.5 m-0 text-[10px]">
          <Link
            href={`${deliveriesPidTabUrl(pid, {})}#deliveries-pid-phase-checklist`}
            className="font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300"
          >
            Deliveries → PID — phase checklist
          </Link>
        </p>
      </div>
    );
  }

  const allLife = allEvents.map(toLifecycle);
  const buckets = groupLifecycleEventsByPhase(allLife);
  const phaseEvents = buckets.phases.find((p) => p.phase === phase)?.events ?? [];
  const expectations = PHASE_DOCUMENT_EXPECTATIONS[phase];

  return (
    <div className={shell} role="region" aria-label={`Phase ${phase} — documents & actions`}>
      <p className="m-0 text-[8px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Required slots — tap a card for proof or register
      </p>
      <div
        className="-mx-1 mt-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
        role="region"
        aria-label="Required slots — scroll horizontally"
      >
        <ul className="m-0 flex w-max list-none flex-row flex-nowrap items-stretch gap-2 px-1 py-0">
          {expectations.map((exp) => {
            const st = rowStatus(exp, phaseEvents);
            const href = slotHref(pid, phase, exp, phaseEvents);
            const matches = exp.guidanceOnly ? [] : matchExpectationEvents(phaseEvents, exp);
            const rowBg = deliveriesPidSlotCardClass(st);
            const tag =
              st === "satisfied"
                ? "On file"
                : st === "missing"
                  ? "To do"
                  : "Hint";

            return (
              <li key={exp.id} className="flex" role="listitem">
                <Link
                  href={href}
                  title={
                    st === "satisfied" && matches[0]
                      ? `${TIMELINE_EVENT_LABELS[matches[0]!.eventAction]} — ${matches[0]!.eventId}`
                      : `${exp.formatHints.join(" · ")} — ${tag}`
                  }
                  className={`${deliveriesPidSlotCardFrame} min-h-[3.25rem] text-left transition-opacity hover:opacity-95 dark:hover:opacity-100 ${rowBg}`}
                >
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-1">
                      <span className="min-w-0 flex-1 text-[9px] font-medium leading-snug text-zinc-900 line-clamp-3 dark:text-zinc-50">
                        {exp.label}
                      </span>
                      <span className={deliveriesPidSlotTag}>{tag}</span>
                    </div>
                    <span className="line-clamp-2 text-[8px] leading-snug text-zinc-500 dark:text-zinc-400">
                      {exp.formatHints.join(" · ")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
