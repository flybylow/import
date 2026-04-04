"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ProjectIdField from "@/components/ProjectIdField";
import { useProjectId } from "@/lib/useProjectId";
import { EPCIS_JSON_SEPARATOR, getEpcisHumanNotesForRow } from "@/lib/timeline/epcis";
import type { TimelineEpcisFields } from "@/lib/timeline-events";
import {
  TIMELINE_DEFAULT_TARGET_EXPRESS_ID,
  TIMELINE_EVENT_ACTIONS,
  TIMELINE_EVENT_LABELS,
  TIMELINE_TARGET_EXPRESS_OPTIONS,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";

const TimelineKbGraph = dynamic(
  () => import("@/components/TimelineKbGraph"),
  { ssr: false, loading: () => <p className="text-sm text-zinc-500">Loading graph…</p> }
);

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
};

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

function columnHoverSummary(ev: ParsedRow): string {
  const parts = [
    TIMELINE_EVENT_LABELS[ev.eventAction],
    ev.timestampIso,
    ev.actorSystem ? "system" : ev.actorLabel || "—",
  ];
  if (ev.source) parts.push(`source: ${ev.source}`);
  if (ev.materialReference) parts.push(ev.materialReference);
  if (ev.eventAction === "epcis_supply_chain_event" || ev.epcisFields) {
    const n = getEpcisHumanNotesForRow(ev);
    if (n.length) parts.push(n.join(" · "));
  }
  return parts.join(" · ");
}

