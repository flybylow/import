"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { useProjectId } from "@/lib/useProjectId";
import { EPCIS_JSON_SEPARATOR, getEpcisHumanNotesForRow } from "@/lib/timeline/epcis";
import type {
  TimelineBestekBindingFields,
  TimelineEpcisFields,
  TimelinePidReferenceFields,
} from "@/lib/timeline-events";
import {
  PID_MILESTONE_LABELS,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";
import {
  extractIfcCategoryFromTitle,
  formatUtcMonthRail,
  ifcCategoryColor,
  utcMonthKey,
} from "@/lib/timeline/construction-visual";
import {
  globalIdToExpressIdMap,
  parseBimGlobalIdsFromMessage,
  parseKbElementExpressIdsFromMessage,
  resolveKbMaterialIdFromMaterialReference,
  resolveTimelineExpressIdsForLinks,
} from "@/lib/timeline/construction-buildup";
import {
  loadPhase4PassportsAllInstancesCached,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import {
  bimBuildingElementHref,
  bimPassportsElementHref,
  kbFocusMaterialHref,
  kbGraphElementHref,
} from "@/lib/passport-navigation-links";
import {
  TIMELINE_EVENT_ACTIONS,
  TIMELINE_EVENT_LABELS,
  TIMELINE_TARGET_EXPRESS_OPTIONS,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";
import {
  provenanceLinkIsExternal,
  timelineProvenanceForEvent,
  type TimelineProvenanceBundle,
  type TimelineProvenanceHrefItem,
} from "@/lib/timeline-source-provenance";

const TimelineKbGraph = dynamic(
  () => import("@/components/TimelineKbGraph"),
  { ssr: false, loading: () => <p className="text-sm text-zinc-500">Loading graph…</p> }
);

const TIMELINE_PROJECT_PRESETS: readonly { id: string; label: string }[] = [
  { id: "example", label: "example" },
  { id: "schependomlaan-2015", label: "schependomlaan-2015" },
  {
    id: "lca-stakeholder-review",
    label: "LCA stakeholder review (demo thread)",
  },
  {
    id: "f01adaf1-a660-46d2-aecd-8ad95505207f",
    label: "f01adaf1… (UUID)",
  },
];

/** `?view=graph` opens the Timeline KB graph; default is normal timeline + strip. */
function parseTimelinePageView(sp: URLSearchParams): "normal" | "graph" {
  return sp.get("view") === "graph" ? "graph" : "normal";
}

/**
 * `?kbLayout=materialFlow` (or `material`) uses material → work in the KB graph.
 * Omitted or unknown → timeline spine layout.
 */
function parseTimelineKbLayout(sp: URLSearchParams): "spine" | "materialFlow" {
  const raw = sp.get("kbLayout")?.trim().toLowerCase() ?? "";
  if (
    raw === "materialflow" ||
    raw === "material-flow" ||
    raw === "material" ||
    raw === "flow"
  ) {
    return "materialFlow";
  }
  return "spine";
}

type ParsedRow = {
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
  bcfFields?: { ifcGuid?: string; bcfIfcGuidsJson?: string };
  bestekBindingFields?: TimelineBestekBindingFields;
  bestekBindingSaveBatchId?: string;
  pidReferenceFields?: TimelinePidReferenceFields;
};

const MANUAL_FORM_EVENT_ACTIONS = TIMELINE_EVENT_ACTIONS.filter(
  (a) => a !== "pid_reference_milestone"
);

/** Local calendar day vs today — for Past / Today / Future badges. */
function eventCalendarDayTense(iso: string): "past" | "today" | "future" | "unknown" {
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

/**
 * Chronological lists (oldest → newest): "now" is the last today/past row before calendar-future rows,
 * otherwise the instant closest to wall-clock (e.g. PID-only view).
 */
function eventIdForJumpToNow(events: ParsedRow[]): string | null {
  if (events.length === 0) return null;
  let lastPastOrToday: string | null = null;
  for (const ev of events) {
    const tense = eventCalendarDayTense(ev.timestampIso);
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

function EventTimeTenseBadge({ iso }: { iso: string }) {
  const t = eventCalendarDayTense(iso);
  if (t === "unknown") return null;
  const label = t === "past" ? "Past" : t === "future" ? "Future" : "Today";
  const cls =
    t === "past"
      ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
      : t === "future"
        ? "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200"
        : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function formatTimelineStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Local calendar day for bucketing the event log (matches `formatTimelineStamp` locale day). */
function localCalendarDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDayColumnHeading(dayKey: string): string {
  const p = dayKey.split("-");
  if (p.length !== 3) return dayKey;
  const y = Number(p[0]);
  const mo = Number(p[1]);
  const day = Number(p[2]);
  if (!y || !mo || !day) return dayKey;
  const dt = new Date(y, mo - 1, day, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return dayKey;
  const nowY = new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(y !== nowY ? { year: "numeric" as const } : {}),
  }).format(dt);
}

function formatTimelineTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Calendar date in locale (for metadata blocks next to a separate time line). */
function formatTimelineDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function timelineHumanMessage(ev: ParsedRow): string {
  const jsonIdx = ev.message?.indexOf(EPCIS_JSON_SEPARATOR) ?? -1;
  const humanRaw = jsonIdx >= 0 ? ev.message!.slice(0, jsonIdx) : (ev.message ?? "");
  return humanRaw.trim();
}

type BestekBindingsMilestoneParsed = {
  titleLine: string;
  /** e.g. `data/{projectId}-bestek-bindings.json` */
  repoPath?: string;
  batchUuid?: string;
};

function parseBestekBindingsMilestoneHuman(human: string): BestekBindingsMilestoneParsed {
  const lines = human.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const titleLine = lines[0] ?? "";
  let repoPath: string | undefined;
  let batchUuid: string | undefined;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const batchM = /^batch\s+(.+)$/i.exec(line);
    if (batchM) {
      batchUuid = batchM[1]!.trim();
      continue;
    }
    if (line.startsWith("data/") || line.endsWith("bestek-bindings.json")) {
      repoPath = line;
    }
  }
  return { titleLine, repoPath, batchUuid };
}

function bestekBindingsFullPathTip(p: BestekBindingsMilestoneParsed): string {
  return [p.repoPath, p.batchUuid ? `batch ${p.batchUuid}` : ""].filter(Boolean).join(" · ");
}

function fileBasenameOnly(path: string): string {
  const s = path.replace(/\\/g, "/").trim();
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function shortBatchId(id: string): string {
  const v = id.trim();
  if (v.length <= 10) return v;
  return `${v.slice(0, 8)}…`;
}

/** Inline folder glyph for repo `data/…` hints (16×16). */
function DataFolderGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />
    </svg>
  );
}

/**
 * Compact `data/…` + batch line for bestek save milestones (cards, table, day stack, preview).
 */
function BestekBindingsMilestoneDataHint({
  parsed,
  className = "",
}: {
  parsed: BestekBindingsMilestoneParsed;
  className?: string;
}) {
  const { repoPath, batchUuid } = parsed;
  if (!repoPath && !batchUuid) return null;
  const name = repoPath ? fileBasenameOnly(repoPath) : "";
  const tip = [repoPath, batchUuid ? `batch ${batchUuid}` : ""].filter(Boolean).join(" · ");
  return (
    <span
      className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-zinc-600 dark:text-zinc-400 ${className}`.trim()}
      title={tip}
    >
      {repoPath ? (
        <span className="inline-flex min-w-0 max-w-full items-center gap-0.5">
          <DataFolderGlyph className="shrink-0 text-zinc-500 dark:text-zinc-500" />
          <span className="min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-300">{name}</span>
        </span>
      ) : null}
      {batchUuid ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
          batch {shortBatchId(batchUuid)}
        </span>
      ) : null}
    </span>
  );
}

function eventTitleAndSummary(ev: ParsedRow): { title: string; summary: string } {
  const human = timelineHumanMessage(ev);
  const notes = getEpcisHumanNotesForRow(ev);
  const notesJoined = notes.join(" · ");

  if (ev.eventAction === "bestek_bindings_milestone") {
    const parsed = parseBestekBindingsMilestoneHuman(human);
    const title = parsed.titleLine || TIMELINE_EVENT_LABELS[ev.eventAction];
    const parts: string[] = [];
    if (parsed.repoPath) parts.push(fileBasenameOnly(parsed.repoPath));
    if (parsed.batchUuid) parts.push(`batch ${shortBatchId(parsed.batchUuid)}`);
    const summary = parts.join(" · ") || notesJoined;
    return { title, summary };
  }

  if (ev.eventAction === "pid_reference_milestone" && ev.pidReferenceFields) {
    const pr = ev.pidReferenceFields;
    const mk = pr.milestoneKey;
    const title =
      isPidMilestoneKey(mk) ? PID_MILESTONE_LABELS[mk] : mk || TIMELINE_EVENT_LABELS[ev.eventAction];
    const bits: string[] = [];
    if (pr.lifecyclePhase) bits.push(`Phase ${pr.lifecyclePhase}`);
    if (pr.stateHint) bits.push(pr.stateHint);
    if (human) bits.push(human);
    const summary = bits.filter(Boolean).join(" · ") || notesJoined;
    return { title, summary };
  }

  if (ev.eventAction === "bestek_element_group_binding" && ev.bestekBindingFields) {
    const bk = ev.bestekBindingFields;
    const head = [bk.groupId, bk.ifcType, bk.articleNumber?.trim() ? `Art. ${bk.articleNumber}` : ""]
      .filter(Boolean)
      .join(" · ");
    const title = head || (human ? human.split(/\n/)[0]!.trim() : "") || TIMELINE_EVENT_LABELS[ev.eventAction];
    const batchShort = bk.bindingBatchId ? `save-batch ${bk.bindingBatchId.slice(0, 8)}…` : "";
    const summary = [batchShort, human, notesJoined].filter(Boolean).join(" · ");
    return { title, summary };
  }

  if (human) {
    const lines = human.split(/\n/).map((s) => s.trim()).filter(Boolean);
    const title = lines[0] ?? TIMELINE_EVENT_LABELS[ev.eventAction];
    const rest = lines.slice(1).join(" · ").trim();
    const summary = rest || notesJoined;
    return { title, summary };
  }

  if (notesJoined) {
    return { title: TIMELINE_EVENT_LABELS[ev.eventAction], summary: notesJoined };
  }

  const bits: string[] = [];
  if (ev.materialReference) bits.push(`Material / EPC: ${ev.materialReference}`);
  if (ev.targetExpressId != null) bits.push(`IFC expressId ${ev.targetExpressId}`);
  return {
    title: TIMELINE_EVENT_LABELS[ev.eventAction],
    summary: bits.join(" · "),
  };
}

function actorLine(ev: ParsedRow): string {
  return ev.actorSystem ? "System" : (ev.actorLabel ?? "").trim() || "—";
}

function metaLabelClass() {
  return "text-[9px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
}

function metaValueClass() {
  return "mt-0.5 text-[11px] leading-snug text-zinc-800 dark:text-zinc-200";
}

/** Single-line ellipsis; full string in `title` for hover. */
function EllipsisText(props: {
  text: string;
  className?: string;
  as?: "span" | "div" | "p";
}) {
  const { text, className = "", as: Tag = "span" } = props;
  return (
    <Tag
      className={`min-w-0 max-w-full truncate ${className}`.trim()}
      title={text}
    >
      {text}
    </Tag>
  );
}

/** One-line preview for list-view collapsible metadata (`title` shows full string). */
function eventLogMetadataSummaryLine(ev: ParsedRow): string {
  const parts: string[] = [actorLine(ev)];
  if (ev.source) parts.push(ev.source);
  if (ev.confidence !== undefined) parts.push(`${(ev.confidence * 100).toFixed(0)}%`);
  parts.push(ev.eventId);
  parts.push(
    `${formatTimelineDateOnly(ev.timestampIso)} · ${formatTimelineTimeOnly(ev.timestampIso)}`
  );
  return parts.join(" · ");
}

const provenanceUiLinkClass =
  "font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300";

/** Sheet + openBIM links — only under Preview → More → “Source files and data flow”. */
function TimelineProvenanceSheetNav({ bundle }: { bundle: TimelineProvenanceBundle }) {
  const items: TimelineProvenanceHrefItem[] = [
    ...(bundle.primarySheet ? [bundle.primarySheet] : []),
    ...(bundle.datasetLinks ?? []),
  ];
  if (items.length === 0) return null;
  return (
    <nav
      className="flex flex-col gap-0.5 text-[10px]"
      aria-label="Original as-planned sheet and dataset"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          {...(provenanceLinkIsExternal(item.href)
            ? { target: "_blank", rel: "noreferrer" as const }
            : {})}
          className={provenanceUiLinkClass}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function EventLogRowMetadataDl({ ev, projectId }: { ev: ParsedRow; projectId: string }) {
  const provenanceBundle = useMemo(
    () => timelineProvenanceForEvent(projectId.trim(), ev.source),
    [projectId, ev.source]
  );
  return (
    <dl className="space-y-2.5">
      <div className="min-w-0">
        <dt className={metaLabelClass()}>Actor</dt>
        <dd className={`${metaValueClass()} break-words`}>{actorLine(ev)}</dd>
      </div>
      {ev.source ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Source</dt>
          <dd className={`${metaValueClass()} font-mono text-[10px]`}>
            <EllipsisText text={ev.source} className="block" as="span" />
          </dd>
        </div>
      ) : null}
      {ev.confidence !== undefined ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Confidence</dt>
          <dd className={`${metaValueClass()} tabular-nums`}>
            {(ev.confidence * 100).toFixed(0)}%
          </dd>
        </div>
      ) : null}
      {ev.materialReference ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Material / EPC</dt>
          <dd className={`${metaValueClass()} text-zinc-700 dark:text-zinc-300`}>
            <EllipsisText
              text={ev.materialReference}
              className="block font-mono text-[10px]"
              as="span"
            />
          </dd>
        </div>
      ) : null}
      {ev.targetExpressId !== undefined ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>expressId</dt>
          <dd className={`${metaValueClass()} font-mono text-[10px]`}>{ev.targetExpressId}</dd>
        </div>
      ) : null}
      <div className="min-w-0">
        <dt className={metaLabelClass()}>eventId</dt>
        <dd className={metaValueClass()}>
          <EllipsisText
            text={ev.eventId}
            className="block font-mono text-[10px] text-zinc-700 dark:text-zinc-300"
            as="span"
          />
        </dd>
      </div>
      {ev.bestekBindingSaveBatchId ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Bestek save batch</dt>
          <dd className={`${metaValueClass()} font-mono text-[10px]`}>
            <EllipsisText text={ev.bestekBindingSaveBatchId} className="block" as="span" />
          </dd>
        </div>
      ) : null}
      {ev.bestekBindingFields?.bindingBatchId ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Binding batch (same save)</dt>
          <dd className={`${metaValueClass()} font-mono text-[10px]`}>
            <EllipsisText
              text={ev.bestekBindingFields.bindingBatchId}
              className="block"
              as="span"
            />
          </dd>
        </div>
      ) : null}
      {ev.eventAction === "bestek_bindings_milestone" && projectId.trim() ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Bestek in app</dt>
          <dd className={metaValueClass()}>
            <Link
              href={`/deliveries?tab=specification&specificationFiche=1&projectId=${encodeURIComponent(projectId.trim())}`}
              className={provenanceUiLinkClass}
              onClick={(e) => e.stopPropagation()}
            >
              Deliveries → Specification →
            </Link>
          </dd>
        </div>
      ) : null}
      {ev.pidReferenceFields ? (
        <>
          <div className="min-w-0">
            <dt className={metaLabelClass()}>PID milestone key</dt>
            <dd className={`${metaValueClass()} font-mono text-[10px]`}>
              {ev.pidReferenceFields.milestoneKey}
            </dd>
          </div>
          {ev.pidReferenceFields.lifecyclePhase ? (
            <div className="min-w-0">
              <dt className={metaLabelClass()}>Process phase</dt>
              <dd className={metaValueClass()}>{ev.pidReferenceFields.lifecyclePhase}</dd>
            </div>
          ) : null}
          {ev.pidReferenceFields.stateHint ? (
            <div className="min-w-0">
              <dt className={metaLabelClass()}>State hint</dt>
              <dd className={metaValueClass()}>{ev.pidReferenceFields.stateHint}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {ev.eventAction === "pid_reference_milestone" && projectId.trim() ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Register more</dt>
          <dd className={metaValueClass()}>
            <Link
              href={`/deliveries?tab=pid&projectId=${encodeURIComponent(projectId.trim())}`}
              className={provenanceUiLinkClass}
              onClick={(e) => e.stopPropagation()}
            >
              Deliveries → PID tab →
            </Link>
          </dd>
        </div>
      ) : null}
      <div className="min-w-0">
        <dt className={metaLabelClass()}>Timestamp</dt>
        <dd
          className={`${metaValueClass()} font-mono text-[10px] text-zinc-700 dark:text-zinc-300`}
          title={ev.timestampIso}
        >
          <span className="block truncate">{formatTimelineDateOnly(ev.timestampIso)}</span>
          <span className="mt-0.5 block truncate tabular-nums">
            {formatTimelineTimeOnly(ev.timestampIso)}
          </span>
        </dd>
      </div>
      {provenanceBundle ? (
        <div className="min-w-0">
          <dt className={metaLabelClass()}>Source files</dt>
          <dd className={`${metaValueClass()} space-y-1.5`}>
            <p className="text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
              {provenanceBundle.intro}
            </p>
            <ol className="list-decimal space-y-1.5 pl-3.5 text-[10px] text-zinc-700 dark:text-zinc-300">
              {provenanceBundle.steps.map((s) => (
                <li key={s.repoPath} className="min-w-0">
                  {s.href ? (
                    <Link
                      href={s.href}
                      {...(provenanceLinkIsExternal(s.href)
                        ? { target: "_blank", rel: "noreferrer" as const }
                        : {})}
                      className={provenanceUiLinkClass}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.label}
                    </Link>
                  ) : (
                    <span>{s.label}</span>
                  )}
                  <span className="mt-0.5 block font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                    {s.repoPath}
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href="/timeline/provenance"
              className="inline-block text-[10px] font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300"
              onClick={(e) => e.stopPropagation()}
            >
              All pipelines — data-flow page →
            </Link>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function EventLogRowMetadata(props: {
  ev: ParsedRow;
  projectId: string;
  /** Stack: full metadata block. List row: collapsible summary in the table. */
  layout?: "stack" | "listCollapsible";
}) {
  const { ev, projectId, layout = "stack" } = props;
  const summaryLine = eventLogMetadataSummaryLine(ev);

  if (layout === "listCollapsible") {
    return (
      <div className="border-t border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
        <details
          className="group min-w-0"
          aria-label="Event metadata; expand for labeled fields"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-left [&::-webkit-details-marker]:hidden">
            <span
              className="shrink-0 text-[9px] text-zinc-400 group-open:hidden dark:text-zinc-500"
              aria-hidden
            >
              ▶
            </span>
            <span
              className="hidden shrink-0 text-[9px] text-zinc-400 group-open:inline dark:text-zinc-500"
              aria-hidden
            >
              ▼
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[10px] leading-tight text-zinc-700 tabular-nums dark:text-zinc-300"
              title={summaryLine}
            >
              {summaryLine}
            </span>
          </summary>
          <div className="border-t border-zinc-100 px-2 pb-2 pt-1.5 dark:border-zinc-800">
            <p className={`mb-2 ${metaLabelClass()}`}>Metadata</p>
            <EventLogRowMetadataDl ev={ev} projectId={projectId} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/80 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className={`mb-2 ${metaLabelClass()}`}>Metadata</p>
      <EventLogRowMetadataDl ev={ev} projectId={projectId} />
    </div>
  );
}

function columnHoverSummary(ev: ParsedRow): string {
  const { title, summary } = eventTitleAndSummary(ev);
  let summaryForTip = summary;
  if (ev.eventAction === "bestek_bindings_milestone") {
    const full = bestekBindingsFullPathTip(
      parseBestekBindingsMilestoneHuman(timelineHumanMessage(ev))
    );
    if (full) summaryForTip = full;
  }
  const parts = [
    title,
    TIMELINE_EVENT_LABELS[ev.eventAction],
    summaryForTip,
    actorLine(ev),
    ev.timestampIso,
  ];
  if (ev.source) parts.push(ev.source);
  if (ev.confidence !== undefined) parts.push(`conf ${(ev.confidence * 100).toFixed(0)}%`);
  if (ev.materialReference) parts.push(ev.materialReference);
  return parts.filter(Boolean).join(" · ");
}

function prettyJsonMaybe(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function TimelineEventDetailPanel(props: {
  ev: ParsedRow;
  projectId: string;
  /** `undefined` loading, `null` fetch failed, array = passport batch for this project */
  passportOrdered: Phase4ElementPassport[] | null | undefined;
  globalIdToExpressId: Map<string, number>;
  onClear: () => void;
  className?: string;
}) {
  const { ev, projectId, passportOrdered, globalIdToExpressId, onClear, className: panelClass } =
    props;
  const [previewTab, setPreviewTab] = useState<"summary" | "more">("summary");
  const [showEpcisJson, setShowEpcisJson] = useState(false);

  useEffect(() => {
    setPreviewTab("summary");
  }, [ev.eventId]);
  const jsonIdx = ev.message?.indexOf(EPCIS_JSON_SEPARATOR) ?? -1;
  const hasEpcisPayload = jsonIdx >= 0;
  const humanMessage = hasEpcisPayload ? ev.message!.slice(0, jsonIdx) : ev.message;
  const epcisJsonBlock = hasEpcisPayload
    ? ev.message!.slice(jsonIdx + EPCIS_JSON_SEPARATOR.length)
    : "";
  const { title: displayTitle, summary: displaySummary } = eventTitleAndSummary(ev);

  const ifcCategory = extractIfcCategoryFromTitle(displayTitle);

  const metaRows: Array<{ k: string; v: ReactNode }> = [
    {
      k: "eventId",
      v: (
        <EllipsisText
          text={ev.eventId}
          className="block font-mono text-[10px]"
          as="span"
        />
      ),
    },
    {
      k: "timestamp",
      v: (
        <span className="block min-w-0 font-mono text-[10px]" title={ev.timestampIso}>
          <span className="block truncate">{formatTimelineDateOnly(ev.timestampIso)}</span>
          <span className="block truncate tabular-nums">
            {formatTimelineTimeOnly(ev.timestampIso)}
          </span>
        </span>
      ),
    },
    {
      k: "type",
      v: (
        <span className="text-[10px]">
          {TIMELINE_EVENT_LABELS[ev.eventAction]}{" "}
          <span className="font-mono text-zinc-500">({ev.eventAction})</span>
        </span>
      ),
    },
    {
      k: "actor",
      v: (
        <span>
          {ev.actorSystem ? "system" : ev.actorLabel || "—"}
          {ev.actorSystem ? (
            <span className="ml-1 text-zinc-500">(actorSystem)</span>
          ) : null}
        </span>
      ),
    },
  ];
  if (ev.source) {
    metaRows.push({
      k: "source",
      v: <EllipsisText text={ev.source} className="block font-mono text-[10px]" as="span" />,
    });
  }
  if (ev.confidence !== undefined) {
    metaRows.push({
      k: "confidence",
      v: <span>{(ev.confidence * 100).toFixed(0)}%</span>,
    });
  }
  if (ev.materialReference) {
    metaRows.push({
      k: "material / EPC",
      v: (
        <EllipsisText
          text={ev.materialReference}
          className="block font-mono text-[10px]"
          as="span"
        />
      ),
    });
  }
  if (ev.targetExpressId !== undefined) {
    metaRows.push({
      k: "targetExpressId",
      v: <span className="font-mono">{ev.targetExpressId}</span>,
    });
  }
  const ef = ev.epcisFields;
  if (ef?.eventType) {
    metaRows.push({ k: "epcis.type", v: <span className="font-mono">{ef.eventType}</span> });
  }
  if (ef?.gs1EventId) {
    metaRows.push({
      k: "epcis.eventID",
      v: <span className="break-all font-mono text-xs">{ef.gs1EventId}</span>,
    });
  }
  if (ef?.bizStep) {
    metaRows.push({ k: "epcis.bizStep", v: <span className="font-mono">{ef.bizStep}</span> });
  }
  if (ef?.disposition) {
    metaRows.push({
      k: "epcis.disposition",
      v: <span className="font-mono">{ef.disposition}</span>,
    });
  }
  if (ef?.captureAction) {
    metaRows.push({
      k: "epcis.action",
      v: <span className="font-mono">{ef.captureAction}</span>,
    });
  }
  if (ef?.readPointId) {
    metaRows.push({
      k: "epcis.readPoint",
      v: <span className="break-all font-mono text-xs">{ef.readPointId}</span>,
    });
  }
  if (ef?.bizLocationId) {
    metaRows.push({
      k: "epcis.bizLocation",
      v: <span className="break-all font-mono text-xs">{ef.bizLocationId}</span>,
    });
  }

  const passportByExpressId = useMemo(() => {
    const m = new Map<number, Phase4ElementPassport>();
    const list = Array.isArray(passportOrdered) ? passportOrdered : [];
    for (const p of list) {
      const ex = p.expressId ?? p.elementId;
      if (Number.isFinite(ex)) m.set(Number(ex), p);
    }
    return m;
  }, [passportOrdered]);

  const linkedExpressIds = useMemo(
    () => resolveTimelineExpressIdsForLinks(ev, globalIdToExpressId),
    [ev, globalIdToExpressId]
  );
  const primaryExpressId = linkedExpressIds[0];
  const passportsLoading = passportOrdered === undefined;
  const passportsFailed = passportOrdered === null;
  const hasBimUriInMessage = parseBimGlobalIdsFromMessage(ev.message).length > 0;
  const hasKbElementInMessage = parseKbElementExpressIdsFromMessage(ev.message).length > 0;
  const hasBcfGuid = Boolean(
    ev.bcfFields?.ifcGuid?.trim() || ev.bcfFields?.bcfIfcGuidsJson?.trim()
  );
  const linkedMaterialId = useMemo(() => {
    const list = Array.isArray(passportOrdered) ? passportOrdered : [];
    return resolveKbMaterialIdFromMaterialReference(ev.materialReference, list);
  }, [passportOrdered, ev.materialReference]);
  const provenanceBundle = useMemo(
    () => timelineProvenanceForEvent(projectId.trim(), ev.source),
    [projectId, ev.source]
  );
  const mightResolveLater =
    passportsLoading &&
    (hasBimUriInMessage || hasBcfGuid) &&
    ev.targetExpressId == null &&
    !hasKbElementInMessage;

  const shell =
    "min-w-0 overflow-hidden rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/60";
  const tabBtn =
    "rounded px-1 py-px text-[9px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500";

  return (
    <section
      id="timeline-selected-event"
      className={panelClass?.trim() ? `${shell} ${panelClass}` : shell}
      aria-label="Preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-zinc-200 px-2 py-1 dark:border-zinc-700">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Preview
          </h3>
          <nav
            className="flex items-center gap-1 text-[9px]"
            aria-label="Preview sections"
          >
            <button
              type="button"
              aria-current={previewTab === "summary" ? "page" : undefined}
              onClick={() => setPreviewTab("summary")}
              className={`${tabBtn} ${
                previewTab === "summary"
                  ? "text-zinc-900 underline decoration-zinc-400 underline-offset-2 dark:text-zinc-100 dark:decoration-zinc-500"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Summary
            </button>
            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
              ·
            </span>
            <button
              type="button"
              aria-current={previewTab === "more" ? "page" : undefined}
              onClick={() => setPreviewTab("more")}
              className={`${tabBtn} ${
                previewTab === "more"
                  ? "text-zinc-900 underline decoration-zinc-400 underline-offset-2 dark:text-zinc-100 dark:decoration-zinc-500"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              More
            </button>
          </nav>
          <span
            className="shrink-0 rounded border border-amber-200/90 bg-amber-50 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/80 dark:text-amber-200"
            title="Layout and fields may change"
          >
            WIP
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[9px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Clear
        </button>
      </div>
      <div className="min-w-0 px-2 py-1.5">
        {previewTab === "summary" ? (
          <div className="min-w-0 space-y-1.5">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-start gap-1">
                <h4
                  className="min-w-0 flex-1 truncate text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
                  title={displayTitle}
                >
                  {displayTitle}
                </h4>
                {ifcCategory !== "Other" ? (
                  <span
                    className="shrink-0 rounded border bg-white/90 px-1 py-px font-mono text-[8px] font-semibold leading-none dark:bg-zinc-950/90"
                    style={{
                      borderColor: ifcCategoryColor(ifcCategory),
                      color: ifcCategoryColor(ifcCategory),
                    }}
                    title={`IFC type (parsed): ${ifcCategory}`}
                  >
                    {ifcCategory}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {TIMELINE_EVENT_LABELS[ev.eventAction]}
                </span>
                <span aria-hidden className="mx-0.5 text-zinc-300 dark:text-zinc-600">
                  ·
                </span>
                <time dateTime={ev.timestampIso} className="font-mono tabular-nums">
                  {formatTimelineStamp(ev.timestampIso)}
                </time>
                <span aria-hidden className="mx-0.5 text-zinc-300 dark:text-zinc-600">
                  ·
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">{actorLine(ev)}</span>
              </p>
              {ev.eventAction === "bestek_bindings_milestone" ? (
                (() => {
                  const p = parseBestekBindingsMilestoneHuman(timelineHumanMessage(ev));
                  const hasHint = Boolean(p.repoPath || p.batchUuid);
                  return hasHint ? (
                    <p className="mt-1 text-[11px] leading-snug">
                      <BestekBindingsMilestoneDataHint parsed={p} />
                    </p>
                  ) : displaySummary ? (
                    <p
                      className="mt-1 line-clamp-4 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300"
                      title={displaySummary}
                    >
                      {displaySummary}
                    </p>
                  ) : null;
                })()
              ) : displaySummary ? (
                <p
                  className="mt-1 line-clamp-4 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300"
                  title={displaySummary}
                >
                  {displaySummary}
                </p>
              ) : null}
              {ev.eventAction === "bestek_bindings_milestone" && projectId.trim() ? (
                <p className="mt-1.5">
                  <Link
                    href={`/deliveries?tab=specification&specificationFiche=1&projectId=${encodeURIComponent(projectId.trim())}`}
                    className="text-[11px] font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
                  >
                    Open saved bestek document (Deliveries) →
                  </Link>
                </p>
              ) : null}
              {ev.eventAction === "bcf_coordination_event" ? (
                <div
                  role="status"
                  className="mt-1.5 rounded border border-amber-200/90 bg-amber-50/95 px-2 py-1.5 text-[10px] leading-snug text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/45 dark:text-amber-100"
                >
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    BCF and this project&apos;s IFC
                  </p>
                  <p className="mt-0.5 text-amber-900/95 dark:text-amber-100/95">
                    Links to expressId and materials only line up when the KB/passports for this
                    project come from the same (or compatible) IFC as the BCF viewpoint. Federated
                    coordination often references other files in the BCF markup header (for example{" "}
                    <span className="font-mono">ROOT-Compleet.ifczip</span>) — if that is not the
                    model your timeline uses, treat element and material links as uncertain.
                  </p>
                  {mightResolveLater && hasBcfGuid ? (
                    <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                      Checking whether the BCF IfcGuid maps to this project&apos;s passports…
                    </p>
                  ) : null}
                  {!hasBcfGuid && !passportsLoading ? (
                    <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                      This topic has no <span className="font-mono">IfcGuid</span> in the viewpoint
                      (empty components) — use the comment text and archive name for context; there
                      is no geometry id to resolve here.
                    </p>
                  ) : null}
                  {hasBcfGuid && passportsFailed ? (
                    <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                      Passports could not be loaded — we did not verify whether the BCF IfcGuid
                      exists in this project.
                    </p>
                  ) : null}
                  {hasBcfGuid &&
                  !passportsLoading &&
                  !passportsFailed &&
                  linkedExpressIds.length === 0 ? (
                    <p
                      className="mt-1 font-semibold text-red-800 dark:text-red-200"
                      role="alert"
                    >
                      This BCF IfcGuid does not match any element in the current passport batch —
                      the coordination IFC and this project&apos;s model likely differ. Do not assume
                      material or 3D links apply until the KB matches the BCF source model.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-1.5">
        <div id="timeline-open-in-app" className="scroll-mt-4">
          <p className={metaLabelClass()}>Open in app</p>
          {passportsFailed &&
          primaryExpressId == null &&
          !(linkedMaterialId != null && ev.materialReference?.trim()) ? (
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">No link found.</p>
          ) : null}
          {mightResolveLater ? (
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : null}
          {primaryExpressId != null ? (
            <nav
              className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-[10px]"
              aria-label="Jump to model, passport, or KB for this element"
            >
              <Link
                href={bimBuildingElementHref(projectId, primaryExpressId)}
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
              >
                3D model
              </Link>
              <Link
                href={bimPassportsElementHref(projectId, primaryExpressId)}
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
              >
                Passport
              </Link>
              <Link
                href={kbGraphElementHref(projectId, primaryExpressId)}
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
              >
                KB graph
              </Link>
              <Link
                href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
                className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
              >
                Materials / LCA
              </Link>
            </nav>
          ) : !passportsLoading &&
            !passportsFailed &&
            linkedMaterialId != null &&
            ev.materialReference?.trim() ? (
            <div className="mt-1 space-y-1 text-[10px] text-zinc-600 dark:text-zinc-300">
              <nav
                className="flex flex-wrap gap-x-2.5 gap-y-1"
                aria-label="Inspect material from timeline reference"
              >
                <Link
                  href={kbFocusMaterialHref(projectId, linkedMaterialId)}
                  className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
                >
                  KB — material {linkedMaterialId}
                </Link>
                <Link
                  href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
                  className="font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
                >
                  Materials / LCA
                </Link>
              </nav>
            </div>
          ) : !passportsLoading && !passportsFailed ? (
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">No link found.</p>
          ) : null}
          {primaryExpressId != null && linkedExpressIds.length > 1 ? (
            <p className="mt-1 text-[9px] text-zinc-500 dark:text-zinc-400">
              Links use expressId{" "}
              <span className="font-mono tabular-nums">{primaryExpressId}</span> (smallest of{" "}
              {linkedExpressIds.length} resolved).
            </p>
          ) : null}
          {primaryExpressId != null ? (
            (() => {
              const p = passportByExpressId.get(primaryExpressId);
              const mats = (p?.materials ?? []).filter((m) => Number.isFinite(m.materialId));
              if (mats.length === 0) return null;
              const uniq = [...new Map(mats.map((m) => [m.materialId, m])).values()].slice(0, 4);
              return (
                <div className="mt-1.5">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Materials (KB)
                  </p>
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {uniq.map((m) => (
                      <li key={m.materialId} className="min-w-0">
                        <Link
                          href={kbFocusMaterialHref(projectId, m.materialId)}
                          className="text-[10px] text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
                          title={m.materialName}
                        >
                          <span className="font-mono tabular-nums">{m.materialId}</span>
                          {m.materialName ? (
                            <span className="text-zinc-600 dark:text-zinc-400">
                              {" "}
                              — <span className="line-clamp-2">{m.materialName}</span>
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()
          ) : null}
        </div>

        <details className="group scroll-mt-4 rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950/50">
            <summary className="cursor-pointer list-none px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
              <span className="text-zinc-400 group-open:hidden dark:text-zinc-500">▶</span>
              <span className="hidden text-zinc-400 group-open:inline dark:text-zinc-500">▼</span>
              <span className="ml-1">Source files and data flow</span>
            </summary>
            <div className="max-h-[min(45vh,14rem)] overflow-y-auto border-t border-zinc-100 px-1.5 py-1.5 dark:border-zinc-800">
              {provenanceBundle ? (
                <>
                  <TimelineProvenanceSheetNav bundle={provenanceBundle} />
                  <ol className="mt-2 list-decimal space-y-2 pl-3.5 text-[10px] text-zinc-700 dark:text-zinc-200">
                    {provenanceBundle.steps.map((s) => (
                      <li key={s.repoPath} className="min-w-0">
                        {s.href ? (
                          <Link
                            href={s.href}
                            {...(provenanceLinkIsExternal(s.href)
                              ? { target: "_blank", rel: "noreferrer" as const }
                              : {})}
                            className={provenanceUiLinkClass}
                          >
                            {s.label}
                          </Link>
                        ) : (
                          <span>{s.label}</span>
                        )}
                        <span className="mt-0.5 block font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                          {s.repoPath}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  No mapping for this source yet.
                </p>
              )}
            </div>
          </details>

        <details className="group rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950/50">
          <summary className="cursor-pointer list-none px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <span className="text-zinc-400 group-open:hidden dark:text-zinc-500">▶</span>
            <span className="hidden text-zinc-400 group-open:inline dark:text-zinc-500">▼</span>
            <span className="ml-1">IDs, source &amp; raw fields</span>
          </summary>
          <div className="max-h-[min(50vh,16rem)] overflow-y-auto border-t border-zinc-100 px-1.5 py-1 dark:border-zinc-800">
            <dl className="grid grid-cols-1 gap-x-1.5 gap-y-0.5 sm:grid-cols-[4.5rem_1fr]">
              {metaRows.map((row) => (
                <div key={row.k} className="contents">
                  <dt className="text-[8px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {row.k}
                  </dt>
                  <dd className="min-w-0 text-[10px] text-zinc-900 dark:text-zinc-100">{row.v}</dd>
                </div>
              ))}
            </dl>

            {ev.eventAction === "epcis_supply_chain_event" || ev.epcisFields ? (
              (() => {
                const summaryNotes = getEpcisHumanNotesForRow(ev);
                if (summaryNotes.length === 0) return null;
                return (
                  <div className="mt-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      EPCIS facets
                    </p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-3 text-[11px] text-zinc-700 dark:text-zinc-300">
                      {summaryNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()
            ) : humanMessage?.trim() ? (
              <div className="mt-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Full message
                </p>
                <p className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-zinc-700 dark:text-zinc-300">
                  {humanMessage.trim()}
                </p>
              </div>
            ) : null}

            {ef?.epcListJson || ef?.quantityListJson || ef?.sourceListJson || ef?.destinationListJson ? (
              <div className="mt-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  EPCIS lists <span className="font-mono normal-case">(timeline:epcis*Json)</span>
                </p>
                <div className="mt-1 space-y-1">
                  {ef.epcListJson ? (
                    <pre className="max-h-24 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-1.5 text-[9px] text-zinc-200 dark:border-zinc-700">
                      {prettyJsonMaybe(ef.epcListJson)}
                    </pre>
                  ) : null}
                  {ef.quantityListJson ? (
                    <pre className="max-h-24 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-1.5 text-[9px] text-zinc-200 dark:border-zinc-700">
                      {prettyJsonMaybe(ef.quantityListJson)}
                    </pre>
                  ) : null}
                  {ef.sourceListJson ? (
                    <pre className="max-h-24 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-1.5 text-[9px] text-zinc-200 dark:border-zinc-700">
                      {prettyJsonMaybe(ef.sourceListJson)}
                    </pre>
                  ) : null}
                  {ef.destinationListJson ? (
                    <pre className="max-h-24 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-1.5 text-[9px] text-zinc-200 dark:border-zinc-700">
                      {prettyJsonMaybe(ef.destinationListJson)}
                    </pre>
                  ) : null}
                </div>
              </div>
            ) : null}

            {ev.message && !humanMessage?.trim() ? (
              <div className="mt-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Raw message
                </p>
                <p className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-zinc-700 dark:text-zinc-300">
                  {ev.message}
                </p>
              </div>
            ) : null}

            {hasEpcisPayload ? (
              <div className="mt-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowEpcisJson((s) => !s)}
                  className="text-[11px] font-medium text-amber-800 underline dark:text-amber-300"
                >
                  {showEpcisJson ? "Hide" : "Show"} full EPCIS JSON
                </button>
                {showEpcisJson ? (
                  <pre className="mt-1.5 max-h-36 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-1.5 text-[9px] leading-relaxed text-zinc-200 dark:border-zinc-700">
                    {epcisJsonBlock.trim()}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
          </div>
        )}
      </div>
    </section>
  );
}

export default function TimelinePage() {
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectTimelinePreset = useCallback(
    (id: string) => {
      const next = id.trim() || "example";
      setProjectId(next);
      const q = new URLSearchParams(searchParams.toString());
      q.set("projectId", next);
      q.delete("eventId");
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, setProjectId]
  );

  const viewMode = useMemo(() => parseTimelinePageView(searchParams), [searchParams]);
  const kbLayoutMode = useMemo(() => parseTimelineKbLayout(searchParams), [searchParams]);

  const patchTimelineQuery = useCallback(
    (mutate: (q: URLSearchParams) => void) => {
      const q = new URLSearchParams(searchParams.toString());
      mutate(q);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /** `?eventId=` on `/timeline` — deep link and shareable selection */
  const syncEventIdQuery = useCallback(
    (eventId: string | null) => {
      patchTimelineQuery((q) => {
        if (eventId) q.set("eventId", eventId);
        else q.delete("eventId");
      });
    },
    [patchTimelineQuery]
  );

  const setViewMode = useCallback(
    (mode: "normal" | "graph") => {
      patchTimelineQuery((q) => {
        if (mode === "graph") q.set("view", "graph");
        else q.delete("view");
      });
    },
    [patchTimelineQuery]
  );

  const setKbLayoutMode = useCallback(
    (mode: "spine" | "materialFlow") => {
      patchTimelineQuery((q) => {
        if (mode === "materialFlow") q.set("kbLayout", "materialFlow");
        else q.delete("kbLayout");
      });
    },
    [patchTimelineQuery]
  );

  const [events, setEvents] = useState<ParsedRow[]>([]);
  const [ttlPath, setTtlPath] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [eventAction, setEventAction] = useState<TimelineEventAction>("manual_note");
  const [message, setMessage] = useState("");
  const [materialReferenceInput, setMaterialReferenceInput] = useState("");
  const [actorLabel, setActorLabel] = useState("");
  const [targetExpressId, setTargetExpressId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const eventLogScrollRef = useRef<HTMLDivElement>(null);
  const timelineStripScrollRef = useRef<HTMLDivElement>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  /** Event log: one expanded metadata panel at a time; closed by default. */
  const [expandedLogEventId, setExpandedLogEventId] = useState<string | null>(null);
  /** Empty = no filter (all IFC types). Non-empty = show only events whose parsed IFC type is in this set. */
  const [ifcFilterTypes, setIfcFilterTypes] = useState<string[]>([]);
  /** `pid_only` = show only `pid_reference_milestone` rows (after IFC filter). */
  const [eventLogKindFilter, setEventLogKindFilter] = useState<"all" | "pid_only">("all");
  /** Cards = one horizontal card per event. Days = one card per calendar day, events in a horizontal row. List = table. */
  const [eventLogLayout, setEventLogLayout] = useState<"cards" | "dayGroups" | "list">("cards");

  const [epcisJsonText, setEpcisJsonText] = useState(() =>
    JSON.stringify(
      {
        type: "ObjectEvent",
        eventTime: "2026-04-04T12:00:00.000Z",
        eventID: "urn:uuid:aed0c443-7be2-4b64-8fd6-972ca76ef2c2",
        bizStep: "shipping",
        disposition: "in_transit",
        epcList: ["urn:epc:id:sgtin:7547845584.887.100"],
        quantityList: [{ quantity: 100, uom: "KGM" }],
        sourceList: [{ type: "owning_party", source: "supplier.example.com" }],
        destinationList: [{ type: "processing_party", destination: "site.example.com" }],
      },
      null,
      2
    )
  );
  const [epcisBusy, setEpcisBusy] = useState(false);
  const [epcisFeedback, setEpcisFeedback] = useState<string | null>(null);
  const [epcisError, setEpcisError] = useState<string | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [passportOrdered, setPassportOrdered] = useState<
    Phase4ElementPassport[] | null | undefined
  >(undefined);

  const timelinePassportGlobalMap = useMemo(() => {
    if (!Array.isArray(passportOrdered) || passportOrdered.length === 0) {
      return new Map<string, number>();
    }
    return globalIdToExpressIdMap(passportOrdered);
  }, [passportOrdered]);

  useEffect(() => {
    let cancelled = false;
    setPassportOrdered(undefined);
    void loadPhase4PassportsAllInstancesCached(projectId)
      .then((d) => {
        if (!cancelled) setPassportOrdered(d.ordered);
      })
      .catch(() => {
        if (!cancelled) setPassportOrdered(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const timelineFileLine = useMemo(
    () => (ttlPath?.trim() ? ttlPath.trim() : `data/${projectId}-timeline.ttl`),
    [ttlPath, projectId]
  );

  const curlCommand = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    let epcisEvent: unknown;
    try {
      epcisEvent = JSON.parse(epcisJsonText) as unknown;
    } catch {
      return `# Paste valid JSON in the EPCIS panel first — current body is not valid JSON.`;
    }
    const payload = { projectId, epcisEvent };
    const body = JSON.stringify(payload);
    return [
      `curl -sS -X POST ${JSON.stringify(`${origin}/api/timeline/epcis`)} \\`,
      `  -H ${JSON.stringify("Content-Type: application/json")} \\`,
      `  -d ${JSON.stringify(body)}`,
    ].join("\n");
  }, [projectId, epcisJsonText]);

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(curlCommand);
      setCurlCopied(true);
      window.setTimeout(() => setCurlCopied(false), 2000);
    } catch {
      setEpcisError("Could not copy to clipboard");
    }
  }

  async function postEpcisFromPanel() {
    setEpcisBusy(true);
    setEpcisError(null);
    setEpcisFeedback(null);
    try {
      let epcisEvent: unknown;
      try {
        epcisEvent = JSON.parse(epcisJsonText) as unknown;
      } catch {
        setEpcisError("EPCIS body is not valid JSON");
        return;
      }
      const res = await fetch("/api/timeline/epcis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, epcisEvent }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : `Request failed (${res.status})`;
        const det = typeof json.details === "string" ? `: ${json.details}` : "";
        setEpcisError(`${msg}${det}`);
        return;
      }
      const mid = json.mappedTimeline?.actionType ?? "—";
      setEpcisFeedback(`Logged (${mid}). eventId ${json.eventId ?? "—"}`);
      await refresh();
    } catch {
      setEpcisError("Network error");
    } finally {
      setEpcisBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/timeline?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        setLoadError(typeof json.error === "string" ? json.error : "Failed to load timeline");
        setEvents([]);
        return;
      }
      setTtlPath(typeof json.path === "string" ? json.path : "");
      setEvents(Array.isArray(json.events) ? json.events : []);
    } catch {
      setLoadError("Network error loading timeline");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const [clearingTimeline, setClearingTimeline] = useState(false);

  const clearTimelineToEmpty = useCallback(async () => {
    const id = projectId.trim();
    if (!id) return;
    const ok = window.confirm(
      `Empty the timeline for “${id}”?\n\nAll events will be removed from data/${id}-timeline.ttl (only prefix headers remain). This cannot be undone.`
    );
    if (!ok) return;
    setClearingTimeline(true);
    try {
      const res = await fetch("/api/timeline/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; path?: string };
      if (!res.ok) {
        showToast({
          type: "error",
          message: typeof j.error === "string" ? j.error : res.statusText,
        });
        return;
      }
      showToast({
        type: "success",
        message: `Timeline emptied — ${typeof j.path === "string" ? j.path : "data/…-timeline.ttl"}`,
      });
      await refresh();
    } finally {
      setClearingTimeline(false);
    }
  }, [projectId, refresh, showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** API returns chronological order (oldest first); strip and cards flow old → new left to right; table top to bottom. */

  const ifcFilteredEvents = useMemo(() => {
    if (ifcFilterTypes.length === 0) return events;
    const allow = new Set(ifcFilterTypes);
    return events.filter((ev) => {
      const { title } = eventTitleAndSummary(ev);
      const cat = extractIfcCategoryFromTitle(title);
      return allow.has(cat);
    });
  }, [events, ifcFilterTypes]);

  const displayEvents = useMemo(() => {
    if (eventLogKindFilter !== "pid_only") return ifcFilteredEvents;
    return ifcFilteredEvents.filter((ev) => ev.eventAction === "pid_reference_milestone");
  }, [ifcFilteredEvents, eventLogKindFilter]);

  /** Calendar days oldest-first; events within a day keep global list order (chronological). */
  const displayEventLogDayGroups = useMemo(() => {
    const map = new Map<string, ParsedRow[]>();
    for (const ev of displayEvents) {
      const k = localCalendarDayKey(ev.timestampIso);
      const bucket = k || "__undated__";
      const arr = map.get(bucket) ?? [];
      arr.push(ev);
      map.set(bucket, arr);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === "__undated__") return 1;
      if (b === "__undated__") return -1;
      return a.localeCompare(b);
    });
    return keys.map((dayKey) => ({
      dayKey,
      label: dayKey === "__undated__" ? "Undated" : formatDayColumnHeading(dayKey),
      events: map.get(dayKey)!,
    }));
  }, [displayEvents]);

  const selectedEvent = useMemo(
    () =>
      selectedEventId ? displayEvents.find((e) => e.eventId === selectedEventId) : undefined,
    [displayEvents, selectedEventId]
  );

  /** Legend counts from full dataset; filter chips stay aligned with total trace. */
  const ifcLegendData = useMemo(() => {
    const rows = events.map((ev) => {
      const { title } = eventTitleAndSummary(ev);
      const category = extractIfcCategoryFromTitle(title);
      return { category, monthKey: utcMonthKey(ev.timestampIso) };
    });
    const typed = rows.some((r) => r.category !== "Other");
    const monthKeys = new Set(rows.map((r) => r.monthKey).filter(Boolean));
    const fullDatasetHasMultipleMonths = rows.length > 1 && monthKeys.size > 1;
    const categoryCounts = new Map<string, number>();
    for (const r of rows) {
      if (r.category === "Other") continue;
      categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
    }
    const legend = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, color: ifcCategoryColor(name) }));
    return { legend, typed, fullDatasetHasMultipleMonths };
  }, [events]);

  const constructionStrip = useMemo(() => {
    const rows = displayEvents.map((ev) => {
      const { title } = eventTitleAndSummary(ev);
      const category = extractIfcCategoryFromTitle(title);
      return {
        ev,
        stripTitle: title,
        category,
        monthKey: utcMonthKey(ev.timestampIso),
      };
    });
    const monthKeys = new Set(rows.map((r) => r.monthKey).filter(Boolean));
    const showMonthRail = rows.length > 1 && monthKeys.size > 1;
    const typed = rows.some((r) => r.category !== "Other");
    const showIfcLane = typed && rows.length > 0;
    return { rows, showMonthRail, showIfcLane };
  }, [displayEvents]);

  useEffect(() => {
    if (selectedEventId && !displayEvents.some((e) => e.eventId === selectedEventId)) {
      setSelectedEventId(null);
      syncEventIdQuery(null);
    }
  }, [displayEvents, selectedEventId, syncEventIdQuery]);

  /** Apply `?eventId=` when the log loads or the query changes (invalid ids are stripped). */
  useEffect(() => {
    const id = searchParams.get("eventId")?.trim() || null;
    if (displayEvents.length === 0) return;
    if (id && !displayEvents.some((e) => e.eventId === id)) {
      syncEventIdQuery(null);
      return;
    }
    if (id) {
      setSelectedEventId((cur) => (cur === id ? cur : id));
    }
  }, [displayEvents, searchParams, syncEventIdQuery]);

  /** Keep the selected row visible inside the event-log scrollport and the construction strip (nested overflow). */
  useLayoutEffect(() => {
    if (viewMode !== "normal" || !selectedEventId || displayEvents.length === 0) return;
    const safeId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedEventId)
        : selectedEventId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    function scrollDataEntryIntoRoot(root: HTMLElement | null) {
      if (!root) return;
      const row = root.querySelector<HTMLElement>(`[data-event-log-entry="${safeId}"]`);
      if (!row) return;
      const rootRect = root.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const pad = 12;
      const deltaTop = rowRect.top - rootRect.top - pad;
      const deltaBottom = rowRect.bottom - rootRect.bottom + pad;
      if (deltaTop < 0) {
        root.scrollTop += deltaTop;
      } else if (deltaBottom > 0) {
        root.scrollTop += deltaBottom;
      }
      const deltaLeft = rowRect.left - rootRect.left - pad;
      const deltaRight = rowRect.right - rootRect.right + pad;
      if (deltaLeft < 0) {
        root.scrollLeft += deltaLeft;
      } else if (deltaRight > 0) {
        root.scrollLeft += deltaRight;
      }
    }
    scrollDataEntryIntoRoot(eventLogScrollRef.current);
    scrollDataEntryIntoRoot(timelineStripScrollRef.current);
  }, [selectedEventId, displayEvents, viewMode, expandedLogEventId, eventLogLayout]);

  /**
   * Hash targets for shareable links (`#timeline-open-in-app`). Native scroll runs before React paints;
   * re-apply after the selected-event panel mounts.
   */
  useLayoutEffect(() => {
    if (viewMode !== "normal" || !selectedEventId) return;
    const raw =
      typeof window !== "undefined" ? window.location.hash.replace(/^#/, "").split("&")[0] : "";
    if (raw !== "timeline-selected-event" && raw !== "timeline-open-in-app") return;
    const el = document.getElementById(raw);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [viewMode, selectedEventId, selectedEvent]);

  const prevProjectIdForSelectionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevProjectIdForSelectionRef.current;
    prevProjectIdForSelectionRef.current = projectId;
    if (prev !== undefined && prev !== projectId) {
      setSelectedEventId(null);
      syncEventIdQuery(null);
      setExpandedLogEventId(null);
      setIfcFilterTypes([]);
      setEventLogKindFilter("all");
    }
  }, [projectId, syncEventIdQuery]);

  useEffect(() => {
    if (!formOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [formOpen]);

  useEffect(() => {
    if (!formOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFormOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen]);

  useEffect(() => {
    if (!formOpen) return;
    const t = window.setTimeout(() => {
      formPanelRef.current?.querySelector<HTMLElement>("select, input, textarea")?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [formOpen]);

  function openForm() {
    setSubmitError(null);
    setEpcisError(null);
    setEpcisFeedback(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setSubmitError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const expressRaw = targetExpressId.trim();
      const body: Record<string, unknown> = {
        projectId,
        eventAction,
        actorLabel: actorLabel.trim() || undefined,
        actorSystem: false,
      };
      if (message.trim()) body.message = message.trim();
      if (materialReferenceInput.trim()) {
        body.materialReference = materialReferenceInput.trim();
      }
      if (expressRaw) {
        const n = Number(expressRaw);
        if (!Number.isFinite(n) || n < 0) {
          setSubmitError("IFC express id must be a non-negative number");
          setSubmitting(false);
          return;
        }
        body.targetExpressId = Math.floor(n);
      }

      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(typeof json.error === "string" ? json.error : "Failed to append event");
        return;
      }
      setMessage("");
      setMaterialReferenceInput("");
      await refresh();
      closeForm();
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden px-2 py-2 sm:px-4 sm:py-3">
      {formOpen ? (
        <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10 sm:pt-16">
          <button
            type="button"
            className="fixed inset-0 z-0 cursor-default"
            aria-label="Close dialog"
            onClick={() => closeForm()}
          />
          <div
            ref={formPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-new-event-title"
            className="relative z-[210] w-full max-w-5xl rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="timeline-new-event-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Add timeline events
              </h2>
              <button
                type="button"
                onClick={() => closeForm()}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Manual (form)
              </h3>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
                    Event type
                  </span>
                  <select
                    value={eventAction}
                    onChange={(ev) => setEventAction(ev.target.value as TimelineEventAction)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  >
                    {MANUAL_FORM_EVENT_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {TIMELINE_EVENT_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
                    Actor label
                  </span>
                  <input
                    type="text"
                    value={actorLabel}
                    onChange={(ev) => setActorLabel(ev.target.value)}
                    placeholder="e.g. ward@studio"
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
              </div>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
                  Message (optional) — first line is the event title in the timeline
                </span>
                <textarea
                  value={message}
                  onChange={(ev) => setMessage(ev.target.value)}
                  rows={3}
                  placeholder="Title on first line… Optional: add bim:element-12345 or BIM: bim:element/IFC_… for model links"
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
                <span className="mt-1 block text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                  For 3D / passport links: paste <code className="font-mono">bim:element-…</code> from the BIM
                  Passports panel, or set express id below. IFC globalIds only match if the KB was built from
                  the same IFC as the id in your text.
                </span>
              </label>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
                  Material / EPC reference (optional)
                </span>
                <input
                  type="text"
                  value={materialReferenceInput}
                  onChange={(ev) => setMaterialReferenceInput(ev.target.value)}
                  placeholder="e.g. dpp:material/ifc_betonvloer_ihw_300mm"
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-950"
                />
                <span className="mt-1 block text-[10px] text-zinc-500 dark:text-zinc-400">
                  Stored on the event for KB / LCA context; does not replace an element express id for 3D.
                </span>
              </label>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
                  Target IFC express id
                </span>
                <select
                  value={targetExpressId}
                  onChange={(ev) => setTargetExpressId(ev.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-950"
                >
                  {TIMELINE_TARGET_EXPRESS_OPTIONS.map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-zinc-500 dark:text-zinc-400">
                  Copied from{" "}
                  <Link
                    href={`/bim?projectId=${encodeURIComponent(projectId)}&view=passports`}
                    className="font-medium text-violet-700 underline dark:text-violet-300"
                  >
                    Passports
                  </Link>
                  . Leave “No element link” unless this row should open the model.
                </span>
              </label>
              {submitError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {submitting ? "Recording…" : "Record event"}
                </button>
                <button
                  type="button"
                  onClick={() => closeForm()}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </form>
            </div>

            <div className="border-t border-zinc-200 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10 dark:border-zinc-700">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                EPCIS ingest + curl
              </h3>
              <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                POST JSON to{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono text-[10px] dark:bg-zinc-800">
                  /api/timeline/epcis
                </code>{" "}
                with the current <span className="font-mono">projectId</span> (
                <span className="font-mono">{projectId}</span>). Uses GS1-style{" "}
                <code className="font-mono text-[10px]">ObjectEvent</code> fields; see Tabulas mapping
                in <code className="font-mono text-[10px]">src/lib/timeline/epcis.ts</code>.
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
                  epcisEvent (JSON)
                </span>
                <textarea
                  value={epcisJsonText}
                  onChange={(ev) => setEpcisJsonText(ev.target.value)}
                  spellCheck={false}
                  rows={14}
                  className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-2 font-mono text-[11px] leading-relaxed dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={epcisBusy}
                  onClick={() => void postEpcisFromPanel()}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
                >
                  {epcisBusy ? "Posting…" : "Send test (browser)"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyCurl()}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                >
                  {curlCopied ? "Copied" : "Copy curl"}
                </button>
              </div>
              {epcisError ? (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{epcisError}</p>
              ) : null}
              {epcisFeedback ? (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{epcisFeedback}</p>
              ) : null}
              <p className="mt-3 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                curl command
              </p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-2 text-[10px] leading-relaxed text-zinc-200 dark:border-zinc-700">
                {curlCommand}
              </pre>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden sm:gap-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Audit timeline
            </h1>
            <div
              className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-600"
              role="group"
              aria-label="Timeline view"
            >
              <button
                type="button"
                onClick={() => setViewMode("normal")}
                aria-pressed={viewMode === "normal"}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "normal"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setViewMode("graph")}
                aria-pressed={viewMode === "graph"}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "graph"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Graph
              </button>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => openForm()}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              New event
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {loading ? "Loading…" : "Refresh list"}
            </button>
          </div>
        </div>

        <section
          aria-label="Source and filter: project, timeline file, trace filters"
          className="shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50"
        >
          <details className="group border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/90">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left sm:gap-x-3 sm:px-4 [&::-webkit-details-marker]:hidden">
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-zinc-400 transition-transform duration-200 group-open:rotate-90 dark:text-zinc-500"
                aria-hidden
              >
                ▶
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Project folder
              </span>
              <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {projectId.trim() || "—"}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400 sm:text-[11px]"
                title={timelineFileLine}
              >
                {timelineFileLine}
              </span>
            </summary>
            <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70">
              <div className="max-w-md">
                <ProjectIdField value={projectId} onChange={setProjectId} />
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Quick select
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Preset project ids">
                  {TIMELINE_PROJECT_PRESETS.map((p) => {
                    const active = projectId.trim() === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectTimelinePreset(p.id)}
                        aria-pressed={active}
                        className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                          active
                            ? "border-zinc-700 bg-zinc-200 text-zinc-900 dark:border-zinc-500 dark:bg-zinc-700 dark:text-zinc-50"
                            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Append-only event log for this project id. Turtle file{" "}
                <code className="whitespace-nowrap rounded bg-zinc-100 px-1 font-mono text-[10px] dark:bg-zinc-800">
                  data/&lt;projectId&gt;-timeline.ttl
                </code>
                . Manual entries use the form; supply-chain systems POST GS1 EPCIS JSON to{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono text-[10px] dark:bg-zinc-800">
                  /api/timeline/epcis
                </code>{" "}
                (see New event for curl).
              </p>
              <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{timelineFileLine}</p>
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <button
                  type="button"
                  disabled={clearingTimeline || !projectId.trim()}
                  onClick={() => void clearTimelineToEmpty()}
                  className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/40"
                >
                  {clearingTimeline ? "Clearing…" : "Empty timeline (remove all events)"}
                </button>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Uses <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">POST /api/timeline/clear</code>{" "}
                  — same as Admin → Projects on disk.
                </span>
              </div>
            </div>
          </details>
          {loadError ? (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {loadError}
            </div>
          ) : null}
          {viewMode === "normal" && events.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-zinc-200 bg-zinc-100/50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/40 sm:gap-x-2.5 sm:px-4"
              aria-label="Narrow trace — IFC type filters (click types to narrow strip and log)"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Narrow trace
              </span>
              {ifcFilterTypes.length > 0 ? (
                <span className="shrink-0 rounded-md border border-amber-300/80 bg-amber-50 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200">
                  Filter on
                </span>
              ) : (
                <span className="shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  Filter off
                </span>
              )}
              <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
                ·
              </span>
              {ifcLegendData.legend.length > 0 ? (
                <>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    IFC types
                  </span>
                  {ifcFilterTypes.length > 0 ? (
                    <>
                      <span className="text-[10px] text-zinc-600 dark:text-zinc-300">
                        Showing{" "}
                        <span className="tabular-nums font-medium">{displayEvents.length}</span>/
                        <span className="tabular-nums">{events.length}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIfcFilterTypes([])}
                        className="shrink-0 text-[10px] font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
                      >
                        All types
                      </button>
                    </>
                  ) : (
                    <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">
                      Click a type to narrow
                    </span>
                  )}
                  <span className="text-zinc-300 dark:text-zinc-600 max-sm:hidden" aria-hidden>
                    ·
                  </span>
                  <div
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
                    aria-label="IFC types — click to filter audit trace (counts are full project)"
                  >
                    {ifcLegendData.legend.map(({ name, count, color }) => {
                      const filterOn = ifcFilterTypes.length > 0;
                      const included = !filterOn || ifcFilterTypes.includes(name);
                      return (
                        <button
                          key={`f-${name}`}
                          type="button"
                          onClick={() => {
                            setIfcFilterTypes((prev) => {
                              const next = new Set(prev);
                              if (next.has(name)) next.delete(name);
                              else next.add(name);
                              return [...next].sort();
                            });
                          }}
                          title={`${included ? "Remove from" : "Add to"} filter (${count} in full trace)`}
                          aria-pressed={filterOn ? included : false}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors ${
                            !filterOn
                              ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                              : included
                                ? "border-zinc-500 bg-zinc-100 font-medium text-zinc-900 ring-1 ring-inset ring-zinc-400/60 dark:border-zinc-500 dark:bg-zinc-800/90 dark:text-zinc-50 dark:ring-zinc-500/50"
                                : "border-zinc-200 bg-zinc-50/80 text-zinc-400 opacity-70 hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-500"
                          }`}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                            aria-hidden
                          />
                          <span className="font-mono">{name}</span>
                          <span className="tabular-nums text-zinc-400 dark:text-zinc-500">×{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  No IFC categories in this trace — filtering needs typed element names in event titles.
                </p>
              )}
            </div>
          ) : null}
        </section>

        <div className="flex min-h-0 flex-1 flex-col">
          {viewMode === "graph" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {loading && events.length === 0 ? (
                <p className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">Loading timeline…</p>
              ) : (
                <TimelineKbGraph
                  projectId={projectId}
                  events={displayEvents}
                  fillViewport
                  layoutMode={kbLayoutMode}
                  onLayoutModeChange={setKbLayoutMode}
                  focusEventId={selectedEventId}
                />
              )}
              <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                <Link
                  href="/pipeline"
                  className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Pipeline journey
                </Link>
                <span className="mx-1.5 text-zinc-400 dark:text-zinc-500" aria-hidden>
                  ·
                </span>
                <Link
                  href="/timeline/provenance"
                  className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Data flow
                </Link>
              </p>
            </div>
          ) : null}

          {viewMode === "normal" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              <div className="flex shrink-0 flex-col gap-4 overflow-hidden lg:flex-row lg:items-stretch lg:gap-4">
                <aside
                  className="w-full shrink-0 lg:w-[16.5rem] lg:min-h-0 lg:min-w-[16.5rem] lg:max-w-[16.5rem] lg:overflow-y-auto"
                  aria-label="Preview"
                >
                {selectedEvent ? (
                    <TimelineEventDetailPanel
                      ev={selectedEvent}
                      projectId={projectId}
                      passportOrdered={passportOrdered}
                      globalIdToExpressId={timelinePassportGlobalMap}
                      onClear={() => {
                        setSelectedEventId(null);
                        syncEventIdQuery(null);
                      }}
                      className="w-full min-w-0"
                    />
                ) : events.length > 0 && displayEvents.length === 0 ? (
                  <div className="flex min-h-[4.5rem] w-full flex-col justify-center gap-1.5 rounded-md border border-dashed border-amber-200 bg-amber-50/50 px-2 py-2.5 text-center text-xs leading-snug text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                    <p>Every event is hidden by the IFC filter.</p>
                    <button
                      type="button"
                      onClick={() => setIfcFilterTypes([])}
                      className="text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200"
                    >
                      Clear filter — restore full trace
                    </button>
                  </div>
                ) : displayEvents.length > 0 ? (
                  <div className="flex min-h-[4.5rem] w-full flex-col justify-center rounded-md border border-dashed border-zinc-300 px-2 py-2.5 text-center text-xs leading-snug text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                    Pick an event on the strip or in the log — preview appears here.
                  </div>
                ) : (
                  <div className="flex min-h-[4rem] w-full items-center justify-center rounded-md border border-dashed border-zinc-300 px-2 py-2.5 text-center text-xs leading-snug text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                    No events yet — preview will show here when you add or select one.
                  </div>
                )}
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <section
                  aria-label="Event timeline"
                  className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950 sm:px-3"
                >
            {loading && events.length === 0 ? (
              <p className="px-2 text-sm text-zinc-500 dark:text-zinc-400">Loading timeline…</p>
            ) : events.length === 0 ? (
              <div className="px-2">
                <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                  No events yet — the line will fill as you record events.
                </p>
                <div className="h-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden />
              </div>
            ) : displayEvents.length === 0 && ifcFilterTypes.length > 0 ? (
              <div className="px-2 py-6 text-center">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No events match the current IFC filter ({[...ifcFilterTypes].sort().join(", ")}).
                </p>
                <button
                  type="button"
                  onClick={() => setIfcFilterTypes([])}
                  className="mt-3 text-sm font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
                >
                  Clear IFC filter — show full trace
                </button>
              </div>
            ) : (
              <div
                ref={timelineStripScrollRef}
                className="overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch] pb-2 pt-1"
              >
                {/*
                  One column per event (compact width); order matches API: oldest left, newest right.
                  Line segments sit inside each column so they meet at column boundaries.
                */}
                <div className="flex min-w-max flex-col gap-0 px-2">
                  {constructionStrip.showMonthRail ? (
                    <div className="flex min-w-max" aria-hidden>
                      {constructionStrip.rows.map(({ ev, monthKey }, i) => {
                        const prevKey = i > 0 ? constructionStrip.rows[i - 1].monthKey : "";
                        const show = i === 0 || monthKey !== prevKey;
                        return (
                          <div
                            key={`m-${ev.eventId}`}
                            className="flex h-5 w-[4.25rem] shrink-0 flex-col items-center justify-end border-b border-zinc-200 pb-0.5 dark:border-zinc-700"
                          >
                            {show ? (
                              <span
                                className="text-[7px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                                title={ev.timestampIso}
                              >
                                {formatUtcMonthRail(ev.timestampIso)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {constructionStrip.showIfcLane ? (
                    <div className="flex min-w-max pt-0.5" aria-hidden>
                      {constructionStrip.rows.map(({ ev, category }) => (
                        <div
                          key={`c-${ev.eventId}`}
                          className="flex w-[4.25rem] shrink-0 justify-center py-0.5"
                        >
                          <div
                            className="h-1 w-7 rounded-full opacity-90"
                            style={{ backgroundColor: ifcCategoryColor(category) }}
                            title={category}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex min-w-max">
                    {constructionStrip.rows.map(({ ev, stripTitle, category }, i) => {
                      const isFirst = i === 0;
                      const isLast = i === constructionStrip.rows.length - 1;
                      const isSel = selectedEventId === ev.eventId;
                      const dotHex = constructionStrip.showIfcLane ? ifcCategoryColor(category) : null;
                      return (
                        <button
                          key={ev.eventId}
                          type="button"
                          data-event-log-entry={ev.eventId}
                          title={columnHoverSummary(ev)}
                          aria-label={`${stripTitle}; ${TIMELINE_EVENT_LABELS[ev.eventAction]}; ${formatTimelineStamp(ev.timestampIso)}`}
                          aria-pressed={isSel}
                          onClick={() => {
                            setExpandedLogEventId(null);
                            setSelectedEventId(ev.eventId);
                            syncEventIdQuery(ev.eventId);
                          }}
                          className={`flex w-[4.25rem] shrink-0 flex-col items-stretch rounded-md border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500 ${
                            isSel
                              ? "border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800/80"
                              : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                          }`}
                        >
                          <div className="flex min-h-[2.65rem] min-w-0 flex-col justify-end px-0.5 pb-1 pt-0.5 text-center">
                            <p
                              className="min-w-0 truncate text-[8px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100"
                              title={stripTitle}
                            >
                              {stripTitle}
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[6.5px] font-medium leading-none text-zinc-500 dark:text-zinc-400">
                              {TIMELINE_EVENT_LABELS[ev.eventAction]}
                            </p>
                            <time
                              dateTime={ev.timestampIso}
                              className="mt-0.5 block max-w-full truncate text-[7px] font-mono tabular-nums leading-none text-zinc-400 dark:text-zinc-500"
                              title={ev.timestampIso}
                            >
                              {formatTimelineStamp(ev.timestampIso)}
                            </time>
                          </div>
                          <div className="relative flex h-5 w-full shrink-0 items-center justify-center">
                            {!isFirst ? (
                              <div
                                className="pointer-events-none absolute left-0 top-1/2 h-0.5 w-1/2 -translate-y-1/2 bg-zinc-300 dark:bg-zinc-600"
                                aria-hidden
                              />
                            ) : null}
                            {!isLast ? (
                              <div
                                className="pointer-events-none absolute right-0 top-1/2 h-0.5 w-1/2 -translate-y-1/2 bg-zinc-300 dark:bg-zinc-600"
                                aria-hidden
                              />
                            ) : null}
                            <div
                              className={`relative z-10 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-950 ${
                                isSel ? "h-2 w-2 ring-amber-400 dark:ring-amber-300" : "h-1.5 w-1.5"
                              } ${!dotHex && isSel ? "bg-amber-500 dark:bg-amber-400" : ""} ${
                                !dotHex && !isSel ? "bg-zinc-800 dark:bg-zinc-200" : ""
                              }`}
                              style={dotHex ? { backgroundColor: dotHex } : undefined}
                              aria-hidden
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
                </div>
              </div>

              <div
                className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden self-stretch"
                aria-label="Event log"
              >
            {events.length === 0 && !loading ? (
              <p className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                No events yet for this project. To seed a full PID milestone strip (demo spacing), open{" "}
                <Link
                  href={`/deliveries?tab=pid&projectId=${encodeURIComponent(projectId)}`}
                  className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                >
                  Deliveries → PID
                </Link>{" "}
                and use <strong className="font-medium text-zinc-600 dark:text-zinc-300">Append full PID template</strong>.
              </p>
            ) : null}
            {events.length > 0 ? (
              <>
                {displayEvents.length > 0 ? (
                  <div
                    className="mb-1.5 flex w-full shrink-0 flex-wrap items-center justify-start gap-2 px-0.5"
                    role="group"
                    aria-label="Event log layout"
                  >
                    <div
                      className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50/90 p-0.5 dark:border-zinc-600 dark:bg-zinc-900/80"
                      role="group"
                      aria-label="Event kind filter"
                    >
                      <button
                        type="button"
                        aria-pressed={eventLogKindFilter === "all"}
                        onClick={() => setEventLogKindFilter("all")}
                        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          eventLogKindFilter === "all"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        All kinds
                      </button>
                      <button
                        type="button"
                        aria-pressed={eventLogKindFilter === "pid_only"}
                        onClick={() => setEventLogKindFilter("pid_only")}
                        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          eventLogKindFilter === "pid_only"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        PID milestones
                      </button>
                    </div>
                    <div
                      className="inline-flex items-center rounded-lg border border-zinc-300 bg-zinc-50/90 p-0.5 dark:border-zinc-600 dark:bg-zinc-900/80"
                      role="group"
                      aria-label="Scroll to current period"
                    >
                      <button
                        type="button"
                        disabled={displayEvents.length === 0}
                        title="Select and scroll to the latest today or past event (last before calendar-future rows in time order), or the instant nearest now if every row is in the future."
                        onClick={() => {
                          const id = eventIdForJumpToNow(displayEvents);
                          if (!id) return;
                          setExpandedLogEventId(null);
                          setSelectedEventId(id);
                          syncEventIdQuery(id);
                        }}
                        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          displayEvents.length === 0
                            ? "cursor-not-allowed text-zinc-400 dark:text-zinc-600"
                            : "text-emerald-800 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                        }`}
                      >
                        Now
                      </button>
                    </div>
                    <div className="inline-flex rounded-lg border border-zinc-300 bg-zinc-50/90 p-0.5 dark:border-zinc-600 dark:bg-zinc-900/80">
                      <button
                        type="button"
                        aria-pressed={eventLogLayout === "cards"}
                        onClick={() => setEventLogLayout("cards")}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                          eventLogLayout === "cards"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        Cards
                      </button>
                      <button
                        type="button"
                        aria-pressed={eventLogLayout === "dayGroups"}
                        onClick={() => setEventLogLayout("dayGroups")}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                          eventLogLayout === "dayGroups"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        Days
                      </button>
                      <button
                        type="button"
                        aria-pressed={eventLogLayout === "list"}
                        onClick={() => setEventLogLayout("list")}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                          eventLogLayout === "list"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        Table
                      </button>
                    </div>
                  </div>
                ) : null}
                <div
                  ref={eventLogScrollRef}
                  className="min-h-0 w-full min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
                >
                  <div
                    className={
                      eventLogLayout === "list"
                        ? "min-w-[32rem] space-y-1 pb-2"
                        : `flex w-max min-w-full flex-row items-stretch px-0.5 pb-2 ${
                            eventLogLayout === "dayGroups" ? "gap-3" : "gap-2"
                          }`
                    }
                  >
                    {displayEvents.length === 0 && ifcFilterTypes.length > 0 ? (
                      <p className="px-2 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                        No log rows match the IFC filter.{" "}
                        <button
                          type="button"
                          onClick={() => setIfcFilterTypes([])}
                          className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
                        >
                          Clear filter
                        </button>
                      </p>
                    ) : displayEvents.length === 0 && eventLogKindFilter === "pid_only" ? (
                      <p className="px-2 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                        No PID milestone events yet.{" "}
                        <Link
                          href={`/deliveries?tab=pid&projectId=${encodeURIComponent(projectId)}`}
                          className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
                        >
                          Register in Deliveries → PID
                        </Link>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => setEventLogKindFilter("all")}
                          className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
                        >
                          Show all kinds
                        </button>
                      </p>
                    ) : eventLogLayout === "list" ? (
                      <>
                        <div
                          className="sticky top-0 z-[1] grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.5fr)_5.5rem] gap-x-2 border-b border-zinc-200 bg-zinc-50 px-2 pb-1 pt-0.5 dark:border-zinc-700 dark:bg-zinc-950"
                          aria-hidden
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Title
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Kind
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Summary
                          </span>
                          <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            When
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {displayEvents.map((ev) => {
                            const isSel = selectedEventId === ev.eventId;
                            const isExpanded = expandedLogEventId === ev.eventId;
                            const { title: rowTitle, summary: rowSummary } = eventTitleAndSummary(ev);
                            const rowIfcCat = extractIfcCategoryFromTitle(rowTitle);
                            const summaryDisplay = rowSummary.trim() ? rowSummary : "—";
                            const bestekParsed =
                              ev.eventAction === "bestek_bindings_milestone"
                                ? parseBestekBindingsMilestoneHuman(timelineHumanMessage(ev))
                                : null;
                            const bestekShowHint = Boolean(
                              bestekParsed && (bestekParsed.repoPath || bestekParsed.batchUuid)
                            );
                            const summaryTitle = bestekShowHint
                              ? bestekBindingsFullPathTip(bestekParsed!)
                              : summaryDisplay;
                            const kindLabel = TIMELINE_EVENT_LABELS[ev.eventAction];
                            const whenShort = formatTimelineStamp(ev.timestampIso);

                            function onLogRowClick() {
                              setSelectedEventId(ev.eventId);
                              syncEventIdQuery(ev.eventId);
                              setExpandedLogEventId((cur) => (cur === ev.eventId ? null : ev.eventId));
                            }

                            return (
                              <li
                                key={ev.eventId}
                                data-event-log-entry={ev.eventId}
                                className="scroll-mt-2"
                              >
                                <div
                                  className={`overflow-hidden rounded-md border text-left transition-colors ${
                                    constructionStrip.showIfcLane ? "border-l-[3px]" : ""
                                  } ${
                                    isSel
                                      ? "border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800/80"
                                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                                  }`}
                                  style={
                                    constructionStrip.showIfcLane
                                      ? { borderLeftColor: ifcCategoryColor(rowIfcCat) }
                                      : undefined
                                  }
                                >
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isExpanded}
                                    aria-label={`${rowTitle}; ${kindLabel}; ${summaryDisplay}; ${whenShort}. ${isExpanded ? "Collapse" : "Expand"} metadata.`}
                                    onClick={onLogRowClick}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onLogRowClick();
                                      }
                                    }}
                                    className="grid min-h-[2.25rem] cursor-pointer grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.5fr)_5.5rem] items-center gap-x-2 px-2 py-0 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                                  >
                                    <div className="flex min-w-0 items-center gap-1">
                                      <span
                                        className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500"
                                        aria-hidden
                                      >
                                        {isExpanded ? "▼" : "▶"}
                                      </span>
                                      <p
                                        className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                                        title={rowTitle}
                                      >
                                        {rowTitle}
                                      </p>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                      <p
                                        className="min-w-0 flex-1 truncate text-xs text-zinc-800 dark:text-zinc-200"
                                        title={kindLabel}
                                      >
                                        {kindLabel}
                                      </p>
                                      {ev.source === "epcis" ? (
                                        <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[9px] font-medium uppercase text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                          EPCIS
                                        </span>
                                      ) : ev.source === "form" ? (
                                        <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[9px] font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
                                          Form
                                        </span>
                                      ) : ev.source === "deliveries-ingest" ? (
                                        <span className="shrink-0 rounded bg-emerald-100 px-1 py-px text-[9px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                                          Deliveries
                                        </span>
                                      ) : null}
                                      {timelineProvenanceForEvent(projectId.trim(), ev.source) ? (
                                        <Link
                                          href="/timeline/provenance"
                                          className="shrink-0 rounded bg-violet-100 px-1 py-px text-[9px] font-medium text-violet-900 underline-offset-2 hover:underline dark:bg-violet-900/40 dark:text-violet-200"
                                          title="Repo files and import pipeline for this source"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Files
                                        </Link>
                                      ) : null}
                                    </div>
                                    <p
                                      className="flex min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-300"
                                      title={summaryTitle}
                                    >
                                      {bestekShowHint ? (
                                        <BestekBindingsMilestoneDataHint
                                          parsed={bestekParsed!}
                                          className="min-w-0"
                                        />
                                      ) : (
                                        summaryDisplay
                                      )}
                                    </p>
                                    <div className="flex min-w-0 flex-col items-end gap-0.5">
                                      <EventTimeTenseBadge iso={ev.timestampIso} />
                                      <time
                                        dateTime={ev.timestampIso}
                                        className="truncate text-right font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400"
                                        title={ev.timestampIso}
                                      >
                                        {whenShort}
                                      </time>
                                    </div>
                                  </div>
                                  {isExpanded ? (
                                    <EventLogRowMetadata
                                      ev={ev}
                                      projectId={projectId}
                                      layout="listCollapsible"
                                    />
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : eventLogLayout === "dayGroups" ? (
                      <>
                        {displayEventLogDayGroups.map((g) => (
                          <div
                            key={g.dayKey}
                            data-timeline-day-card={g.dayKey}
                            className="flex w-[min(17rem,calc(100vw-3rem))] min-w-[10.5rem] max-w-[20rem] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-900/40"
                          >
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900/90">
                              <span
                                className="min-w-0 truncate text-[11px] font-semibold text-zinc-900 dark:text-zinc-50"
                                title={g.label}
                              >
                                {g.label}
                              </span>
                              <span
                                className="shrink-0 rounded-full bg-white px-1.5 py-px text-[9px] font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600"
                                aria-label={`${g.events.length} events`}
                              >
                                {g.events.length}
                              </span>
                            </div>
                            <div
                              className="flex max-h-[min(48vh,18rem)] flex-col gap-0.5 overflow-y-auto overscroll-y-contain p-1.5 [-webkit-overflow-scrolling:touch]"
                              aria-label={`Events on ${g.label}`}
                            >
                              {g.events.map((ev) => {
                                const isSel = selectedEventId === ev.eventId;
                                const isExpanded = expandedLogEventId === ev.eventId;
                                const { title: rowTitle, summary: rowSummary } =
                                  eventTitleAndSummary(ev);
                                const rowIfcCat = extractIfcCategoryFromTitle(rowTitle);
                                const kindLabel = TIMELINE_EVENT_LABELS[ev.eventAction];
                                const timeOnly = formatTimelineTimeOnly(ev.timestampIso);
                                const dayBestekParsed =
                                  ev.eventAction === "bestek_bindings_milestone"
                                    ? parseBestekBindingsMilestoneHuman(timelineHumanMessage(ev))
                                    : null;
                                const dayBestekHint = Boolean(
                                  dayBestekParsed &&
                                    (dayBestekParsed.repoPath || dayBestekParsed.batchUuid)
                                );

                                function onDayStackSelect() {
                                  setSelectedEventId(ev.eventId);
                                  syncEventIdQuery(ev.eventId);
                                }

                                function onDayStackToggleOpen(e: MouseEvent<HTMLButtonElement>) {
                                  e.stopPropagation();
                                  setExpandedLogEventId((cur) =>
                                    cur === ev.eventId ? null : ev.eventId
                                  );
                                }

                                return (
                                  <div
                                    key={ev.eventId}
                                    data-event-log-entry={ev.eventId}
                                    className="min-w-0 scroll-mt-1"
                                  >
                                    <div
                                      className={`overflow-hidden rounded-md border text-left transition-colors ${
                                        constructionStrip.showIfcLane ? "border-l-[3px]" : ""
                                      } ${
                                        isSel
                                          ? "border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800/80"
                                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                                      }`}
                                      style={
                                        constructionStrip.showIfcLane
                                          ? { borderLeftColor: ifcCategoryColor(rowIfcCat) }
                                          : undefined
                                      }
                                    >
                                      <div className="flex min-h-[1.65rem] items-stretch">
                                        <button
                                          type="button"
                                          onClick={onDayStackSelect}
                                          aria-pressed={isSel}
                                          aria-label={`Select: ${rowTitle}; ${kindLabel}; ${timeOnly}`}
                                          className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-0.5 text-left hover:bg-zinc-50/90 dark:hover:bg-zinc-900/60"
                                        >
                                          <span
                                            className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400"
                                            title={ev.timestampIso}
                                          >
                                            {timeOnly}
                                          </span>
                                          <span
                                            className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight text-zinc-900 dark:text-zinc-50"
                                            title={rowTitle}
                                          >
                                            {rowTitle}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={onDayStackToggleOpen}
                                          aria-expanded={isExpanded}
                                          aria-label={
                                            isExpanded
                                              ? "Close inline details"
                                              : "Open inline details"
                                          }
                                          className="shrink-0 border-l border-zinc-200 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
                                        >
                                          {isExpanded ? "Close" : "Open"}
                                        </button>
                                      </div>
                                      {isExpanded ? (
                                        <div className="border-t border-zinc-100 dark:border-zinc-800">
                                          <p className="px-1.5 py-0.5 text-[9px] text-zinc-600 dark:text-zinc-400">
                                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                              {kindLabel}
                                            </span>
                                            {dayBestekHint ? (
                                              <span
                                                className="mt-0.5 line-clamp-2 block min-w-0 text-zinc-500 dark:text-zinc-400"
                                                title={bestekBindingsFullPathTip(dayBestekParsed!)}
                                              >
                                                <BestekBindingsMilestoneDataHint
                                                  parsed={dayBestekParsed!}
                                                />
                                              </span>
                                            ) : rowSummary.trim() ? (
                                              <span className="mt-0.5 line-clamp-2 block text-zinc-500 dark:text-zinc-400">
                                                {rowSummary.trim()}
                                              </span>
                                            ) : null}
                                          </p>
                                          <EventLogRowMetadata
                                            ev={ev}
                                            projectId={projectId}
                                            layout="stack"
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {displayEvents.map((ev, idx) => {
                          const dayKey = localCalendarDayKey(ev.timestampIso);
                          const prevKey =
                            idx > 0
                              ? localCalendarDayKey(displayEvents[idx - 1]!.timestampIso)
                              : "";
                          const newDay = Boolean(dayKey && dayKey !== prevKey);
                          const dayHeading = dayKey ? formatDayColumnHeading(dayKey) : "—";
                          const isSel = selectedEventId === ev.eventId;
                          const { title: rowTitle, summary: rowSummary } = eventTitleAndSummary(ev);
                          const rowIfcCat = extractIfcCategoryFromTitle(rowTitle);
                          const summaryDisplay = rowSummary.trim() ? rowSummary : "—";
                          const cardBestekParsed =
                            ev.eventAction === "bestek_bindings_milestone"
                              ? parseBestekBindingsMilestoneHuman(timelineHumanMessage(ev))
                              : null;
                          const cardBestekHint = Boolean(
                            cardBestekParsed &&
                              (cardBestekParsed.repoPath || cardBestekParsed.batchUuid)
                          );
                          const cardSummaryTitle = cardBestekHint
                            ? bestekBindingsFullPathTip(cardBestekParsed!)
                            : summaryDisplay;
                          const kindLabel = TIMELINE_EVENT_LABELS[ev.eventAction];
                          const stamp = formatTimelineStamp(ev.timestampIso);

                          function onCardClick() {
                            setExpandedLogEventId(null);
                            setSelectedEventId(ev.eventId);
                            syncEventIdQuery(ev.eventId);
                          }

                          return (
                            <div
                              key={ev.eventId}
                              data-event-log-entry={ev.eventId}
                              className="w-[11.5rem] shrink-0 scroll-mt-2 sm:w-[13rem]"
                            >
                              <div
                                className="flex h-6 shrink-0 items-center justify-center"
                                aria-hidden={!newDay}
                              >
                                {newDay ? (
                                  <span
                                    className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                    title={formatTimelineDateOnly(ev.timestampIso)}
                                  >
                                    {dayHeading}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className={`overflow-hidden rounded-lg border text-left transition-colors ${
                                  constructionStrip.showIfcLane ? "border-l-[3px]" : ""
                                } ${
                                  isSel
                                    ? "border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800/80"
                                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                                }`}
                                style={
                                  constructionStrip.showIfcLane
                                    ? { borderLeftColor: ifcCategoryColor(rowIfcCat) }
                                    : undefined
                                }
                              >
                                <button
                                  type="button"
                                  onClick={onCardClick}
                                  aria-pressed={isSel}
                                  aria-label={`${rowTitle}; ${kindLabel}; ${summaryDisplay}; ${stamp}`}
                                  className="w-full cursor-pointer px-2 py-1.5 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                                >
                                  <p
                                    className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
                                    title={rowTitle}
                                  >
                                    {rowTitle}
                                  </p>
                                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                                    <span
                                      className="min-w-0 truncate text-[10px] text-zinc-600 dark:text-zinc-300"
                                      title={kindLabel}
                                    >
                                      {kindLabel}
                                    </span>
                                    {ev.source === "epcis" ? (
                                      <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[8px] font-medium uppercase text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                        EPCIS
                                      </span>
                                    ) : ev.source === "form" ? (
                                      <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[8px] font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
                                        Form
                                      </span>
                                    ) : ev.source === "deliveries-ingest" ? (
                                      <span className="shrink-0 rounded bg-emerald-100 px-1 py-px text-[8px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                                        Deliveries
                                      </span>
                                    ) : null}
                                    {timelineProvenanceForEvent(projectId.trim(), ev.source) ? (
                                      <Link
                                        href="/timeline/provenance"
                                        className="shrink-0 rounded bg-violet-100 px-1 py-px text-[8px] font-medium text-violet-900 underline-offset-2 hover:underline dark:bg-violet-900/40 dark:text-violet-200"
                                        title="Repo files and import pipeline for this source"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Files
                                      </Link>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <EventTimeTenseBadge iso={ev.timestampIso} />
                                    <time
                                      dateTime={ev.timestampIso}
                                      className="font-mono text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400"
                                      title={ev.timestampIso}
                                    >
                                      {stamp}
                                    </time>
                                  </div>
                                  {cardBestekHint || summaryDisplay !== "—" ? (
                                    <p
                                      className="mt-1 line-clamp-3 text-[10px] text-zinc-500 dark:text-zinc-400"
                                      title={cardSummaryTitle}
                                    >
                                      {cardBestekHint ? (
                                        <BestekBindingsMilestoneDataHint
                                          parsed={cardBestekParsed!}
                                        />
                                      ) : (
                                        summaryDisplay
                                      )}
                                    </p>
                                  ) : null}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>

                <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  <Link
                    href="/pipeline"
                    className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Pipeline journey
                  </Link>
                  <span className="mx-1.5 text-zinc-400 dark:text-zinc-500" aria-hidden>
                    ·
                  </span>
                  <Link
                    href="/timeline/provenance"
                    className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Data flow
                  </Link>
                </p>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}

