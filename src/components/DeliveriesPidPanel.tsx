"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import { CollapseSection, InfoDetails } from "@/components/InfoDetails";
import ProjectDebugFileRow from "@/components/ProjectDebugFileRow";
import PhaseDocumentActionBar from "@/components/PhaseDocumentActionBar";
import PidDossierChecklistSummary from "@/components/PidDossierChecklistSummary";
import TimelinePhaseDocumentInspector, {
  type TimelinePhaseInspectorEvent,
} from "@/components/TimelinePhaseDocumentInspector";
import { useToast } from "@/components/ToastProvider";
import type { ParsedTimelineEvent } from "@/lib/timeline-events";
import { TIMELINE_EVENT_LABELS } from "@/lib/timeline-events-vocab";
import {
  buildPidDossierChapters,
  formatDossierTimestamp,
  trailingNonPidAfterLastMilestone,
  type PidDossierChapter,
} from "@/lib/pid-dossier-from-timeline";
import {
  groupLifecycleEventsByPhase,
  lifecycleActorDisplayLabel,
  type LifecycleOverviewEvent,
} from "@/lib/timeline-lifecycle-overview";
import {
  matchExpectationEvents,
  PHASE_DOCUMENT_EXPECTATIONS,
} from "@/lib/lifecycle-phase-document-expectations";
import { timelineEventDeepLink } from "@/lib/timeline-event-inspect-links";
import { PID_TEMPLATE_PLACEHOLDER_NOTE } from "@/lib/timeline-pid-template-constants";
import {
  PID_MILESTONE_KEYS,
  PID_MILESTONE_LABELS,
  type PidMilestoneKey,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";
import { buildDeliveriesPidCustomSlotTimelineMessage } from "@/lib/deliveries-pid-custom-slot-message";
import { findPhaseDocumentExpectationById } from "@/lib/deliveries-pid-slot-action-href";
import {
  deliveriesPidCompactEventCard,
  deliveriesPidMilestoneCardInner,
  deliveriesPidMilestoneCardOuter,
  deliveriesPidPhaseStripAllButtonClass,
  deliveriesPidPhaseStripButtonClass,
} from "@/lib/deliveries-pid-ui";
import {
  deliveriesPidTabUrl,
  firstPidMilestoneKeyInSameUiBand,
  isPidTraceSignIntent,
  PID_EXPECTATION_ID_PARAM,
  PID_TRACE_INTENT_PARAM,
  pidUiBandIdForReferencePhase,
  resolvePidUrlFocus,
} from "@/lib/deliveries-pid-url-context";
import {
  PID_MILESTONE_REFERENCE_PHASE,
  REFERENCE_PHASE_LABELS,
  REFERENCE_PHASE_IDS,
  defaultSignoffTitleForReferencePhase,
  type ReferencePhaseId,
} from "@/lib/timeline-reference-phase";

function parsedToLifecycleOverview(ev: ParsedTimelineEvent): LifecycleOverviewEvent {
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

function phaseChecklistSlotCounts(
  phase: ReferencePhaseId,
  phaseEvents: LifecycleOverviewEvent[]
): { satisfied: number; total: number } {
  const expectations = PHASE_DOCUMENT_EXPECTATIONS[phase];
  let total = 0;
  let satisfied = 0;
  for (const exp of expectations) {
    if (exp.guidanceOnly || !exp.match) continue;
    total++;
    if (matchExpectationEvents(phaseEvents, exp).length > 0) satisfied++;
  }
  return { satisfied, total };
}

/** Group PID dossier cards into three bands (matches reference phases 0–1, 2–3, 4–9). */
const PID_DOSSIER_TAB_SECTIONS: {
  id: "pid-tab-design-spec" | "pid-tab-site-completion" | "pid-tab-handover-after";
  title: string;
  description: string;
  phaseLabelShort: string;
  phaseRange: readonly ReferencePhaseId[];
}[] = [
  {
    id: "pid-tab-design-spec",
    title: "Design & specification",
    description: "Reference phases 0–1 — baseline spec, PID process opened.",
    phaseLabelShort: "Phases 0–1",
    phaseRange: ["0", "1"],
  },
  {
    id: "pid-tab-site-completion",
    title: "Site, completion & core dossier",
    description: "Reference phases 2–3 — site/delivery span, as-built, PID finalized.",
    phaseLabelShort: "Phases 2–3",
    phaseRange: ["2", "3"],
  },
  {
    id: "pid-tab-handover-after",
    title: "Opleveringen, warranty & aftercare",
    description: "Reference phases 4–9 — PVs, warranty, transfer, end of life.",
    phaseLabelShort: "Phases 4–9",
    phaseRange: ["4", "5", "6", "7", "8", "9"],
  },
];

const PID_DOSSIER_BAND_THEME: Record<
  (typeof PID_DOSSIER_TAB_SECTIONS)[number]["id"],
  { bar: string; marker: string; markerTitle: string; markerMeta: string }
> = {
  "pid-tab-design-spec": {
    bar: "bg-sky-500 dark:bg-sky-400",
    marker:
      "border-sky-200/80 bg-gradient-to-br from-sky-50 via-sky-50/80 to-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:border-sky-800/70 dark:from-sky-950/55 dark:via-sky-950/35 dark:to-zinc-950 dark:shadow-none",
    markerTitle: "text-sky-950 dark:text-sky-50",
    markerMeta: "text-sky-800/85 dark:text-sky-300/90",
  },
  "pid-tab-site-completion": {
    bar: "bg-teal-500 dark:bg-teal-400",
    marker:
      "border-teal-200/80 bg-gradient-to-br from-teal-50 via-teal-50/80 to-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:border-teal-800/70 dark:from-teal-950/55 dark:via-teal-950/35 dark:to-zinc-950 dark:shadow-none",
    markerTitle: "text-teal-950 dark:text-teal-50",
    markerMeta: "text-teal-900/85 dark:text-teal-300/90",
  },
  "pid-tab-handover-after": {
    bar: "bg-violet-500 dark:bg-violet-400",
    marker:
      "border-violet-200/80 bg-gradient-to-br from-violet-50 via-violet-50/80 to-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:border-violet-800/70 dark:from-violet-950/55 dark:via-violet-950/35 dark:to-zinc-950 dark:shadow-none",
    markerTitle: "text-violet-950 dark:text-violet-50",
    markerMeta: "text-violet-900/85 dark:text-violet-300/90",
  },
};

/** Dummy context row; phase comes from {@link TimelinePhaseDocumentInspector} `phaseOverride` on Deliveries PID. */
const PID_PHASE_CHECKLIST_CONTEXT_ANCHOR: TimelinePhaseInspectorEvent = {
  eventId: "00000000-0000-4000-8000-000000000001",
  timestampIso: "1970-01-01T00:00:00.000Z",
  actorSystem: true,
  actorLabel: "deliveries-pid-checklist",
  eventAction: "pid_reference_milestone",
  source: "deliveries-pid-checklist",
  pidReferenceFields: { milestoneKey: "spec_baseline", lifecyclePhase: "0" },
};

type DeliveriesPidPanelProps = {
  projectId: string;
};

const CHECKLIST_PHASE_ALL = "all" as const;
type ChecklistPhaseSelection = ReferencePhaseId | typeof CHECKLIST_PHASE_ALL;

function clipText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const inspectLinkClass =
  "font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300";

/** Hide auto-generated template milestone prose on dossier cards (milestone title + form are enough). */
function pidDossierUserMessage(ev: ParsedTimelineEvent): string | null {
  const m = ev.message?.trim() ?? "";
  if (!m) return null;
  if (
    (ev.source ?? "").trim() === "pid-template-seed" &&
    m.includes(PID_TEMPLATE_PLACEHOLDER_NOTE)
  ) {
    return null;
  }
  return m;
}

/** Dossier cards: skip actor line for template-seeded rows (avoid duplicate “template” copy next to the milestone title). */
function pidDossierActorLine(ev: ParsedTimelineEvent): string | null {
  if ((ev.source ?? "").trim() === "pid-template-seed") return null;
  return lifecycleActorDisplayLabel({
    actorSystem: ev.actorSystem,
    actorLabel: ev.actorLabel,
    source: ev.source,
  });
}

/** Source + event id only — phase, state, actor, message live in the card body above. */
function PidMilestoneTechnicalDetails({ ev }: { ev: ParsedTimelineEvent }) {
  return (
    <dl className="mt-1.5 space-y-1.5 text-[10px] text-zinc-600 dark:text-zinc-400">
      <div className="flex flex-wrap items-center gap-1.5">
        <dt className="sr-only">Source</dt>
        <dd className="m-0">
          {ev.source?.trim() ? (
            <code
              className="rounded bg-zinc-100 px-1 font-mono text-[9px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              title="timeline:source"
            >
              {ev.source.trim()}
            </code>
          ) : (
            <span className="text-zinc-400">No source on event</span>
          )}
        </dd>
      </div>
      <div className="m-0 break-all font-mono text-[9px] text-zinc-400" title="timeline:eventId">
        {ev.eventId}
      </div>
    </dl>
  );
}

function TimelineEventInspectLink({
  projectId,
  ev,
}: {
  projectId: string;
  ev: ParsedTimelineEvent;
}) {
  const href = useMemo(() => {
    const p = projectId.trim();
    const e = ev.eventId?.trim();
    if (!p || !e) return null;
    return timelineEventDeepLink(p, e);
  }, [projectId, ev.eventId]);
  if (!href) return null;
  return (
    <Link
      href={href}
      className={`${inspectLinkClass} mt-1.5 inline-block text-[11px]`}
    >
      Open on timeline
    </Link>
  );
}

function PidDossierChapterCard({
  ch,
  projectId,
  accentBarClass,
}: {
  ch: PidDossierChapter;
  projectId: string;
  accentBarClass: string;
}) {
  const latest = ch.milestoneEvents[ch.milestoneEvents.length - 1] ?? null;
  const pidQ = projectId.trim();
  const prefill = deliveriesPidTabUrl(pidQ, { pidMilestone: ch.key });
  const older = ch.milestoneEvents.slice(0, -1).reverse();
  const latestPr = latest?.pidReferenceFields;
  const latestPhase =
    latestPr?.lifecyclePhase != null && String(latestPr.lifecyclePhase).trim() !== ""
      ? String(latestPr.lifecyclePhase).trim()
      : null;
  const latestStateHint = latestPr?.stateHint?.trim() || null;
  const latestActorLine = latest ? pidDossierActorLine(latest) : null;
  const latestUserMessage = latest ? pidDossierUserMessage(latest) : null;
  return (
    <div className={deliveriesPidMilestoneCardOuter}>
      <div className={`w-0.5 shrink-0 ${accentBarClass}`} aria-hidden />
      <div className={deliveriesPidMilestoneCardInner}>
        <div className="min-h-[2.25rem]">
          <p className="text-[11px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{ch.label}</p>
          {latest ? (
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {formatDossierTimestamp(latest.timestampIso)}
              {ch.milestoneEvents.length > 1 ? ` · ${ch.milestoneEvents.length}×` : null}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Not recorded —{" "}
              <Link href={prefill} className="text-sky-700 underline dark:text-sky-400">
                register
              </Link>
            </p>
          )}
        </div>
        {latest ? (
          <>
            {latestPhase != null ? (
              <p className="mt-1 text-[11px] leading-snug text-zinc-800 dark:text-zinc-200">
                <span className="text-zinc-500 dark:text-zinc-500">Phase </span>
                <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{latestPhase}</span>
              </p>
            ) : null}
            {latestStateHint ? (
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-800 dark:text-zinc-200">
                <span className="text-zinc-500 dark:text-zinc-500">State </span>
                {latestStateHint}
              </p>
            ) : null}
            {latestActorLine != null ? (
              <p className="mt-1 text-[11px] leading-snug text-zinc-800 dark:text-zinc-200">
                <span className="text-zinc-500 dark:text-zinc-500">Actor </span>
                <span className="break-words">{latestActorLine}</span>
              </p>
            ) : null}
            {pidQ ? <TimelineEventInspectLink projectId={pidQ} ev={latest} /> : null}
            {latestUserMessage ? (
              <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
                {latestUserMessage}
              </p>
            ) : null}
            <details className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <summary className="cursor-pointer text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                Technical
              </summary>
              <PidMilestoneTechnicalDetails ev={latest} />
            </details>
          </>
        ) : null}
        {older.length > 0 && pidQ ? (
          <details className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <summary className="cursor-pointer text-[11px] text-zinc-600 dark:text-zinc-400">
              Earlier recordings ({older.length})
            </summary>
            <ul className="mt-2 list-none space-y-2 text-[11px] text-zinc-600 dark:text-zinc-400">
              {older.map((evRow) => {
                const pr = evRow.pidReferenceFields;
                const phase =
                  pr?.lifecyclePhase != null && String(pr.lifecyclePhase).trim() !== ""
                    ? String(pr.lifecyclePhase).trim()
                    : null;
                const stateHint = pr?.stateHint?.trim() || null;
                const olderActorLine = pidDossierActorLine(evRow);
                const olderUserMsg = pidDossierUserMessage(evRow);
                return (
                  <li
                    key={evRow.eventId}
                    className="rounded-md border border-zinc-100 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/50"
                  >
                    <div className="font-mono text-[10px] text-zinc-500">
                      {formatDossierTimestamp(evRow.timestampIso)}
                    </div>
                    {phase != null ? (
                      <p className="mt-0.5 text-[10px] text-zinc-700 dark:text-zinc-300">
                        <span className="text-zinc-500">Phase </span>
                        <span className="font-mono">{phase}</span>
                      </p>
                    ) : null}
                    {stateHint ? (
                      <p className="mt-0.5 text-[10px] text-zinc-700 dark:text-zinc-300">
                        <span className="text-zinc-500">State </span>
                        {stateHint}
                      </p>
                    ) : null}
                    {olderActorLine != null ? (
                      <p className="mt-0.5 text-[10px] text-zinc-700 dark:text-zinc-300">
                        <span className="text-zinc-500">Actor </span>
                        {olderActorLine}
                      </p>
                    ) : null}
                    <TimelineEventInspectLink projectId={pidQ} ev={evRow} />
                    {olderUserMsg ? (
                      <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                        {olderUserMsg}
                      </p>
                    ) : null}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[9px] text-zinc-500">Technical</summary>
                      <PidMilestoneTechnicalDetails ev={evRow} />
                    </details>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
        {ch.leadingIndicators.length > 0 ? (
          <details className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <summary className="cursor-pointer text-[11px] text-zinc-600 dark:text-zinc-400">
              Leading indicators ({ch.leadingIndicators.length})
            </summary>
            <ul className="mt-2 list-none space-y-2 text-[11px] text-zinc-600 dark:text-zinc-400">
              {ch.leadingIndicators.map((evRow) => (
                <li
                  key={evRow.eventId}
                  className="rounded-md border border-zinc-100 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <div>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {formatDossierTimestamp(evRow.timestampIso)}
                    </span>
                    {" · "}
                    {TIMELINE_EVENT_LABELS[evRow.eventAction]}
                    {evRow.message?.trim() ? ` — ${clipText(evRow.message.trim(), 72)}` : ""}
                  </div>
                  {projectId.trim() ? (
                    <TimelineEventInspectLink projectId={projectId.trim()} ev={evRow} />
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default function DeliveriesPidPanel({ projectId }: DeliveriesPidPanelProps) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const urlPidMilestoneRaw = useMemo(() => {
    const a = searchParams.get("pidMilestone")?.trim() ?? "";
    const b = searchParams.get("pidMilestoneKey")?.trim() ?? "";
    return a || b;
  }, [searchParams]);

  /** Both query names supported; `pidMilestone` wins when both are set (same as effective raw). */
  const pidQueryParts = useMemo(() => {
    const pidMilestone = searchParams.get("pidMilestone")?.trim() ?? "";
    const pidMilestoneKey = searchParams.get("pidMilestoneKey")?.trim() ?? "";
    const pidPhase = searchParams.get("pidPhase")?.trim() ?? "";
    const referencePhase = searchParams.get("referencePhase")?.trim() ?? "";
    return { pidMilestone, pidMilestoneKey, pidPhase, referencePhase };
  }, [searchParams]);

  const pidUrlFocus = useMemo(() => resolvePidUrlFocus(searchParams), [searchParams]);

  const firstInBandMilestone = useMemo(
    () =>
      pidUrlFocus.effectivePhase != null
        ? firstPidMilestoneKeyInSameUiBand(pidUrlFocus.effectivePhase)
        : null,
    [pidUrlFocus.effectivePhase]
  );

  const highlightedBandId =
    pidUrlFocus.effectivePhase != null
      ? pidUiBandIdForReferencePhase(pidUrlFocus.effectivePhase)
      : null;

  const [checklistPhasePick, setChecklistPhasePick] = useState<ChecklistPhaseSelection>("0");
  const [urlContextPanelOpen, setUrlContextPanelOpen] = useState(false);
  useEffect(() => {
    if (pidUrlFocus.effectivePhase != null) {
      setChecklistPhasePick(pidUrlFocus.effectivePhase);
    }
  }, [pidUrlFocus.effectivePhase]);

  const initialKey = useMemo((): PidMilestoneKey | "" => {
    if (urlPidMilestoneRaw && isPidMilestoneKey(urlPidMilestoneRaw)) return urlPidMilestoneRaw;
    return "";
  }, [urlPidMilestoneRaw]);

  const [milestoneKey, setMilestoneKey] = useState<PidMilestoneKey | "">("");

  useEffect(() => {
    setMilestoneKey(initialKey);
  }, [initialKey]);

  const [lifecyclePhase, setLifecyclePhase] = useState("");

  useEffect(() => {
    const ph = pidUrlFocus.referencePhaseFromQuery;
    if (ph == null || pidUrlFocus.milestoneKey != null) return;
    setLifecyclePhase((prev) => (prev.trim() === "" ? ph : prev));
  }, [pidUrlFocus.referencePhaseFromQuery, pidUrlFocus.milestoneKey]);
  const [stateHint, setStateHint] = useState("");
  const [dateLocal, setDateLocal] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [actorLabel, setActorLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [docTitle, setDocTitle] = useState("");
  const [docLocation, setDocLocation] = useState("");
  const [docDateLocal, setDocDateLocal] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [clientUrl, setClientUrl] = useState("");

  useEffect(() => {
    setClientUrl(`${window.location.pathname}${window.location.search}`);
  }, [searchParams]);

  /** “To do” / missing-slot links use `#deliveries-pid-document` — open the panel and scroll. */
  useEffect(() => {
    const sendTimelineHashes = new Set([
      "deliveries-pid-document",
      "deliveries-pid-upload",
      "deliveries-pid-custom-slot",
      "deliveries-pid-reference",
      "deliveries-pid-register",
    ]);
    const sync = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (!id || !sendTimelineHashes.has(id)) return;
      const panel = document.getElementById("deliveries-pid-document") as HTMLDetailsElement | null;
      if (panel) panel.open = true;
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const [customSlotLabel, setCustomSlotLabel] = useState("");
  /** When true, phase-based default title is not overwritten. */
  const [customSlotTitleTouched, setCustomSlotTitleTouched] = useState(false);
  const [customSlotNotes, setCustomSlotNotes] = useState("");
  const [customSlotSubmitting, setCustomSlotSubmitting] = useState(false);
  const [customSlotError, setCustomSlotError] = useState<string | null>(null);

  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pidTimelineSignContext = useMemo(() => {
    const expectationId = searchParams.get(PID_EXPECTATION_ID_PARAM)?.trim() ?? "";
    if (!expectationId || !isPidTraceSignIntent(searchParams.get(PID_TRACE_INTENT_PARAM))) {
      return null;
    }
    const found = findPhaseDocumentExpectationById(expectationId);
    return { expectationId, found };
  }, [searchParams]);

  const signPrefillNonce = useMemo(() => {
    const e = searchParams.get(PID_EXPECTATION_ID_PARAM)?.trim() ?? "";
    const i = searchParams.get(PID_TRACE_INTENT_PARAM)?.trim() ?? "";
    return isPidTraceSignIntent(i) && e ? `${i}:${e}` : "";
  }, [searchParams]);

  /** Phase driving the default Title line (checklist strip; no phase when strip is All). */
  const effectivePhaseForDefault = useMemo((): ReferencePhaseId | null => {
    if (checklistPhasePick !== CHECKLIST_PHASE_ALL) {
      return checklistPhasePick as ReferencePhaseId;
    }
    return null;
  }, [checklistPhasePick]);

  const defaultCustomSlotTitle = useMemo(() => {
    if (pidTimelineSignContext?.found) {
      const { exp } = pidTimelineSignContext.found;
      if (exp.match?.pidMilestoneKeys?.length) {
        return defaultSignoffTitleForReferencePhase(effectivePhaseForDefault);
      }
      if (signPrefillNonce) {
        return exp.label;
      }
    }
    return defaultSignoffTitleForReferencePhase(effectivePhaseForDefault);
  }, [pidTimelineSignContext, signPrefillNonce, effectivePhaseForDefault]);

  useEffect(() => {
    setCustomSlotTitleTouched(false);
  }, [projectId]);

  useEffect(() => {
    if (customSlotTitleTouched) return;
    setCustomSlotLabel(defaultCustomSlotTitle);
  }, [customSlotTitleTouched, defaultCustomSlotTitle]);

  const [seedBaseDate, setSeedBaseDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [seedSpacingDays, setSeedSpacingDays] = useState(30);
  const [seedForce, setSeedForce] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const [dossierEvents, setDossierEvents] = useState<ParsedTimelineEvent[]>([]);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [dossierRefresh, setDossierRefresh] = useState(0);

  const loadDossier = useCallback(async () => {
    const id = projectId.trim();
    if (!id) {
      setDossierEvents([]);
      return;
    }
    setDossierLoading(true);
    setDossierError(null);
    try {
      const res = await fetch(`/api/timeline?projectId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        events?: ParsedTimelineEvent[];
      };
      if (!res.ok) {
        setDossierError(j.error ?? res.statusText);
        setDossierEvents([]);
        return;
      }
      setDossierEvents(Array.isArray(j.events) ? j.events : []);
    } catch {
      setDossierError("Network error");
      setDossierEvents([]);
    } finally {
      setDossierLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDossier();
  }, [loadDossier, dossierRefresh]);

  const dossierChapters = useMemo(() => buildPidDossierChapters(dossierEvents), [dossierEvents]);
  const dossierTail = useMemo(
    () => trailingNonPidAfterLastMilestone(dossierEvents, dossierChapters),
    [dossierEvents, dossierChapters]
  );

  const dossierLifecycleEvents = useMemo(
    () => dossierEvents.map(parsedToLifecycleOverview),
    [dossierEvents]
  );

  const dossierPhaseBuckets = useMemo(
    () => groupLifecycleEventsByPhase(dossierLifecycleEvents),
    [dossierLifecycleEvents]
  );

  const phaseStripSlotCounts = useMemo(() => {
    const m = new Map<ReferencePhaseId, { satisfied: number; total: number }>();
    for (const id of REFERENCE_PHASE_IDS) {
      const phaseEvents = dossierPhaseBuckets.phases.find((p) => p.phase === id)?.events ?? [];
      m.set(id, phaseChecklistSlotCounts(id, phaseEvents));
    }
    return m;
  }, [dossierPhaseBuckets]);

  useLayoutEffect(() => {
    if (dossierLoading || pidUrlFocus.effectivePhase == null) return;
    const bandId = pidUiBandIdForReferencePhase(pidUrlFocus.effectivePhase);
    const el = document.getElementById(`deliveries-pid-band-${bandId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [dossierLoading, pidUrlFocus.effectivePhase, dossierChapters.length, searchParams]);

  const bumpDossier = useCallback(() => setDossierRefresh((n) => n + 1), []);

  const seedTemplate = useCallback(async () => {
    setSeedError(null);
    const baseIso = seedBaseDate.trim()
      ? `${seedBaseDate.trim()}T12:00:00.000Z`
      : new Date().toISOString();
    setSeeding(true);
    try {
      const res = await fetch("/api/timeline/seed-pid-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          baseDateIso: baseIso,
          spacingDays: seedSpacingDays,
          force: seedForce,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        appended?: number;
      };
      if (!res.ok) {
        setSeedError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({
        type: "success",
        message: `Appended ${j.appended ?? PID_MILESTONE_KEYS.length} PID template milestones — open Timeline and use “PID milestones” filter`,
      });
      bumpDossier();
    } catch {
      setSeedError("Network error");
    } finally {
      setSeeding(false);
    }
  }, [bumpDossier, projectId, seedBaseDate, seedForce, seedSpacingDays, showToast]);

  const submit = useCallback(async () => {
    setError(null);
    if (!milestoneKey) {
      setError("Choose a milestone key.");
      return;
    }
    const ts = dateLocal.trim()
      ? new Date(`${dateLocal.trim()}T12:00:00.000Z`).toISOString()
      : new Date().toISOString();
    setSubmitting(true);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          eventAction: "pid_reference_milestone",
          pidMilestoneKey: milestoneKey,
          ...(lifecyclePhase.trim() && /^[0-9]$/.test(lifecyclePhase.trim())
            ? { pidLifecyclePhase: lifecyclePhase.trim() }
            : {}),
          ...(stateHint.trim() ? { pidStateHint: stateHint.trim() } : {}),
          timestampIso: ts,
          ...(actorLabel.trim() ? { actorLabel: actorLabel.trim() } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        setError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({ type: "success", message: "Milestone added" });
      bumpDossier();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }, [actorLabel, dateLocal, lifecyclePhase, milestoneKey, projectId, bumpDossier, showToast, stateHint]);

  const submitDocumentRef = useCallback(async () => {
    setDocError(null);
    const title = docTitle.trim();
    if (!title) {
      setDocError("Enter a document title or short label.");
      return;
    }
    const ts = docDateLocal.trim()
      ? new Date(`${docDateLocal.trim()}T12:00:00.000Z`).toISOString()
      : new Date().toISOString();
    const loc = docLocation.trim() || "—";
    const message = [`Title: ${title}`, `Location: ${loc}`].join("\n");
    setDocSubmitting(true);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          eventAction: "document_reference_logged",
          message,
          timestampIso: ts,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        setDocError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({ type: "success", message: "Link added" });
      setDocTitle("");
      setDocLocation("");
      bumpDossier();
    } catch {
      setDocError("Network error");
    } finally {
      setDocSubmitting(false);
    }
  }, [bumpDossier, docDateLocal, docLocation, docTitle, projectId, showToast]);

  const submitDocumentUpload = useCallback(async () => {
    setUploadError(null);
    const input = uploadFileRef.current;
    const file = input?.files?.[0] ?? null;
    if (!file) {
      setUploadError("Choose a file.");
      return;
    }
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("file", file);
    setUploadSubmitting(true);
    try {
      const res = await fetch("/api/timeline/document-upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
      };
      if (!res.ok) {
        setUploadError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({ type: "success", message: "File stored on timeline" });
      if (input) input.value = "";
      bumpDossier();
    } catch {
      setUploadError("Network error");
    } finally {
      setUploadSubmitting(false);
    }
  }, [bumpDossier, projectId, showToast]);

  const submitCustomSlot = useCallback(async () => {
    setCustomSlotError(null);
    const label = customSlotLabel.trim();
    if (!label) {
      setCustomSlotError("Enter a name or label for this trace slot.");
      return;
    }
    const ts = new Date().toISOString();
    const expectationIdFromUrl = searchParams.get(PID_EXPECTATION_ID_PARAM)?.trim() ?? "";
    const expMeta = expectationIdFromUrl ? findPhaseDocumentExpectationById(expectationIdFromUrl) : null;
    let phaseDigit =
      checklistPhasePick === CHECKLIST_PHASE_ALL ? "" : checklistPhasePick;
    if ((!phaseDigit || !/^[0-9]$/.test(phaseDigit)) && expMeta != null) {
      phaseDigit = expMeta.phase;
    }
    const message = buildDeliveriesPidCustomSlotTimelineMessage({
      label,
      phaseDigit,
      notes: customSlotNotes,
      ...(expectationIdFromUrl ? { expectationId: expectationIdFromUrl } : {}),
    });
    setCustomSlotSubmitting(true);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          eventAction: "manual_note",
          message,
          timestampIso: ts,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
      };
      if (!res.ok) {
        setCustomSlotError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({ type: "success", message: "Note added" });
      setCustomSlotTitleTouched(false);
      setCustomSlotNotes("");
      bumpDossier();
    } catch {
      setCustomSlotError("Network error");
    } finally {
      setCustomSlotSubmitting(false);
    }
  }, [bumpDossier, checklistPhasePick, customSlotLabel, customSlotNotes, projectId, searchParams, showToast]);

  const showUrlHint = Boolean(
    pidQueryParts.pidMilestone ||
      pidQueryParts.pidMilestoneKey ||
      pidQueryParts.pidPhase ||
      pidQueryParts.referencePhase
  );
  const urlHintInvalid =
    Boolean(urlPidMilestoneRaw) && !isPidMilestoneKey(urlPidMilestoneRaw);

  const urlDrivenDetailVisible =
    pidUrlFocus.effectivePhase != null ||
    pidUrlFocus.invalidMilestoneToken != null ||
    pidUrlFocus.invalidPhaseToken != null;

  return (
    <section className="space-y-4 pt-2" aria-label="PID lifecycle">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            PID / process lifecycle
          </h2>
          {projectId.trim() ? (
            <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              <a
                href={`/api/timeline/document-pack?projectId=${encodeURIComponent(projectId.trim())}`}
                download
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
              >
                Download audit pack (.md)
              </a>
              <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
                {" "}
                ·{" "}
              </span>
              <a
                href="#deliveries-pid-document"
                className="font-medium text-zinc-600 underline underline-offset-2 hover:no-underline dark:text-zinc-300"
              >
                Log document reference
              </a>{" "}
              (form under PID dossier)
              <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
                {" "}
                ·{" "}
              </span>
              <button
                type="button"
                onClick={() => setUrlContextPanelOpen((o) => !o)}
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
                aria-expanded={urlContextPanelOpen}
                aria-controls="deliveries-pid-url-context"
              >
                {urlContextPanelOpen ? "Hide URL" : "URL"}
              </button>
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <a
                href="#deliveries-pid-document"
                className="font-medium text-zinc-600 underline underline-offset-2 hover:no-underline dark:text-zinc-300"
              >
                Log document reference
              </a>{" "}
              — set a project id first.
              <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
                {" "}
                ·{" "}
              </span>
              <button
                type="button"
                onClick={() => setUrlContextPanelOpen((o) => !o)}
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
                aria-expanded={urlContextPanelOpen}
                aria-controls="deliveries-pid-url-context"
              >
                {urlContextPanelOpen ? "Hide URL" : "URL"}
              </button>
            </p>
          )}
        </div>
      </div>

      {urlContextPanelOpen ? (
        <div id="deliveries-pid-url-context" className="space-y-2">
          {showUrlHint ? (
            <div
              className="rounded-md border border-violet-200/90 bg-violet-50/95 px-2 py-1.5 text-[10px] leading-snug text-violet-950 shadow-sm dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-100"
              role="status"
              aria-live="polite"
            >
              <span className="font-semibold">From URL</span>
              <span className="mx-1 text-violet-400 dark:text-violet-600" aria-hidden>
                ·
              </span>
              {pidQueryParts.pidMilestone ? (
                <code className="break-all font-mono text-[9px]">
                  pidMilestone={pidQueryParts.pidMilestone}
                </code>
              ) : null}
              {pidQueryParts.pidMilestone && pidQueryParts.pidMilestoneKey ? (
                <span className="mx-1 text-violet-400 dark:text-violet-600" aria-hidden>
                  ·
                </span>
              ) : null}
              {pidQueryParts.pidMilestoneKey ? (
                <code className="break-all font-mono text-[9px]">
                  pidMilestoneKey={pidQueryParts.pidMilestoneKey}
                </code>
              ) : null}
              {pidQueryParts.pidMilestone || pidQueryParts.pidMilestoneKey ? (
                <span className="mx-1 text-violet-400 dark:text-violet-600" aria-hidden>
                  ·
                </span>
              ) : null}
              {pidQueryParts.pidPhase ? (
                <code className="break-all font-mono text-[9px]">pidPhase={pidQueryParts.pidPhase}</code>
              ) : null}
              {pidQueryParts.pidPhase && pidQueryParts.referencePhase ? (
                <span className="mx-1 text-violet-400 dark:text-violet-600" aria-hidden>
                  ·
                </span>
              ) : null}
              {pidQueryParts.referencePhase ? (
                <code className="break-all font-mono text-[9px]">
                  referencePhase={pidQueryParts.referencePhase}
                </code>
              ) : null}
              {urlHintInvalid ? (
                <span className="mt-0.5 block text-amber-800 dark:text-amber-200">
                  Not an allowlisted milestone — ignored for prefill.
                </span>
              ) : initialKey ? (
                <span className="mt-0.5 block text-violet-800/90 dark:text-violet-200/95">
                  Milestone pre-selected in <strong className="font-medium">Register PID milestone</strong>.
                </span>
              ) : pidUrlFocus.referencePhaseFromQuery && !pidUrlFocus.invalidPhaseToken ? (
                <span className="mt-0.5 block text-violet-800/90 dark:text-violet-200/95">
                  Reference phase <strong className="font-mono">{pidUrlFocus.referencePhaseFromQuery}</strong> from
                  URL — dossier band below is highlighted and scrolled into view.
                </span>
              ) : (
                <span className="mt-0.5 block text-zinc-600 dark:text-zinc-400">
                  No valid milestone or phase in URL.
                </span>
              )}
            </div>
          ) : null}

          {urlDrivenDetailVisible ? (
            <div
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-[12px] leading-snug text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              role="region"
              aria-label="PID deep link context"
            >
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                URL-driven view
              </p>
              {pidUrlFocus.effectivePhase != null ? (
                <p className="mt-1 m-0">
                  <span className="text-zinc-500 dark:text-zinc-400">Reference phase </span>
                  <span className="font-mono tabular-nums">{pidUrlFocus.effectivePhase}</span>
                  <span className="text-zinc-500 dark:text-zinc-400"> — </span>
                  {REFERENCE_PHASE_LABELS[pidUrlFocus.effectivePhase]}
                </p>
              ) : null}
              {pidUrlFocus.milestoneKey ? (
                <p className="mt-1 m-0 text-zinc-600 dark:text-zinc-300">
                  Milestone{" "}
                  <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
                    {pidUrlFocus.milestoneKey}
                  </code>
                  {" — "}
                  {PID_MILESTONE_LABELS[pidUrlFocus.milestoneKey]}
                </p>
              ) : pidUrlFocus.referencePhaseFromQuery != null ? (
                <p className="mt-1 m-0 text-zinc-600 dark:text-zinc-300">
                  No <code className="font-mono text-[11px]">pidMilestone</code> in the URL — phase-only deep link.
                  The horizontal band for this phase group is highlighted.
                </p>
              ) : null}
              {pidUrlFocus.invalidMilestoneToken ? (
                <p className="mt-1 m-0 text-amber-800 dark:text-amber-200">
                  Unknown milestone key{" "}
                  <code className="font-mono text-[11px]">{pidUrlFocus.invalidMilestoneToken}</code>.
                </p>
              ) : null}
              {pidUrlFocus.invalidPhaseToken ? (
                <p className="mt-1 m-0 text-amber-800 dark:text-amber-200">
                  Unknown phase{" "}
                  <code className="font-mono text-[11px]">{pidUrlFocus.invalidPhaseToken}</code> (expect 0–9).
                </p>
              ) : null}
              {pidUrlFocus.effectivePhase == null &&
              (pidUrlFocus.invalidMilestoneToken || pidUrlFocus.invalidPhaseToken) ? (
                <p className="mt-1 m-0 break-all font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                  {clientUrl || "(URL not available on server render)"}
                </p>
              ) : null}
              {firstInBandMilestone && projectId.trim() ? (
                <p className="mt-2 m-0">
                  <Link
                    href={deliveriesPidTabUrl(projectId.trim(), { pidMilestone: firstInBandMilestone })}
                    className="font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300"
                  >
                    First PID milestone in this band
                  </Link>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" "}
                    — {PID_MILESTONE_LABELS[firstInBandMilestone]} (
                    <code className="font-mono text-[10px]">{firstInBandMilestone}</code>)
                  </span>
                </p>
              ) : null}
              {pidUrlFocus.effectivePhase == null &&
              (pidUrlFocus.invalidMilestoneToken || pidUrlFocus.invalidPhaseToken) &&
              projectId.trim() ? (
                <p className="mt-2 m-0">
                  <Link
                    href={deliveriesPidTabUrl(projectId.trim(), { pidMilestone: PID_MILESTONE_KEYS[0] })}
                    className="font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300"
                  >
                    Jump to first allowlisted milestone
                  </Link>
                  <span className="text-zinc-500 dark:text-zinc-400"> ({PID_MILESTONE_KEYS[0]})</span>
                </p>
              ) : null}
            </div>
          ) : !showUrlHint ? (
            <p className="m-0 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
              No <code className="font-mono text-[10px]">pidPhase</code>,{" "}
              <code className="font-mono text-[10px]">referencePhase</code>, or{" "}
              <code className="font-mono text-[10px]">pidMilestone</code> in the URL.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2" id="deliveries-pid-phase-actions">
        {!projectId.trim() ? (
          <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">
            Set a project id to load the timeline and show document actions by reference phase.
          </p>
        ) : (
          <>
            <nav
              className="-mx-1 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch]"
              aria-label="Reference phase checklist"
            >
              <div className="flex w-max flex-row items-stretch gap-1.5 px-1">
                {REFERENCE_PHASE_IDS.map((id) => {
                  const { satisfied, total } = phaseStripSlotCounts.get(id) ?? { satisfied: 0, total: 0 };
                  const selected = checklistPhasePick === id;
                  const hasSlots = total > 0;
                  const complete = hasSlots && satisfied === total;
                  const started = hasSlots && satisfied > 0 && !complete;
                  const pct = hasSlots ? Math.round((100 * satisfied) / total) : 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={REFERENCE_PHASE_LABELS[id]}
                      aria-label={`${REFERENCE_PHASE_LABELS[id]}${
                        hasSlots ? `, ${satisfied} of ${total} checklist slots on timeline` : ""
                      }`}
                      aria-pressed={selected}
                      onClick={() => setChecklistPhasePick(id)}
                      className={`relative inline-flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-md border px-2.5 py-1.5 pb-2 text-center text-xs font-medium leading-tight transition-colors ${deliveriesPidPhaseStripButtonClass({
                        selected,
                        complete,
                        started,
                        hasSlots,
                      })} ${dossierLoading ? "opacity-60" : "hover:opacity-95 active:scale-[0.98]"}`}
                    >
                      <span className="whitespace-nowrap">{REFERENCE_PHASE_LABELS[id]}</span>
                      {hasSlots ? (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200/90 dark:bg-zinc-700"
                          aria-hidden
                        >
                          <span
                            className={`block h-full ${complete ? "bg-emerald-500" : started ? "bg-amber-500" : "bg-transparent"}`}
                            style={{ width: complete ? "100%" : `${pct}%` }}
                          />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  title="All phases — detailed horizontal checklist"
                  aria-label="All phases, detailed checklist"
                  aria-pressed={checklistPhasePick === CHECKLIST_PHASE_ALL}
                  onClick={() => setChecklistPhasePick(CHECKLIST_PHASE_ALL)}
                  className={`inline-flex shrink-0 items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${deliveriesPidPhaseStripAllButtonClass(
                    checklistPhasePick === CHECKLIST_PHASE_ALL
                  )} ${dossierLoading ? "opacity-60" : "hover:opacity-95 active:scale-[0.98]"}`}
                >
                  All
                </button>
              </div>
            </nav>
            {!dossierLoading && !dossierError && checklistPhasePick !== CHECKLIST_PHASE_ALL ? (
              <PhaseDocumentActionBar
                projectId={projectId.trim()}
                phase={checklistPhasePick}
                allEvents={dossierEvents}
                variant="deliveries"
              />
            ) : dossierLoading ? (
              <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">Loading timeline…</p>
            ) : dossierError ? (
              <p className="m-0 text-[11px] text-red-600 dark:text-red-400" role="alert">
                {dossierError}
              </p>
            ) : null}
          </>
        )}
      </div>

      <CollapseSection
        id="deliveries-pid-phase-checklist"
        title="Detailed checklist & document trail"
        defaultOpen={false}
      >
        {!projectId.trim() ? (
          <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">
            Set a project id to load horizontal slot cards and the project document list.
          </p>
        ) : dossierLoading ? (
          <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">Loading timeline…</p>
        ) : dossierError ? (
          <p className="m-0 text-[11px] text-red-600 dark:text-red-400" role="alert">
            {dossierError}
          </p>
        ) : (
          <TimelinePhaseDocumentInspector
            contextEvent={PID_PHASE_CHECKLIST_CONTEXT_ANCHOR}
            allEvents={dossierEvents}
            projectId={projectId.trim()}
            phaseOverride={
              checklistPhasePick === CHECKLIST_PHASE_ALL ? undefined : checklistPhasePick
            }
            showAllPhasesChecklist={checklistPhasePick === CHECKLIST_PHASE_ALL}
            embed
          />
        )}
      </CollapseSection>

      <CollapseSection title="PID dossier (from timeline)" defaultOpen={false}>
        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
          <ProjectDebugFileRow projectId={projectId} />
          {dossierLoading ? (
            <p className="text-zinc-500 dark:text-zinc-500">Loading timeline…</p>
          ) : null}
          {dossierError ? (
            <p className="text-red-600 dark:text-red-400" role="alert">
              {dossierError}
            </p>
          ) : null}
          {!dossierLoading && !dossierError ? (
            <div className="space-y-4">
              <PidDossierChecklistSummary
                projectId={projectId.trim()}
                lifecycleEvents={dossierLifecycleEvents}
                phaseFilter={
                  checklistPhasePick === CHECKLIST_PHASE_ALL ? "all" : checklistPhasePick
                }
              />
              <div
                className="-mx-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
                aria-label="PID lifecycle — phase bands and milestone cards, scroll horizontally"
              >
                <div className="flex w-max flex-row items-start gap-2 px-1 sm:gap-3">
                  {PID_DOSSIER_TAB_SECTIONS.map((section, sectionIdx) => {
                    const theme = PID_DOSSIER_BAND_THEME[section.id];
                    const phaseSet = new Set<string>(section.phaseRange);
                    const sectionChapters = dossierChapters.filter((ch) =>
                      phaseSet.has(PID_MILESTONE_REFERENCE_PHASE[ch.key])
                    );
                    return (
                      <Fragment key={section.id}>
                        {sectionIdx > 0 ? (
                          <div
                            className="w-px shrink-0 self-stretch bg-zinc-200/90 dark:bg-zinc-700/90"
                            aria-hidden
                          />
                        ) : null}
                        <section
                          id={`deliveries-pid-band-${section.id}`}
                          className={`flex min-w-0 shrink-0 flex-col gap-2 scroll-mt-4 ${
                            highlightedBandId === section.id
                              ? "rounded-xl ring-2 ring-violet-500/75 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
                              : ""
                          }`}
                          aria-labelledby={`pid-band-${section.id}-title`}
                        >
                          <header
                            className={`min-w-[9rem] max-w-[14rem] rounded-lg border px-2 py-2 shadow-sm ${theme.marker}`}
                            title={section.description}
                          >
                            <h3
                              id={`pid-band-${section.id}-title`}
                              className={`m-0 text-[11px] font-semibold leading-snug tracking-tight ${theme.markerTitle}`}
                            >
                              {section.title}{" "}
                              <span className={`font-medium ${theme.markerMeta}`}>
                                · {section.phaseLabelShort}
                              </span>
                            </h3>
                          </header>
                          <div className="flex flex-row items-stretch gap-2">
                            {sectionChapters.length === 0 ? (
                              <p
                                className={`rounded-lg border border-dashed border-zinc-200/90 px-3 py-6 text-center text-[11px] leading-snug text-zinc-500 dark:border-zinc-700 dark:text-zinc-500`}
                              >
                                No milestones yet
                              </p>
                            ) : (
                              sectionChapters.map((ch) => (
                                <PidDossierChapterCard
                                  key={ch.key}
                                  ch={ch}
                                  projectId={projectId}
                                  accentBarClass={theme.bar}
                                />
                              ))
                            )}
                          </div>
                        </section>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              {dossierTail.length > 0 ? (
                <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <p className="mb-2 text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    After last PID milestone
                  </p>
                  <div
                    className="-mx-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
                    aria-label="Events after last PID milestone — scroll horizontally"
                  >
                    <div className="flex w-max flex-row items-stretch gap-2 px-1">
                      {dossierTail.map((evRow) => (
                        <div key={evRow.eventId} className={deliveriesPidCompactEventCard}>
                          <div className="font-mono text-[10px] text-zinc-500">
                            {formatDossierTimestamp(evRow.timestampIso)}
                          </div>
                          <p className="mt-1 text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                            {TIMELINE_EVENT_LABELS[evRow.eventAction]}
                          </p>
                          {evRow.message?.trim() ? (
                            <p className="mt-1 line-clamp-3 text-[11px] text-zinc-600 dark:text-zinc-400">
                              {clipText(evRow.message.trim(), 100)}
                            </p>
                          ) : null}
                          {projectId.trim() ? (
                            <TimelineEventInspectLink projectId={projectId.trim()} ev={evRow} />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </CollapseSection>

      <section aria-label="Send to project timeline">
        <CollapseSection
          id="deliveries-pid-document"
          title="Send to project timeline"
          defaultOpen={false}
          className="scroll-mt-4"
        >
          <div className="max-w-xl space-y-8 text-sm text-zinc-800 dark:text-zinc-200">
            <div id="deliveries-pid-upload" className="scroll-mt-4 space-y-2">
              <p className="m-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Upload
              </p>
              <input
                ref={uploadFileRef}
                type="file"
                className="block w-full max-w-lg text-[13px] file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-[11px] file:font-medium dark:file:bg-zinc-800"
              />
              {uploadError ? (
                <p className="m-0 text-xs text-red-600 dark:text-red-400" role="alert">
                  {uploadError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={uploadSubmitting || !projectId.trim()}
                onClick={() => void submitDocumentUpload()}
              >
                {uploadSubmitting ? "…" : "Upload"}
              </Button>
            </div>

            <div id="deliveries-pid-custom-slot" className="scroll-mt-4 space-y-2">
              <p className="m-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Note
              </p>
              <input
                id="deliveries-pid-custom-slot-title"
                type="text"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950"
                value={customSlotLabel}
                onChange={(e) => {
                  setCustomSlotTitleTouched(true);
                  setCustomSlotLabel(e.target.value);
                }}
                autoComplete="off"
              />
              <textarea
                id="deliveries-pid-custom-slot-notes"
                rows={3}
                className="w-full resize-y rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950"
                value={customSlotNotes}
                onChange={(e) => setCustomSlotNotes(e.target.value)}
              />
              {customSlotError ? (
                <p className="m-0 text-xs text-red-600 dark:text-red-400" role="alert">
                  {customSlotError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="primary"
                disabled={customSlotSubmitting || !projectId.trim()}
                onClick={() => void submitCustomSlot()}
              >
                {customSlotSubmitting ? "…" : "Add note"}
              </Button>
            </div>

            <div id="deliveries-pid-reference" className="scroll-mt-4 space-y-2">
              <p className="m-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Link
              </p>
              <input
                type="text"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950"
                placeholder="Title"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
              />
              <input
                type="text"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[12px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="URL or path"
                value={docLocation}
                onChange={(e) => setDocLocation(e.target.value)}
              />
              <input
                type="date"
                className="w-full max-w-xs rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={docDateLocal}
                onChange={(e) => setDocDateLocal(e.target.value)}
              />
              {docError ? (
                <p className="m-0 text-xs text-red-600 dark:text-red-400" role="alert">
                  {docError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={docSubmitting || !projectId.trim()}
                onClick={() => void submitDocumentRef()}
              >
                {docSubmitting ? "…" : "Add link"}
              </Button>
            </div>

            <div id="deliveries-pid-register" className="scroll-mt-4 space-y-2">
              <p className="m-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Milestone
              </p>
              <select
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={milestoneKey}
                onChange={(e) =>
                  setMilestoneKey(
                    e.target.value && isPidMilestoneKey(e.target.value) ? e.target.value : ""
                  )
                }
              >
                <option value="">—</option>
                {PID_MILESTONE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PID_MILESTONE_LABELS[k]}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="w-full max-w-xs rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={dateLocal}
                onChange={(e) => setDateLocal(e.target.value)}
              />
              {error ? (
                <p className="m-0 text-xs text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="button" variant="primary" disabled={submitting || !projectId.trim()} onClick={() => void submit()}>
                {submitting ? "…" : "Add milestone"}
              </Button>
            </div>
          </div>
        </CollapseSection>
      </section>

      <CollapseSection title="Template PID timeline (fill empty project)" defaultOpen={false}>
        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            Appends <strong className="text-zinc-800 dark:text-zinc-200">one row per PID milestone</strong>{" "}
            (<span className="font-mono text-[12px]">{PID_MILESTONE_KEYS.length}</span> events) with{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
              pid_reference_milestone
            </code>
            , synthetic spacing, and{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
              source=pid-template-seed
            </code>
            . Use real dates later by adding manual milestones or editing the TTL if needed.
          </p>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">First milestone date</span>
            <input
              type="date"
              className="w-full max-w-xs rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={seedBaseDate}
              onChange={(e) => setSeedBaseDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Days between milestones</span>
            <input
              type="number"
              min={1}
              max={3650}
              className="w-32 rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={Number.isFinite(seedSpacingDays) ? seedSpacingDays : 30}
              onChange={(e) => setSeedSpacingDays(Number(e.target.value) || 30)}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-zinc-300 dark:border-zinc-600"
              checked={seedForce}
              onChange={(e) => setSeedForce(e.target.checked)}
            />
            <span>Force append even if PID milestones already exist</span>
          </label>
          {seedError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {seedError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={seeding || !projectId.trim()}
              onClick={() => void seedTemplate()}
            >
              {seeding ? "Appending…" : "Append full PID template"}
            </Button>
            <InfoDetails label="When to use">
              <p className="text-[13px]">
                Empty <code className="font-mono">*-timeline.ttl</code> and you want the PID strip to show
                something immediately. On <strong>/timeline</strong>, switch the log to{" "}
                <strong>PID milestones</strong> to see only these rows.
              </p>
            </InfoDetails>
          </div>
        </div>
      </CollapseSection>
    </section>
  );
}