function prettyJsonMaybe(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function TimelineEventDetailPanel(props: { ev: ParsedRow; onClear: () => void }) {
  const { ev, onClear } = props;
  const [showEpcisJson, setShowEpcisJson] = useState(false);
  const jsonIdx = ev.message?.indexOf(EPCIS_JSON_SEPARATOR) ?? -1;
  const hasEpcisPayload = jsonIdx >= 0;
  const humanMessage = hasEpcisPayload ? ev.message!.slice(0, jsonIdx) : ev.message;
  const epcisJsonBlock = hasEpcisPayload
    ? ev.message!.slice(jsonIdx + EPCIS_JSON_SEPARATOR.length)
    : "";

  const metaRows: Array<{ k: string; v: ReactNode }> = [
    { k: "eventId", v: <span className="break-all font-mono">{ev.eventId}</span> },
    { k: "timestamp", v: <span className="font-mono">{ev.timestampIso}</span> },
    {
      k: "type",
      v: (
        <span>
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
    metaRows.push({ k: "source", v: <span className="font-mono">{ev.source}</span> });
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
      v: <span className="break-all font-mono text-xs">{ev.materialReference}</span>,
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

  return (
    <section
      className="rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/60"
      aria-label="Selected event metadata"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Event details
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Clear selection
        </button>
      </div>
      <div className="max-h-[min(70vh,28rem)] overflow-y-auto px-3 py-3">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr] sm:gap-y-2">
          {metaRows.map((row) => (
            <div key={row.k} className="contents">
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{row.k}</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-100">{row.v}</dd>
            </div>
          ))}
        </dl>

        {ev.eventAction === "epcis_supply_chain_event" || ev.epcisFields ? (
          (() => {
            const summaryNotes = getEpcisHumanNotesForRow(ev);
            if (summaryNotes.length === 0) return null;
            return (
              <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  EPCIS summary (one line per facet)
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-zinc-800 dark:text-zinc-200">
                  {summaryNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            );
          })()
        ) : humanMessage?.trim() ? (
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
              {humanMessage.trim()}
            </p>
          </div>
        ) : null}

        {ef?.epcListJson || ef?.quantityListJson || ef?.sourceListJson || ef?.destinationListJson ? (
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              EPCIS lists (also in RDF as <span className="font-mono">timeline:epcis*Json</span>)
            </p>
            <div className="mt-2 space-y-2">
              {ef.epcListJson ? (
                <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-2 text-[11px] text-zinc-200 dark:border-zinc-700">
                  {prettyJsonMaybe(ef.epcListJson)}
                </pre>
              ) : null}
              {ef.quantityListJson ? (
                <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-2 text-[11px] text-zinc-200 dark:border-zinc-700">
                  {prettyJsonMaybe(ef.quantityListJson)}
                </pre>
              ) : null}
              {ef.sourceListJson ? (
                <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-2 text-[11px] text-zinc-200 dark:border-zinc-700">
                  {prettyJsonMaybe(ef.sourceListJson)}
                </pre>
              ) : null}
              {ef.destinationListJson ? (
                <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-2 text-[11px] text-zinc-200 dark:border-zinc-700">
                  {prettyJsonMaybe(ef.destinationListJson)}
                </pre>
              ) : null}
            </div>
          </div>
        ) : null}

        {hasEpcisPayload ? (
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setShowEpcisJson((s) => !s)}
              className="text-xs font-medium text-amber-800 underline dark:text-amber-300"
            >
              {showEpcisJson ? "Hide" : "Show"} full EPCIS JSON (stored in message)
            </button>
            {showEpcisJson ? (
              <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-200 dark:border-zinc-700">
                {epcisJsonBlock.trim()}
              </pre>
            ) : null}
          </div>
        ) : ev.message && !humanMessage?.trim() ? (
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
              {ev.message}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function TimelinePage() {
  const { projectId, setProjectId } = useProjectId();
  const [events, setEvents] = useState<ParsedRow[]>([]);
  const [ttlPath, setTtlPath] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [eventAction, setEventAction] = useState<TimelineEventAction>("manual_note");
  const [message, setMessage] = useState("");
  const [actorLabel, setActorLabel] = useState("");
  const [targetExpressId, setTargetExpressId] = useState(
    String(TIMELINE_DEFAULT_TARGET_EXPRESS_ID)
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"normal" | "graph">("normal");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** API returns newest-first; strip and list show newest on the left / top. */

  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((e) => e.eventId === selectedEventId) : undefined),
    [events, selectedEventId]
  );

  useEffect(() => {
    if (selectedEventId && !events.some((e) => e.eventId === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    setSelectedEventId(null);
  }, [projectId]);

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
      await refresh();
      closeForm();
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 w-full max-w-none flex-1 flex-col px-2 py-2 sm:px-4 sm:py-3">
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
                    {TIMELINE_EVENT_ACTIONS.map((a) => (
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
                  Message (optional)
                </span>
                <textarea
                  value={message}
                  onChange={(ev) => setMessage(ev.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
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
                  Defaults to {TIMELINE_DEFAULT_TARGET_EXPRESS_ID}; choose “No target” to omit.
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
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
          aria-label={`Project timeline: ${projectId}`}
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
              <span
                className="shrink-0 text-amber-600/90 dark:text-amber-500/90"
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <path
                    d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
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
            </div>
          </details>
          {loadError ? (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {loadError}
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
                  events={events}
                  fillViewport
                />
              )}
              <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                <Link
                  href="/pipeline"
                  className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Pipeline journey
                </Link>
              </p>
            </div>
          ) : null}

          {viewMode === "normal" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-8 pb-6">
                <section
                  aria-label="Event timeline"
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-3 sm:px-4"
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
            ) : (
              <div className="overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch] pb-2 pt-1">
                {/*
                  One column per event (compact width); order matches API: newest left.
                  Line segments sit inside each column so they meet at column boundaries.
                */}
                <div className="flex min-w-max px-2">
                  {events.map((ev, i) => {
                    const isFirst = i === 0;
                    const isLast = i === events.length - 1;
                    const isSel = selectedEventId === ev.eventId;
                    return (
                      <button
                        key={ev.eventId}
                        type="button"
                        title={columnHoverSummary(ev)}
                        aria-label={`${TIMELINE_EVENT_LABELS[ev.eventAction]}, ${formatTimelineStamp(ev.timestampIso)}`}
                        aria-pressed={isSel}
                        onClick={() =>
                          setSelectedEventId((id) => (id === ev.eventId ? null : ev.eventId))
                        }
                        className={`flex w-[4.75rem] shrink-0 flex-col items-stretch rounded-md border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500 ${
                          isSel
                            ? "border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800/80"
                            : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                        }`}
                      >
                        <div className="flex min-h-[2.65rem] flex-col justify-end px-0.5 pb-1 pt-0.5 text-center">
                          <p className="text-[8px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100 line-clamp-2">
                            {TIMELINE_EVENT_LABELS[ev.eventAction]}
                          </p>
                          <time
                            dateTime={ev.timestampIso}
                            className="mt-0.5 block max-w-full truncate text-[7px] font-mono tabular-nums leading-none text-zinc-500 dark:text-zinc-400"
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
                            className={`relative z-10 h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-950 ${
                              isSel
                                ? "bg-amber-500 dark:bg-amber-400"
                                : "bg-zinc-800 dark:bg-zinc-200"
                            }`}
                            aria-hidden
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {selectedEvent ? (
            <TimelineEventDetailPanel
              ev={selectedEvent}
              onClear={() => setSelectedEventId(null)}
            />
          ) : events.length > 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
              Select an event on the line above or in the list to view metadata.
            </p>
          ) : null}

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Events</h2>
            </div>
            {events.length === 0 && !loading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No events yet for this project.
              </p>
            ) : null}
            <ul className="space-y-1">
              {events.map((ev) => {
                const isSel = selectedEventId === ev.eventId;
                return (
                  <li key={ev.eventId}>
                    <button
                      type="button"
                      title={columnHoverSummary(ev)}
                      onClick={() =>
                        setSelectedEventId((id) => (id === ev.eventId ? null : ev.eventId))
                      }
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500 ${
                        isSel
                          ? "border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800/80"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900/80"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <time
                          dateTime={ev.timestampIso}
                          className="text-xs font-mono text-zinc-500 dark:text-zinc-400"
                        >
                          {ev.timestampIso}
                        </time>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {TIMELINE_EVENT_LABELS[ev.eventAction]}
                        </span>
                        {ev.source === "epcis" ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            EPCIS
                          </span>
                        ) : ev.source === "form" ? (
                          <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                            Form
                          </span>
                        ) : null}
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {ev.actorSystem ? "system" : ev.actorLabel || "—"}
                        </span>
                        {ev.confidence !== undefined ? (
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            conf {(ev.confidence * 100).toFixed(0)}%
                          </span>
                        ) : null}
                      </div>
                      {ev.materialReference ? (
                        <p className="mt-1 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                          EPC: {ev.materialReference}
                        </p>
                      ) : null}
                      {ev.eventAction === "epcis_supply_chain_event" || ev.epcisFields ? (
                        (() => {
                          const n = getEpcisHumanNotesForRow(ev);
                          if (n.length === 0) return null;
                          return (
                            <ul className="mt-1 max-h-[3.25rem] list-disc space-y-0.5 overflow-hidden pl-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {n.map((line, i) => (
                                <li key={i} className="line-clamp-1">
                                  {line}
                                </li>
                              ))}
                            </ul>
                          );
                        })()
                      ) : ev.message ? (
                        <div className="mt-1 line-clamp-2 text-zinc-600 dark:text-zinc-400">
                          <span className="whitespace-pre-wrap text-xs">{ev.message}</span>
                        </div>
                      ) : null}
                      {ev.targetExpressId !== undefined ? (
                        <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          expressId {ev.targetExpressId}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <Link
                    href="/pipeline"
                    className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Pipeline journey
                  </Link>
                </p>
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
