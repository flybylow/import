"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KGNode, KGLink } from "@/components/KgForceGraph";
import KgForceGraph3D from "@/components/KgForceGraph3D";
import { EPCIS_JSON_SEPARATOR, getEpcisHumanNotesForRow } from "@/lib/timeline/epcis";
import type {
  TimelineBcfFields,
  TimelineEpcisFields,
  TimelineScheduleFields,
} from "@/lib/timeline-events";
import { materialSlugFromReference } from "@/lib/timeline/construction-buildup";
import {
  TIMELINE_EVENT_LABELS,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";

export type TimelineGraphEventRow = {
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
};

/** Hard upper bound to protect WebGL / layout from pathological TTL files. */
export const TIMELINE_GRAPH_MAX_CAP = 250;
export const TIMELINE_GRAPH_DEFAULT_CAP = 80;

const CAP_CHOICES = [30, 50, 80, 120, 180, 250] as const;

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function humanTimelineMessage(message?: string): string | undefined {
  if (!message?.trim()) return undefined;
  const idx = message.indexOf(EPCIS_JSON_SEPARATOR);
  if (idx >= 0) return message.slice(0, idx).trim();
  return message.trim();
}

/** Last line `BIM: …` from construction-import messages (see import-schependomlaan-timeline-audit). */
function bimReferenceFromMessage(message?: string): string | undefined {
  if (!message?.trim()) return undefined;
  const lines = message.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^BIM:\s*(.+)$/);
    if (m) return m[1].trim();
  }
  return undefined;
}

