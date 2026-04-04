"use client";

import { useMemo, useState } from "react";
import type { KGNode, KGLink } from "@/components/KgForceGraph";
import KgForceGraph3D from "@/components/KgForceGraph3D";
import { EPCIS_JSON_SEPARATOR, getEpcisHumanNotesForRow } from "@/lib/timeline/epcis";
import type { TimelineEpcisFields } from "@/lib/timeline-events";
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
};

const GRAPH_EVENT_CAP = 80;

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

function buildGraph(projectId: string, events: TimelineGraphEventRow[]) {
  const nodes: KGNode[] = [];
  const links: KGLink[] = [];

  /** Same order as API: newest first (left / low index); cap keeps the most recent events. */
  const ordered = events;
  const trimmed =
    ordered.length > GRAPH_EVENT_CAP
      ? ordered.slice(0, GRAPH_EVENT_CAP)
      : ordered;
  const dropped = ordered.length - trimmed.length;

  const hubId = `tl-hub-${projectId}`;
  nodes.push({
    id: hubId,
    label: `Timeline · ${projectId}`,
    kind: "timelineHub",
    x: -200,
    y: 0,
    z: 0,
    val: 2.8,
    color: "#a1a1aa",
    meta: { nodeType: "timelineHub", projectId },
  });

  const rowGap = 88;
  const propRadius = 52;
  const propColors = {
    when: "#a5b4fc",
    actor: "#7dd3fc",
    action: "#e9d5ff",
    express: "#fdba74",
    message: "#86efac",
    epcisBiz: "#fbbf24",
    epcisDisp: "#f59e0b",
    epcisQty: "#fcd34d",
    epcisId: "#fde68a",
    epcisEpc: "#d9f99d",
    epcisLoc: "#a7f3d0",
  } as const;

  trimmed.forEach((ev, i) => {
    const baseX = i * rowGap;
    const baseY = 0;
    const evNodeId = `tev-${ev.eventId}`;
    const evZ = Math.sin(i * 0.22) * 36;

    const isEpcis = ev.eventAction === "epcis_supply_chain_event";
    nodes.push({
      id: evNodeId,
      label: TIMELINE_EVENT_LABELS[ev.eventAction],
      kind: "timelineEvent",
      x: baseX,
      y: baseY,
      z: evZ,
      val: 2.2,
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
      if (ev.materialReference?.trim()) {
        const t = ev.materialReference.trim();
        props.push({
          suffix: "ep-epc",
          label: t.length > 28 ? `${t.slice(0, 26)}…` : t,
          color: propColors.epcisEpc,
          field: "materialReference",
          value: t,
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
        : humanTimelineMessage(ev.message);
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
        meta: {
          nodeType: "timelineProp",
          parentEventId: ev.eventId,
          field: p.field,
          value: p.value,
        },
      });
      links.push({ source: evNodeId, target: pid });
    });
  });

  return { nodes, links, trimmedCount: trimmed.length, dropped };
}

export default function TimelineKbGraph(props: {
  projectId: string;
  events: TimelineGraphEventRow[];
  /** Use remaining viewport: flex column + full-height WebGL container (timeline page). */
  fillViewport?: boolean;
}) {
  const { projectId, events, fillViewport } = props;
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const { nodes, links, trimmedCount, dropped } = useMemo(
    () => buildGraph(projectId, events),
    [projectId, events]
  );

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-600 dark:text-zinc-400">
        No events yet. Record an event to build the timeline graph.
      </div>
    );
  }

  const graphOuter = fillViewport
    ? "relative min-h-0 w-full min-h-[min(280px,35dvh)] flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-950/60"
    : undefined;

  return (
    <div
      className={
        fillViewport
          ? "flex min-h-0 flex-1 flex-col gap-2 sm:gap-3"
          : "flex flex-col gap-3"
      }
    >
      <div className="text-xs text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Timeline KB</span>
        {" · "}
        <span className="font-mono">{trimmedCount}</span> event{trimmedCount === 1 ? "" : "s"} in
        graph
        {dropped > 0 ? (
          <>
            {" "}
            (older <span className="font-mono">{dropped}</span> beyond cap; cap{" "}
            <span className="font-mono">{GRAPH_EVENT_CAP}</span>)
          </>
        ) : null}
        . 3D view: amber links and particles show connections; nodes use lighter fills.
      </div>

      <div
        className={
          fillViewport
            ? "flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch"
            : "flex flex-col gap-4 lg:flex-row lg:items-start"
        }
      >
        <div className={fillViewport ? "min-h-0 min-w-0 flex-1" : "min-w-0 flex-1"}>
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
              ? "flex w-full shrink-0 flex-col lg:w-[260px] lg:max-h-full lg:overflow-y-auto"
              : "w-full shrink-0 lg:w-[280px]"
          }
        >
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Inspect node
          </div>
          <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
            {selectedNode ? (
              <TimelineNodeInspector node={selectedNode} />
            ) : (
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                Click a node to see RDF-style fields (event bundle or property).
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-700 dark:text-zinc-300">
        <div className="mb-1 font-medium">Legend</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <LegendDot color="#a1a1aa" label="Timeline hub" />
          <LegendDot color="#d8b4fe" label="Event (form)" />
          <LegendDot color="#fde68a" label="Event (EPCIS)" />
          <LegendDot color="#a5b4fc" label="timestamp" />
          <LegendDot color="#7dd3fc" label="actor" />
          <LegendDot color="#e9d5ff" label="action id" />
          <LegendDot color="#fdba74" label="IFC expressId" />
          <LegendDot color="#86efac" label="summary notes / message" />
          <LegendDot color="#fbbf24" label="EPCIS detail" />
          <span className="inline-flex items-center gap-1.5 text-amber-400">
            <span aria-hidden className="inline-block h-0.5 w-6 bg-amber-400" />
            links
          </span>
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

function TimelineNodeInspector(props: { node: any }) {
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

  if (nt === "timelineEvent") {
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
          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <div className="font-medium text-zinc-600 dark:text-zinc-400">EPCIS (RDF literals)</div>
            <EpcisFieldsInspector e={meta.epcisFields as TimelineEpcisFields} />
          </div>
        ) : null}
        {(() => {
          const notes =
            meta.eventAction === "epcis_supply_chain_event" || meta.epcisFields
              ? getEpcisHumanNotesForRow({
                  message: meta.message,
                  epcisFields: meta.epcisFields,
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
          const hm = humanTimelineMessage(meta.message);
          return hm ? (
            <div>
              <span className="font-mono text-zinc-500">message</span>
              <p className="mt-0.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{hm}</p>
            </div>
          ) : null;
        })()}
        {typeof meta.message === "string" && meta.message.includes(EPCIS_JSON_SEPARATOR) ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            Full EPCIS JSON is stored in <span className="font-mono">timeline:message</span> after
            the separator (see list/detail panel to expand).
          </p>
        ) : null}
      </div>
    );
  }

  if (nt === "timelineProp") {
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
      </div>
    );
  }

  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-300">
      {props.node?.label ?? props.node?.id ?? "—"}
    </div>
  );
}