/** Message body without trailing `BIM:` line (graph summary / first-line title use). */
function humanTimelineMessageWithoutBimTail(message?: string): string | undefined {
  const raw = humanTimelineMessage(message);
  if (!raw) return undefined;
  const lines = raw.split("\n");
  while (lines.length > 0 && /^\s*BIM:\s*.+$/.test(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  const out = lines.join("\n").trim();
  return out || undefined;
}

function shortGs1EventId(id?: string): string | undefined {
  if (!id?.trim()) return undefined;
  const u = id.trim();
  if (u.length > 32) return `${u.slice(0, 18)}…${u.slice(-10)}`;
  return u;
}

function epcisQuantityLabel(json?: string): string | undefined {
  if (!json?.trim()) return undefined;
  try {
    const arr = JSON.parse(json) as Array<{ quantity?: number; uom?: string }>;
    const q = arr[0];
    if (!q) return undefined;
    const u = q.uom?.trim() || "";
    return `${q.quantity ?? "—"}${u ? ` ${u}` : ""}`;
  } catch {
    return undefined;
  }
}

/** Stable graph id for a material / EPC URI (shared hub across events). */
function stableMaterialNodeId(uri: string): string {
  let h = 2166136261;
  for (let i = 0; i < uri.length; i++) {
    h ^= uri.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `tl-mat-${(h >>> 0).toString(36)}`;
}

function shortMaterialLabel(uri: string): string {
  const t = uri.trim();
  const tail = t.includes("/") ? t.split("/").pop() || t : t;
  return tail.length > 26 ? `${tail.slice(0, 24)}…` : tail;
}

export type TimelineGraphBuildOpts = {
  /** Max events in graph (newest first). Clamped to `TIMELINE_GRAPH_MAX_CAP`. */
  eventCap: number;
  /**
   * Full: each event has satellite property nodes (rich but heavy).
   * Compact: one node per event only — scales to larger caps; open the inspector for fields.
   */
  compact: boolean;
  /**
   * When true: timeline hub + event chain only — no shared DPP material hubs and no per-event
   * field satellites (timestamp, actor, message, BIM, …). Inspector still shows full event data.
   */
  eventsOnly: boolean;
  /**
   * `spine`: time strip (optionally materials under events when not events-only).
   * `materialFlow`: DPP materials on the left, edges **material → event** into the time strip.
   */
  layoutMode: "spine" | "materialFlow";
};

function buildGraph(
  projectId: string,
  events: TimelineGraphEventRow[],
  opts: TimelineGraphBuildOpts
) {
  const nodes: KGNode[] = [];
  const links: KGLink[] = [];

  /** Same order as API: newest first (left / low index); cap keeps the most recent events. */
  const ordered = events;
  const cap = Math.max(
    10,
    Math.min(TIMELINE_GRAPH_MAX_CAP, Math.floor(opts.eventCap))
  );
  const trimmed = ordered.length > cap ? ordered.slice(0, cap) : ordered;
  const dropped = ordered.length - trimmed.length;
  const compact = opts.compact;
  const eventsOnly = opts.eventsOnly;
  const layoutMode = opts.layoutMode;
  const isMaterialFlow = layoutMode === "materialFlow";

  /** Keep total horizontal spread roughly bounded as event count grows. */
  const rowGap = Math.max(
    28,
    Math.min(92, Math.floor(2600 / Math.max(trimmed.length, 1)))
  );

  const matRefToIndices = new Map<string, number[]>();
  trimmed.forEach((ev, i) => {
    const m = ev.materialReference?.trim();
    if (!m) return;
    if (!matRefToIndices.has(m)) matRefToIndices.set(m, []);
    matRefToIndices.get(m)!.push(i);
  });

  const spineShowMaterialUnderStrip = !eventsOnly && !isMaterialFlow && matRefToIndices.size > 0;
  const hasFlowMaterials = isMaterialFlow && matRefToIndices.size > 0;
  const hubX = hasFlowMaterials ? -400 : -200;
  const eventBaseX0 = hasFlowMaterials ? 160 : 0;

  const hubId = `tl-hub-${projectId}`;
  nodes.push({
    id: hubId,
    label: `Timeline · ${projectId}`,
    kind: "timelineHub",
    x: hubX,
    y: 0,
    z: 0,
    val: 2.8,
    color: "#a1a1aa",
    meta: { nodeType: "timelineHub", projectId },
  });

  const matHubColor = "#34d399";

  if (spineShowMaterialUnderStrip) {
    matRefToIndices.forEach((indices, uri) => {
      const meanX = eventBaseX0 + indices.reduce((s, idx) => s + idx * rowGap, 0) / indices.length;
      let hz = 2166136261;
      for (let c = 0; c < uri.length; c++) {
        hz ^= uri.charCodeAt(c);
        hz = Math.imul(hz, 16777619);
      }
      const zJitter = ((hz >>> 0) % 48) - 24;
      const linkCount = indices.length;
      const id = stableMaterialNodeId(uri);
      nodes.push({
        id,
        label: shortMaterialLabel(uri),
        kind: "timelineMaterial",
        x: meanX,
        y: -100,
        z: zJitter - 48,
        val: 1.5 + Math.min(linkCount * 0.12, 1.4),
        color: matHubColor,
        meta: {
          nodeType: "timelineMaterial",
          materialReference: uri,
          linkCount,
        },
      });
    });
  }

  if (hasFlowMaterials) {
    const sorted = [...matRefToIndices.entries()].sort(
      (a, b) => Math.min(...a[1]) - Math.min(...b[1])
    );
    sorted.forEach(([uri, indices], mi) => {
      const n = sorted.length;
      const y = (mi - (n - 1) / 2) * 50;
      let hz = 2166136261;
      for (let c = 0; c < uri.length; c++) {
        hz ^= uri.charCodeAt(c);
        hz = Math.imul(hz, 16777619);
      }
      const zJitter = ((hz >>> 0) % 36) - 18;
      const linkCount = indices.length;
      const id = stableMaterialNodeId(uri);
      nodes.push({
        id,
        label: shortMaterialLabel(uri),
        kind: "timelineMaterial",
        x: hubX + 120,
        y,
        z: zJitter,
        val: 1.6 + Math.min(linkCount * 0.12, 1.5),
        color: matHubColor,
        meta: {
          nodeType: "timelineMaterial",
          materialReference: uri,
          linkCount,
          layoutHint: "materialFlow",
        },
      });
      links.push({ source: hubId, target: id, color: "#2dd4bf" });
    });
  }

  const propRadius = 52;
  const propColors = {
    when: "#a5b4fc",
    actor: "#7dd3fc",
    action: "#e9d5ff",
    express: "#fdba74",
    bimUri: "#fb923c",
    message: "#86efac",
    epcisBiz: "#fbbf24",
    epcisDisp: "#f59e0b",
    epcisQty: "#fcd34d",
    epcisId: "#fde68a",
    epcisLoc: "#a7f3d0",
  } as const;

  const hidePropSatellites = compact || eventsOnly || isMaterialFlow;

  trimmed.forEach((ev, i) => {
    const baseX = eventBaseX0 + i * rowGap;
    const baseY = isMaterialFlow ? Math.sin(i * 0.2) * 30 : 0;
    const evNodeId = `tev-${ev.eventId}`;
    const evZ = Math.sin(i * 0.22) * 36;

    const isEpcis = ev.eventAction === "epcis_supply_chain_event";
    const compactLabel = `${formatStamp(ev.timestampIso)} · ${TIMELINE_EVENT_LABELS[ev.eventAction]}`;
    nodes.push({
      id: evNodeId,
      label: compact ? compactLabel : TIMELINE_EVENT_LABELS[ev.eventAction],
      kind: "timelineEvent",
      x: baseX,
      y: baseY,
      z: evZ,
      val: compact ? 1.85 : 2.2,
      color: isEpcis ? "#fde68a" : "#d8b4fe",
      meta: {
        nodeType: "timelineEvent",
        eventId: ev.eventId,
        timestampIso: ev.timestampIso,
        actorSystem: ev.actorSystem,
        actorLabel: ev.actorLabel,
        eventAction: ev.eventAction,
        message: ev.message,
        targetExpressId: ev.targetExpressId,
        source: ev.source,
        confidence: ev.confidence,
        materialReference: ev.materialReference,
        epcisFields: ev.epcisFields,
      },
    });

    if (i === 0) {
      links.push({ source: hubId, target: evNodeId });
    } else {
      const prev = trimmed[i - 1];
      links.push({ source: `tev-${prev.eventId}`, target: evNodeId });
    }

    const matRef = ev.materialReference?.trim();
    if (matRef) {
      const mid = stableMaterialNodeId(matRef);
      if (spineShowMaterialUnderStrip) {
        links.push({ source: evNodeId, target: mid, color: "#34d399" });
      } else if (isMaterialFlow) {
        links.push({ source: mid, target: evNodeId, color: "#34d399" });
      }
    }

    const props: Array<{
      suffix: string;
      label: string;
      color: string;
      field: string;
      value: string;
    }> = [
      {
        suffix: "when",
        label: formatStamp(ev.timestampIso),
        color: propColors.when,
        field: "timestamp",
        value: ev.timestampIso,
      },
      {
        suffix: "actor",
        label: ev.actorSystem ? "system" : ev.actorLabel || "—",
        color: propColors.actor,
        field: "actor",
        value: ev.actorSystem ? "system" : ev.actorLabel || "",
      },
      {
        suffix: "type",
        label: ev.eventAction,
        color: propColors.action,
        field: "eventAction",
        value: ev.eventAction,
      },
    ];

    if (ev.targetExpressId !== undefined) {
      props.push({
        suffix: "expr",
        label: `IFC ${ev.targetExpressId}`,
        color: propColors.express,
        field: "targetExpressId",
        value: String(ev.targetExpressId),
      });
    }

    const bimUri = bimReferenceFromMessage(ev.message);
    if (bimUri) {
      props.push({
        suffix: "bim",
        label: bimUri.length > 26 ? `${bimUri.slice(0, 24)}…` : bimUri,
        color: propColors.bimUri,
        field: "bimReference",
        value: bimUri,
      });
    }

    if (isEpcis && ev.epcisFields) {
      const e = ev.epcisFields;
      if (e.bizStep?.trim()) {
        props.push({
          suffix: "ep-biz",
          label: e.bizStep.replace(/_/g, " "),
          color: propColors.epcisBiz,
          field: "epcisBizStep",
          value: e.bizStep,
        });
      }
      if (e.disposition?.trim()) {
        props.push({
          suffix: "ep-disp",
          label: e.disposition.replace(/_/g, " "),
          color: propColors.epcisDisp,
          field: "epcisDisposition",
          value: e.disposition,
        });
      }
      const qtyL = epcisQuantityLabel(e.quantityListJson);
      if (qtyL) {
        props.push({
          suffix: "ep-qty",
          label: qtyL,
          color: propColors.epcisQty,
          field: "epcisQuantityListJson",
          value: e.quantityListJson ?? qtyL,
        });
      }
      const gid = shortGs1EventId(e.gs1EventId);
      if (gid) {
        props.push({
          suffix: "ep-id",
          label: gid,
          color: propColors.epcisId,
          field: "epcisGs1EventId",
          value: e.gs1EventId ?? gid,
        });
      }
      if (e.readPointId?.trim()) {
        const t = e.readPointId.trim();
        props.push({
          suffix: "ep-rp",
          label: `readPt ${t.length > 22 ? `${t.slice(0, 20)}…` : t}`,
          color: propColors.epcisLoc,
          field: "epcisReadPointId",
          value: t,
        });
      }
      if (e.bizLocationId?.trim()) {
        const t = e.bizLocationId.trim();
        props.push({
          suffix: "ep-bl",
          label: `loc ${t.length > 22 ? `${t.slice(0, 20)}…` : t}`,
          color: propColors.epcisLoc,
          field: "epcisBizLocationId",
          value: t,
        });
      }
    }

    const epcisSummaryNotes =
      ev.eventAction === "epcis_supply_chain_event" || ev.epcisFields != null
        ? getEpcisHumanNotesForRow(ev)
        : [];
    const msgForGraph =
      epcisSummaryNotes.length > 0
        ? epcisSummaryNotes.join("\n")
        : humanTimelineMessageWithoutBimTail(ev.message) ?? humanTimelineMessage(ev.message);
    if (msgForGraph?.trim()) {
      const labelLine =
        epcisSummaryNotes[0] ??
        msgForGraph.split("\n").find((l) => l.trim()) ??
        msgForGraph;
      const t = labelLine.trim();
      props.push({
        suffix: "msg",
        label: t.length > 36 ? `${t.slice(0, 34)}…` : t,
        color: propColors.message,
        field: "message",
        value: msgForGraph.trim(),
      });
    }

    if (!hidePropSatellites) {
      const nProps = props.length;
      props.forEach((p, pi) => {
        const angle = Math.PI * 0.35 + (Math.PI * 0.9 * pi) / Math.max(1, nProps - 0.001);
        const pid = `${evNodeId}-${p.suffix}`;
        const propZ = evZ + 52 + Math.sin(angle * 1.1) * 14;
        nodes.push({
          id: pid,
          label: p.label,
          kind: "timelineProp",
          x: baseX + propRadius * Math.cos(angle),
          y: baseY + propRadius * Math.sin(angle),
          z: propZ,
          val: 1.1,
          color: p.color,
          draggable: p.field === "message",
          meta: {
            nodeType: "timelineProp",
            parentEventId: ev.eventId,
            field: p.field,
            value: p.value,
          },
        });
        links.push({ source: evNodeId, target: pid });
      });
    }
  });

  return {
    nodes,
    links,
    trimmedCount: trimmed.length,
    dropped,
    capUsed: cap,
    compact,
    eventsOnly,
    layoutMode,
    rowGap,
  };
}

export default function TimelineKbGraph(props: {
  projectId: string;
  events: TimelineGraphEventRow[];
  /** Use remaining viewport: flex column + full-height WebGL container (timeline page). */
  fillViewport?: boolean;
  /**
   * When set with `onLayoutModeChange`, layout is controlled (e.g. URL `kbLayout` on timeline page).
   */
  layoutMode?: "spine" | "materialFlow";
  onLayoutModeChange?: (mode: "spine" | "materialFlow") => void;
}) {
  const { projectId, events, fillViewport, layoutMode: layoutModeProp, onLayoutModeChange } =
    props;
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [eventCap, setEventCap] = useState<number>(TIMELINE_GRAPH_DEFAULT_CAP);
  /** Default on: one node per event; field details in inspector (minimal graph chrome). */
  const [compact, setCompact] = useState(true);
  /** Default on: chronology spine without material hubs or per-field satellites. */
  const [eventsOnly, setEventsOnly] = useState(true);
  /** Progressive disclosure: legend, long control hints, material-flow explainer. */
  const [showGraphHelp, setShowGraphHelp] = useState(false);
  const [layoutModeInternal, setLayoutModeInternal] = useState<"spine" | "materialFlow">("spine");
  const layoutModeControlled =
    layoutModeProp !== undefined && typeof onLayoutModeChange === "function";
  const layoutMode = layoutModeControlled ? layoutModeProp : layoutModeInternal;
  const setLayoutMode = layoutModeControlled ? onLayoutModeChange : setLayoutModeInternal;

  useEffect(() => {
    if (layoutMode === "materialFlow" && eventsOnly) setEventsOnly(false);
  }, [layoutMode, eventsOnly]);

  const suggestedCompact = events.length > 45 && !eventsOnly && layoutMode === "spine";

  const {
    nodes,
    links,
    trimmedCount,
    dropped,
    capUsed,
    compact: compactActive,
    eventsOnly: eventsOnlyActive,
    layoutMode: layoutModeActive,
    rowGap,
  } = useMemo(
    () =>
      buildGraph(projectId, events, {
        eventCap,
        compact,
        eventsOnly,
        layoutMode,
      }),
    [projectId, events, eventCap, compact, eventsOnly, layoutMode]
  );

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-600 dark:text-zinc-400">
        No events yet. Record an event to build the timeline graph.
      </div>
    );
  }

  const graphOuter = fillViewport
    ? "relative h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-950/60"
    : undefined;

  return (
    <div
      className={
        fillViewport
          ? "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-3"
          : "flex flex-col gap-3"
      }
    >
      <div className="flex shrink-0 flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
        <div className="min-w-0 shrink">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Timeline KB</span>
          {" · "}
          <span className="font-mono">{trimmedCount}</span> shown
          {dropped > 0 ? (
            <>
              {" "}
              (<span className="font-mono">{dropped}</span> older; cap{" "}
              <span className="font-mono">{capUsed}</span>)
            </>
          ) : null}
          {compactActive ? (
            <>
              {" "}
              · <span className="text-emerald-700 dark:text-emerald-400">compact</span>
            </>
          ) : null}
          {eventsOnlyActive ? (
            <>
              {" "}
              · <span className="text-sky-700 dark:text-sky-400">events only</span>
            </>
          ) : null}
          {layoutModeActive === "materialFlow" ? (
            <>
              {" "}
              · <span className="text-teal-700 dark:text-teal-400">material → work</span>
            </>
          ) : null}
          {showGraphHelp ? (
            <>
              {" · "}
              <span className="whitespace-nowrap">
                spacing <span className="font-mono">{rowGap}</span>px
              </span>
            </>
          ) : null}
        </div>
        <label className="inline-flex items-center gap-2">
          <span className="shrink-0 text-zinc-500 dark:text-zinc-500">Cap</span>
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            value={eventCap}
            onChange={(e) => setEventCap(Number(e.target.value))}
          >
            {CAP_CHOICES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          <span className="shrink-0 text-zinc-500 dark:text-zinc-500">Layout</span>
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as "spine" | "materialFlow")}
          >
            <option value="spine">Timeline spine</option>
            <option value="materialFlow">Material → work</option>
          </select>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="rounded border-zinc-300 dark:border-zinc-600"
            checked={eventsOnly}
            onChange={(e) => setEventsOnly(e.target.checked)}
            disabled={layoutMode === "materialFlow"}
          />
          <span className={layoutMode === "materialFlow" ? "text-zinc-400 dark:text-zinc-500" : ""}>
            Events only
            {showGraphHelp ? (
              <span className="text-zinc-500 dark:text-zinc-500">
                {" "}
                — chronology chain only; hides materials and per-field nodes
              </span>
            ) : null}
          </span>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="rounded border-zinc-300 dark:border-zinc-600"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
            disabled={eventsOnly || layoutMode === "materialFlow"}
          />
          <span
            className={
              eventsOnly || layoutMode === "materialFlow" ? "text-zinc-400 dark:text-zinc-500" : ""
            }
          >
            Compact
            {showGraphHelp ? (
              <span className="text-zinc-500 dark:text-zinc-500">
                {" "}
                — one node per event; open the inspector for timestamps, actors, messages, EPCIS, etc.
              </span>
            ) : null}
          </span>
        </label>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label={showGraphHelp ? "Hide graph help and legend" : "Show graph help and legend"}
          aria-expanded={showGraphHelp}
          aria-controls="timeline-kb-graph-help"
          title={showGraphHelp ? "Hide details" : "Help & legend"}
          onClick={() => setShowGraphHelp((v) => !v)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {showGraphHelp ? (
        <div
          id="timeline-kb-graph-help"
          className="max-h-[min(40dvh,22rem)] shrink-0 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400"
          role="region"
          aria-label="Timeline KB graph help"
        >
          <p className="mb-2 leading-snug">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Inspector</span> — Click any
            node for RDF-style fields. With <span className="font-medium">Compact</span> on (default), the
            graph shows one sphere per event; satellites for timestamp, actor, message, etc. are hidden to
            reduce clutter.
          </p>
          {layoutMode === "materialFlow" ? (
            <p className="mb-2 text-[11px] leading-snug">
              Materials come from each event&apos;s{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">timeline:materialReference</span>{" "}
              (DPP URI). <span className="font-medium text-teal-600 dark:text-teal-400">Teal</span> edges hub →
              material; <span className="font-medium text-emerald-600 dark:text-emerald-400">green</span>{" "}
              edges material → activity; amber chains events in time order.
            </p>
          ) : null}
          {suggestedCompact && !compact ? (
            <p className="mb-2">
              <button
                type="button"
                className="text-left font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                onClick={() => setCompact(true)}
              >
                Many events — switch back to compact?
              </button>
            </p>
          ) : null}
          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <div className="mb-1 font-medium text-zinc-800 dark:text-zinc-200">Legend</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <LegendDot color="#a1a1aa" label="Timeline hub" />
              <LegendDot color="#d8b4fe" label="Event (form)" />
              <LegendDot color="#fde68a" label="Event (EPCIS)" />
              {layoutModeActive === "materialFlow" ? (
                <span className="max-w-lg">
                  <LegendDot color="#34d399" label="DPP material (from event materialReference)" />
                  <span className="ml-1">
                    <span className="font-medium text-teal-500">Teal</span> hub → material;{" "}
                    <span className="font-medium text-emerald-500">green</span> material → activity.
                    Property ring hidden in material layout — use the inspector for fields.
                  </span>
                </span>
              ) : eventsOnlyActive ? (
                <span className="max-w-md">
                  Events-only: hub and time-ordered events. Turn off{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Events only</span> for DPP
                  material hubs and per-event field nodes.
                </span>
              ) : !compactActive ? (
                <>
                  <LegendDot color="#a5b4fc" label="timestamp" />
                  <LegendDot color="#7dd3fc" label="actor" />
                  <LegendDot color="#e9d5ff" label="action id" />
                  <LegendDot color="#fdba74" label="IFC expressId" />
                  <LegendDot color="#34d399" label="Shared material (DPP hub)" />
                  <LegendDot color="#fb923c" label="BIM element URI (message)" />
                  <LegendDot color="#86efac" label="summary notes / message" />
                  <LegendDot color="#fbbf24" label="EPCIS detail" />
                </>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Compact: property satellites hidden — click an event for fields.</span>
                  <LegendDot color="#34d399" label="Shared materials still linked" />
                </span>
              )}
              <span
                className="inline-flex items-center gap-1.5 text-amber-400"
                title={
                  layoutModeActive === "materialFlow"
                    ? "Amber: hub → newest event, then each event → next older (time order)."
                    : eventsOnlyActive
                      ? "Edges: hub → newest event, then older events in time order."
                      : "Edges: hub → events in time order; events → shared DPP material hubs when set; events → property satellites when not compact."
                }
              >
                <span aria-hidden className="inline-block h-0.5 w-6 bg-amber-400" />
                Event chain
              </span>
              {layoutModeActive === "materialFlow" ? (
                <>
                  <span
                    className="inline-flex items-center gap-1.5 text-teal-400"
                    title="Timeline hub → DPP material node (orientation)."
                  >
                    <span aria-hidden className="inline-block h-0.5 w-6 bg-teal-400" />
                    Hub → material
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 text-emerald-500"
                    title="Material → audit activity (same predicate as data: timeline:materialReference on the event)."
                  >
                    <span aria-hidden className="inline-block h-0.5 w-6 bg-emerald-500" />
                    Material → activity
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={
          fillViewport
            ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:items-stretch"
            : "flex flex-col gap-4 lg:flex-row lg:items-start"
        }
      >
        <div
          className={
            fillViewport ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "min-w-0 flex-1"
          }
        >
          <KgForceGraph3D
            nodes={nodes}
            links={links}
            onNodeClick={(n) => {
              if (!n) return;
              setSelectedNode({
                id: n.id,
                kind: n.kind,
                label: n.label,
                meta: n.meta,
              });
            }}
            onBackgroundClick={() => {}}
            graphOuterClassName={graphOuter}
          />
        </div>

        <div
          className={
            fillViewport
              ? "flex min-h-0 w-full shrink-0 flex-col lg:max-h-full lg:w-[min(100%,280px)] lg:flex-shrink-0"
              : "w-full shrink-0 lg:w-[280px]"
          }
        >
          <div className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Inspector
          </div>
          <div
            className={
              fillViewport
                ? "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                : "mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
            }
          >
            <div
              className={
                fillViewport
                  ? "min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
                  : "p-3"
              }
            >
              {selectedNode ? (
                <TimelineNodeInspector node={selectedNode} projectId={projectId} />
              ) : (
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Select a node for full fields.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot(props: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: props.color }}
      />
      {props.label}
    </span>
  );
}

function epcisFieldsHasLiteralRows(e: TimelineEpcisFields): boolean {
  return !!(
    e.eventType ||
    e.gs1EventId ||
    e.bizStep ||
    e.disposition ||
    e.captureAction ||
    e.readPointId ||
    e.bizLocationId ||
    e.epcListJson ||
    e.quantityListJson ||
    e.sourceListJson ||
    e.destinationListJson
  );
}

function EpcisFieldsInspector(props: { e: TimelineEpcisFields }) {
  const { e } = props;
  const rows: Array<{ pred: string; value: string; mono?: boolean }> = [];
  if (e.eventType) rows.push({ pred: "timeline:epcisEventType", value: e.eventType });
  if (e.gs1EventId) rows.push({ pred: "timeline:epcisGs1EventId", value: e.gs1EventId });
  if (e.bizStep) rows.push({ pred: "timeline:epcisBizStep", value: e.bizStep });
  if (e.disposition) rows.push({ pred: "timeline:epcisDisposition", value: e.disposition });
  if (e.captureAction) rows.push({ pred: "timeline:epcisCaptureAction", value: e.captureAction });
  if (e.readPointId) rows.push({ pred: "timeline:epcisReadPointId", value: e.readPointId });
  if (e.bizLocationId) rows.push({ pred: "timeline:epcisBizLocationId", value: e.bizLocationId });
  if (e.epcListJson)
    rows.push({ pred: "timeline:epcisEpcListJson", value: e.epcListJson, mono: true });
  if (e.quantityListJson)
    rows.push({ pred: "timeline:epcisQuantityListJson", value: e.quantityListJson, mono: true });
  if (e.sourceListJson)
    rows.push({ pred: "timeline:epcisSourceListJson", value: e.sourceListJson, mono: true });
  if (e.destinationListJson)
    rows.push({
      pred: "timeline:epcisDestinationListJson",
      value: e.destinationListJson,
      mono: true,
    });
  if (rows.length === 0) return null;
  return (
    <dl className="mt-1 space-y-2">
      {rows.map((r) => (
        <div key={r.pred}>
          <dt className="font-mono text-[10px] text-zinc-500">{r.pred}</dt>
          <dd
            className={
              r.mono
                ? "mt-0.5 max-h-28 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-1.5 font-mono text-[10px] text-zinc-200 dark:border-zinc-700"
                : "break-all font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
            }
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function parseIfcExpressId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim());
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return null;
}

function InspectorBimElementLinks(props: { projectId: string; expressId: number }) {
  const pid = encodeURIComponent(props.projectId.trim() || "example");
  const ex = encodeURIComponent(String(props.expressId));
  const passportHref = `/bim?projectId=${pid}&view=passports&expressId=${ex}`;
  const viewerHref = `/bim?projectId=${pid}&view=building&expressId=${ex}`;
  return (
    <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        IFC element
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Link
          href={passportHref}
          className="text-[11px] font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
        >
          Open passport
        </Link>
        <Link
          href={viewerHref}
          className="text-[11px] font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
        >
          Open in 3D viewer
        </Link>
      </div>
    </div>
  );
}

/** DPP material slug → BIM 3D sample group + raw KB inspect (same project). */
function InspectorBimMaterialReferenceLinks(props: { projectId: string; materialReference: string }) {
  const slug = materialSlugFromReference(props.materialReference);
  const pid = encodeURIComponent(props.projectId.trim() || "example");
  if (!slug) return null;
  const encSlug = encodeURIComponent(slug);
  const sampleHref = `/bim?projectId=${pid}&view=3dtest&materialSlug=${encSlug}`;
  const inspectHref = `/bim?projectId=${pid}&view=inspect`;
  return (
    <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Open in BIM
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Link
          href={sampleHref}
          className="text-[11px] font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300"
        >
          Highlight material in 3D sample
        </Link>
        <Link
          href={inspectHref}
          className="text-[11px] font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
        >
          Inspect API (KB)
        </Link>
      </div>
      <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        3D sample loads passport materials and highlights every IFC instance whose material name matches
        this slug (same heuristic as timeline construction buildup).
      </p>
    </div>
  );
}

function TimelineNodeInspector(props: { node: any; projectId: string }) {
  const { projectId } = props;
  const meta = props.node?.meta ?? {};
  const nt = meta.nodeType;

  if (nt === "timelineHub") {
    return (
      <div className="space-y-2 text-xs text-zinc-800 dark:text-zinc-50">
        <div className="font-medium">timeline:TimelineRoot</div>
        <div>
          <span className="font-mono text-zinc-500">projectId</span>{" "}
          <span className="font-mono">{meta.projectId ?? "—"}</span>
        </div>
      </div>
    );
  }

  if (nt === "timelineMaterial") {
    const flow = meta.layoutHint === "materialFlow";
    return (
      <div className="space-y-2 text-xs text-zinc-800 dark:text-zinc-50">
        <div className="font-medium">Shared material (DPP)</div>
        <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
          One node per distinct <span className="font-mono">timeline:materialReference</span> on audit
          events in this cap window. Data line: RDF{" "}
          <span className="font-mono">timeline:materialReference</span> → API{" "}
          <span className="font-mono">materialReference</span>.
          {flow ? (
            <>
              {" "}
              In <span className="font-medium">Material → work</span>, green edges go{" "}
              <span className="font-medium">material → activity</span>; the timeline hub also links to
              each material for orientation.
            </>
          ) : (
            <>
              {" "}
              In the spine layout, edges run <span className="font-medium">activity → material</span>{" "}
              under the time strip.
            </>
          )}
        </p>
        <div>
          <span className="font-mono text-zinc-500">materialReference</span>
          <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-700 dark:text-zinc-200">
            {meta.materialReference ?? "—"}
          </p>
        </div>
        <div>
          <span className="font-mono text-zinc-500">events linked (cap window)</span>{" "}
          <span className="tabular-nums">{meta.linkCount ?? "—"}</span>
        </div>
        <InspectorBimMaterialReferenceLinks
          projectId={projectId}
          materialReference={String(meta.materialReference ?? "")}
        />
      </div>
    );
  }

  if (nt === "timelineEvent") {
    const eventExpressId = parseIfcExpressId(meta.targetExpressId);
    return (
      <div className="space-y-2 text-xs text-zinc-800 dark:text-zinc-50">
        <div className="font-medium">timeline:AuditEvent</div>
        <div>
          <span className="font-mono text-zinc-500">eventId</span>{" "}
          <span className="break-all font-mono">{meta.eventId ?? "—"}</span>
        </div>
        <div>
          <span className="font-mono text-zinc-500">timestamp</span>{" "}
          <span className="font-mono">{meta.timestampIso ?? "—"}</span>
        </div>
        <div>
          <span className="font-mono text-zinc-500">eventAction</span>{" "}
          <span className="font-mono">{meta.eventAction ?? "—"}</span>
        </div>
        <div>
          <span className="font-mono text-zinc-500">label</span>{" "}
          <span>
            {meta.eventAction
              ? TIMELINE_EVENT_LABELS[meta.eventAction as TimelineEventAction]
              : "—"}
          </span>
        </div>
        <div>
          <span className="font-mono text-zinc-500">actorSystem</span>{" "}
          <span>{meta.actorSystem ? "true" : "false"}</span>
        </div>
        <div>
          <span className="font-mono text-zinc-500">actorLabel</span>{" "}
          <span>{meta.actorLabel ?? "—"}</span>
        </div>
        {meta.targetExpressId !== undefined ? (
          <div>
            <span className="font-mono text-zinc-500">targetExpressId</span>{" "}
            <span className="font-mono">{meta.targetExpressId}</span>
          </div>
        ) : null}
        {eventExpressId != null ? (
          <InspectorBimElementLinks projectId={projectId} expressId={eventExpressId} />
        ) : null}
        {meta.source ? (
          <div>
            <span className="font-mono text-zinc-500">source</span>{" "}
            <span className="font-mono">{meta.source}</span>
          </div>
        ) : null}
        {meta.confidence !== undefined ? (
          <div>
            <span className="font-mono text-zinc-500">confidence</span>{" "}
            <span>{(Number(meta.confidence) * 100).toFixed(0)}%</span>
          </div>
        ) : null}
        {meta.materialReference ? (
          <div>
            <span className="font-mono text-zinc-500">materialReference</span>
            <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
              {meta.materialReference}
            </p>
          </div>
        ) : null}
        {meta.epcisFields ? (
          (() => {
            const ef = meta.epcisFields as TimelineEpcisFields;
            const epcisNotes = getEpcisHumanNotesForRow({
              message: meta.message,
              epcisFields: ef,
            });
            const hasLiterals = epcisFieldsHasLiteralRows(ef);
            return (
              <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                {epcisNotes.length > 0 ? (
                  <div>
                    <div className="font-medium text-zinc-700 dark:text-zinc-300">EPCIS summary</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-700 dark:text-zinc-300">
                      {epcisNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {hasLiterals ? (
                  <details
                    open={epcisNotes.length === 0}
                    className="rounded-md border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/40"
                  >
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      RDF literals (<span className="font-mono">timeline:epcis*</span>)
                    </summary>
                    <div className="border-t border-zinc-200 px-2 py-2 dark:border-zinc-700">
                      <EpcisFieldsInspector e={ef} />
                    </div>
                  </details>
                ) : null}
                {typeof meta.message === "string" && meta.message.includes(EPCIS_JSON_SEPARATOR) ? (
                  <details className="rounded-md border border-zinc-200 dark:border-zinc-700">
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Raw ObjectEvent JSON in <span className="font-mono">timeline:message</span>
                    </summary>
                    <p className="border-t border-zinc-200 px-2 py-2 text-[11px] leading-snug text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      Stored after the <span className="font-mono">--- EPCIS JSON ---</span> separator.
                      Expand the event in the <strong>Selected event</strong> or event log panel to read
                      the full <span className="font-mono">timeline:message</span>.
                    </p>
                  </details>
                ) : null}
              </div>
            );
          })()
        ) : null}
        {!meta.epcisFields
          ? (() => {
              const notes =
                meta.eventAction === "epcis_supply_chain_event"
                  ? getEpcisHumanNotesForRow({
                      message: meta.message,
                      epcisFields: undefined,
                    })
                  : [];
              if (notes.length > 0) {
                return (
                  <div>
                    <span className="font-mono text-zinc-500">summary notes</span>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-zinc-700 dark:text-zinc-300">
                      {notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                );
              }
              const bimR = bimReferenceFromMessage(meta.message);
              const hm = humanTimelineMessageWithoutBimTail(meta.message);
              if (!hm && !bimR) return null;
              return (
                <>
                  {hm ? (
                    <div>
                      <span className="font-mono text-zinc-500">message</span>
                      <p className="mt-0.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{hm}</p>
                    </div>
                  ) : null}
                  {bimR ? (
                    <div>
                      <span className="font-mono text-zinc-500">bimReference</span>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {bimR}
                      </p>
                    </div>
                  ) : null}
                </>
              );
            })()
          : null}
        {!meta.epcisFields &&
        typeof meta.message === "string" &&
        meta.message.includes(EPCIS_JSON_SEPARATOR) ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            Full EPCIS JSON is in <span className="font-mono">timeline:message</span> after the
            separator — expand the event in the list or selected panel.
          </p>
        ) : null}
      </div>
    );
  }

  if (nt === "timelineProp") {
    const propExpressId =
      meta.field === "targetExpressId" ? parseIfcExpressId(meta.value) : null;
    return (
      <div className="space-y-2 text-xs text-zinc-800 dark:text-zinc-50">
        <div className="font-medium">Property</div>
        <div>
          <span className="font-mono text-zinc-500">field</span>{" "}
          <span className="font-mono">{meta.field ?? "—"}</span>
        </div>
        <div>
          <span className="font-mono text-zinc-500">value</span>
          <p className="mt-0.5 break-words font-mono text-zinc-700 dark:text-zinc-300">
            {String(meta.value ?? "—")}
          </p>
        </div>
        <div>
          <span className="font-mono text-zinc-500">eventId</span>{" "}
          <span className="break-all font-mono">{meta.parentEventId ?? "—"}</span>
        </div>
        {propExpressId != null ? (
          <InspectorBimElementLinks projectId={projectId} expressId={propExpressId} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-300">
      {props.node?.label ?? props.node?.id ?? "—"}
    </div>
  );
}
