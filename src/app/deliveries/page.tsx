"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import DeliveriesBestekPanel from "@/components/DeliveriesBestekPanel";
import DeliveriesPidPanel from "@/components/DeliveriesPidPanel";
import LeveringsbonFicheVisual, {
  type LeveringsbonFicheData,
} from "@/components/LeveringsbonFicheVisual";
import { CollapseSection, InfoDetails } from "@/components/InfoDetails";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { appContentWidthClass } from "@/lib/app-page-layout";
import {
  deliveriesOpenSavedSpecificationFiche,
  deliveriesTabFromQueryParam,
  deliveriesTabQueryValue,
  type DeliveriesTabId,
} from "@/lib/deliveries-tabs";
import { useProjectId } from "@/lib/useProjectId";

const SAMPLE_JSON = `{
  "afleverbon": "WB-2026-03847",
  "date": "2026-03-12",
  "supplier": "Wienerberger NV",
  "werfAddress": "Steenbergstraat 44-52, 1080 Sint-Jans-Molenbeek",
  "items": [
    {"description": "Porotherm 38 T Profi", "quantity": 2880, "unit": "stuks", "lot": "PT38T-2026-B214"},
    {"description": "Porotherm 19 T Profi", "quantity": 1440, "unit": "stuks", "lot": "PT19T-2026-B089"},
    {"description": "Koramic Planum 11", "quantity": 1800, "unit": "stuks", "lot": "KP11-2026-C441"},
    {"description": "Terca Klinker Brussel", "quantity": 4500, "unit": "stuks", "lot": "TK-BRU-2026-A772"}
  ]
}`;

type DeliveryMatchDetail = {
  productName: string;
  epdId: string;
  gwpKgCo2ePerTonne: number | null;
  confidence: number;
  source: string;
};

type DeliveryLineMatch = {
  description: string;
  normalized: string;
  match: DeliveryMatchDetail | null;
  confidence: number | null;
};

type DeliveryIngestResponse = {
  leveringsbon: Record<string, unknown>;
  matches: DeliveryLineMatch[];
  turtle: string;
  summary: {
    total: number;
    matched: number;
    unmatched: number;
    avgConfidence: number;
  };
  persistence?: {
    projectId?: string;
    timeline?: { eventId: string; path: string };
    deliveriesTtl?: { path: string };
  };
};

const DEEP_DOCS: { path: string; label: string }[] = [
  {
    path: "docs/deliveries-importer-integration.md",
    label: "Persistence (data/, timeline, Turtle append) & external DB notes",
  },
  { path: "docs/pid-digitization-plan.md", label: "PID / leveringsbon ↔ BIM roadmap" },
  { path: "docs/sources-contract.md", label: "EPD source snapshots & config.json" },
  {
    path: "docs/kg-dictionary-source-hydration.md",
    label: "Dictionary vs source GWP (Phase 2)",
  },
  { path: "docs/trace-table-for-dictionary.md", label: "Dictionary trace / tuning" },
  { path: "docs/timeline-epcis-integration.md", label: "Timeline & EPCIS ingest" },
  { path: "docs/bim-to-kg-journey.md", label: "IFC → knowledge graph journey" },
];

/** Single-line summary of the leveringsbon ingest path (replaces the old numbered step rail). */
const LEVERINGSBON_SUMMARY_LINE =
  "JSON with an items[] of supplier lines → normalize (material-norm) → dictionary match (material-dictionary.json, first hit) → optional MVP GWP → Turtle (dpp delivery note + bim:epd-*); use the checkboxes for a timeline event and/or append to deliveries TTL.";

const TECH_FILES = [
  { path: "src/lib/deliveries-importer.ts", label: "Core ingest + Turtle" },
  { path: "src/app/api/deliveries/ingest/route.ts", label: "POST API" },
  { path: "src/data/material-dictionary.json", label: "Patterns + MVP GWP" },
  { path: "src/lib/material-norm.ts", label: "Normalization" },
];

function TechnicalFilesPanel() {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
      <ul className="space-y-1 text-[13px] font-mono text-zinc-700 dark:text-zinc-300">
        {TECH_FILES.map((f) => (
          <li key={f.path}>
            <span className="text-zinc-500 dark:text-zinc-500">{f.label}: </span>
            {f.path}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeepDocumentationPanel() {
  return (
    <div className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
      <ul className="space-y-1.5 text-[13px] leading-snug">
        {DEEP_DOCS.map((d) => (
          <li key={d.path}>
            <span className="text-zinc-700 dark:text-zinc-300">{d.label}</span>{" "}
            <code className="font-mono text-[13px] text-emerald-800 dark:text-emerald-400">
              {d.path}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Order matters: Ingest is first (left in LTR; `dir="ltr"` on the tablist keeps that in RTL too). */
const TAB_DEFS: { id: DeliveriesTabId; label: string; title: string }[] = [
  { id: "ingest", label: "Ingest", title: "Leveringsbon JSON ingest, matches & Turtle" },
  {
    id: "specification",
    label: "Specification",
    title: "Bestek / opmeting: dictionary, bindings & preview",
  },
  { id: "pid", label: "PID", title: "Process lifecycle milestones and timeline links" },
];

/** Build fiche preview data from parsed leveringsbon ingest JSON (items[]). */
function leveringsbonFicheFromParsedJson(parsed: unknown): LeveringsbonFicheData | null {
  if (!parsed || typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  const items = p.items;
  if (!Array.isArray(items)) return null;
  const lines: LeveringsbonFicheData["items"] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const desc = r.description;
    if (typeof desc !== "string" || !desc.trim()) continue;
    const line: LeveringsbonFicheData["items"][number] = { description: desc.trim() };
    if (typeof r.quantity === "number" && Number.isFinite(r.quantity)) {
      line.quantity = r.quantity;
    }
    if (typeof r.unit === "string") line.unit = r.unit;
    if (typeof r.lot === "string") line.lot = r.lot;
    lines.push(line);
  }
  if (lines.length === 0) return null;
  return {
    afleverbon: typeof p.afleverbon === "string" ? p.afleverbon : undefined,
    date: typeof p.date === "string" ? p.date : undefined,
    supplier: typeof p.supplier === "string" ? p.supplier : undefined,
    werfAddress: typeof p.werfAddress === "string" ? p.werfAddress : undefined,
    items: lines,
  };
}

function DeliveriesPageInner() {
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = useMemo(
    () => deliveriesTabFromQueryParam(searchParams.get("tab")),
    [searchParams]
  );

  const setActiveTab = useCallback(
    (id: DeliveriesTabId) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("tab", deliveriesTabQueryValue(id));
      const qs = q.toString();
      router.replace(`${pathname}?${qs}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /** Bestek table filter: absent sp/pr = hide those IFC buckets; sp=1 / pr=1 = show them (survives reload). */
  const hideSpatialTypes = searchParams.get("sp") !== "1";
  const hideMetaTypes = searchParams.get("pr") !== "1";
  const openSavedSpecificationFiche = deliveriesOpenSavedSpecificationFiche(searchParams);

  const onHideSpatialTypesChange = useCallback(
    (hide: boolean) => {
      const q = new URLSearchParams(searchParams.toString());
      if (hide) q.delete("sp");
      else q.set("sp", "1");
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const onHideMetaTypesChange = useCallback(
    (hide: boolean) => {
      const q = new URLSearchParams(searchParams.toString());
      if (hide) q.delete("pr");
      else q.set("pr", "1");
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [recordTimelineEvent, setRecordTimelineEvent] = useState(false);
  const [appendDeliveriesTurtle, setAppendDeliveriesTurtle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryIngestResponse | null>(null);

  const parsedState = useMemo(() => {
    try {
      return { ok: true as const, data: JSON.parse(jsonText) as unknown };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Invalid JSON",
      };
    }
  }, [jsonText]);

  const parseError = parsedState.ok ? null : parsedState.error;
  const parsedPreview = parsedState.ok ? parsedState.data : null;

  const itemCount = useMemo(() => {
    if (!parsedPreview || typeof parsedPreview !== "object" || parsedPreview === null)
      return null;
    const items = (parsedPreview as { items?: unknown }).items;
    return Array.isArray(items) ? items.length : null;
  }, [parsedPreview]);

  const ficheData = useMemo(() => leveringsbonFicheFromParsedJson(parsedPreview), [parsedPreview]);

  const runIngest = useCallback(async () => {
    setFetchError(null);
    setResult(null);
    if (parseError) {
      setFetchError("Fix JSON syntax before running ingest.");
      return;
    }
    setLoading(true);
    try {
      const base = JSON.parse(jsonText) as Record<string, unknown>;
      delete base.projectId;
      delete base.recordTimelineEvent;
      delete base.appendDeliveriesTurtle;
      const payload: Record<string, unknown> = {
        ...base,
        projectId,
        ...(recordTimelineEvent ? { recordTimelineEvent: true } : {}),
        ...(appendDeliveriesTurtle ? { appendDeliveriesTurtle: true } : {}),
      };
      const res = await fetch("/api/deliveries/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as DeliveryIngestResponse & {
        error?: string;
        details?: string;
      };
      if (!res.ok) {
        setFetchError(
          [data.error, data.details].filter(Boolean).join(": ") || res.statusText
        );
        return;
      }
      setResult(data);
      const p = data.persistence;
      const persisted =
        p &&
        (p.timeline !== undefined || p.deliveriesTtl !== undefined);
      showToast({
        type: "success",
        message: persisted
          ? "Ingest complete — written to data/"
          : "Ingest complete",
      });
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [
    jsonText,
    parseError,
    showToast,
    projectId,
    recordTimelineEvent,
    appendDeliveriesTurtle,
  ]);

  const copyTurtle = useCallback(async () => {
    if (!result?.turtle) return;
    try {
      await navigator.clipboard.writeText(result.turtle);
      showToast({ type: "success", message: "Turtle copied" });
    } catch {
      showToast({ type: "error", message: "Could not copy" });
    }
  }, [result?.turtle, showToast]);

  return (
    <div className={`${appContentWidthClass} box-border space-y-3 py-4`}>
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Deliveries
              </h1>
              <InfoDetails label="About deliveries importer">
                <p className="mb-2">
                  Match delivery-note lines to the material dictionary, confidence and MVP GWP, copy
                  Turtle. Same contract as{" "}
                  <code className="font-mono text-[12px]">POST /api/deliveries/ingest</code>. Optional
                  timeline entry and/or RDF append under{" "}
                  <code className="font-mono text-[12px]">data/&lt;projectId&gt;</code>.
                </p>
              </InfoDetails>
            </div>
          </div>
        <nav
          className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]"
          aria-label="Related pages"
        >
          <Link href="/pipeline" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Pipeline
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <Link href="/sources" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Sources
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <Link
            href={`/timeline?projectId=${encodeURIComponent(projectId)}`}
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Timeline
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <Link
            href={`/deliveries/match-materials?projectId=${encodeURIComponent(projectId)}`}
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Match materials
          </Link>
        </nav>
        </div>
      </header>

      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div
          role="tablist"
          aria-label="Deliveries sections"
          dir="ltr"
          className="flex flex-wrap gap-1 -mb-px"
        >
          {TAB_DEFS.map((t) => {
            const selected = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`deliveries-tab-${t.id}`}
                title={t.title}
                aria-selected={selected}
                aria-controls={`deliveries-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(t.id)}
                className={[
                  "shrink-0 rounded-t border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-zinc-950",
                  selected
                    ? "border-zinc-200 border-b-white bg-white text-zinc-900 dark:border-zinc-700 dark:border-b-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
                    : "border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id="deliveries-panel-ingest"
        aria-labelledby="deliveries-tab-ingest"
        hidden={activeTab !== "ingest"}
        className="space-y-4 pt-3"
      >
        <section aria-label="Leveringsbon ingest" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Leveringsbon
          </h2>
          <p className="max-w-3xl text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            {LEVERINGSBON_SUMMARY_LINE}
          </p>
          <div className="flex max-w-md flex-wrap items-center gap-2 rounded border border-zinc-200 bg-zinc-50/80 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900/30">
            <ProjectIdField value={projectId} onChange={setProjectId} label="Project" />
            <InfoDetails label="Persistence (data folder)">
              <p>
                No SQL server — state under <code className="font-mono">data/</code>. See{" "}
                <code className="font-mono text-[12px]">docs/deliveries-importer-integration.md</code>{" "}
                for external DB notes.
              </p>
            </InfoDetails>
            <div className="flex w-full flex-col gap-1.5 text-[13px] text-zinc-800 dark:text-zinc-200">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-zinc-300 dark:border-zinc-600"
                  checked={recordTimelineEvent}
                  onChange={(e) => setRecordTimelineEvent(e.target.checked)}
                />
                <span>Append timeline event</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-zinc-300 dark:border-zinc-600"
                  checked={appendDeliveriesTurtle}
                  onChange={(e) => setAppendDeliveriesTurtle(e.target.checked)}
                />
                <span>Append Turtle to deliveries TTL</span>
              </label>
            </div>
          </div>

          <CollapseSection title="Live preview (JSON)" defaultOpen={false}>
            <LeveringsbonFicheVisual data={ficheData} variant="compact" />
          </CollapseSection>

          <CollapseSection title="JSON" defaultOpen={false}>
            <label htmlFor="deliveries-json" className="sr-only">
              Leveringsbon JSON body
            </label>
            <textarea
              id="deliveries-json"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[160px] rounded border border-zinc-300 bg-white p-2 font-mono text-[13px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <div className="mt-2">
              <Button type="button" variant="outline" onClick={() => setJsonText(SAMPLE_JSON)}>
                Reset sample
              </Button>
            </div>
          </CollapseSection>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={loading || !!parseError}
              onClick={runIngest}
            >
              {loading ? "Running…" : "Run ingest"}
            </Button>
            {itemCount != null ? (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {itemCount} line{itemCount === 1 ? "" : "s"} in JSON
              </span>
            ) : null}
          </div>
          {parseError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              JSON: {parseError}
            </p>
          ) : null}
          {fetchError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {fetchError}
            </p>
          ) : null}
        </section>

        {result ? (
          <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800" id="deliveries-ingest-results">
              {result.persistence ? (
                <section className="rounded border border-emerald-200 bg-emerald-50/60 px-2 py-2 text-[13px] dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <h2 className="mb-1 font-semibold text-emerald-900 dark:text-emerald-200">
                    Saved
                  </h2>
                  <ul className="space-y-1 font-mono text-emerald-900/90 dark:text-emerald-200/90">
                    {result.persistence.timeline ? (
                      <li className="flex flex-wrap items-center gap-2">
                        <span>
                          {result.persistence.timeline.path} · {result.persistence.timeline.eventId}
                        </span>
                        <a
                          href={`/timeline?projectId=${encodeURIComponent(
                            result.persistence.projectId ?? projectId
                          )}`}
                          className="text-emerald-800 underline dark:text-emerald-300"
                          onClick={(e) => {
                            e.preventDefault();
                            window.location.assign(e.currentTarget.href);
                          }}
                        >
                          Timeline
                        </a>
                        <InfoDetails label="Why full page load for timeline">
                          <p>
                            Full navigation applies <code className="font-mono">?projectId=</code>{" "}
                            before the timeline fetches events.
                          </p>
                        </InfoDetails>
                      </li>
                    ) : null}
                    {result.persistence.deliveriesTtl ? (
                      <li>{result.persistence.deliveriesTtl.path}</li>
                    ) : null}
                  </ul>
                </section>
              ) : null}
              <section>
                <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Summary
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Total lines", result.summary.total],
                    ["Matched", result.summary.matched],
                    ["Unmatched", result.summary.unmatched],
                    ["Avg confidence", result.summary.avgConfidence],
                  ].map(([label, val]) => (
                    <div
                      key={String(label)}
                      className="rounded border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <p className="text-[13px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {label}
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {typeof val === "number" && label === "Avg confidence"
                          ? val.toFixed(2)
                          : val}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <CollapseSection title="Line by line" defaultOpen>
                <ul className="space-y-2">
                  {result.matches.map((m, i) => (
                    <li
                      key={`${m.description}-${i}`}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/30 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-200/80 dark:border-zinc-800">
                        <span className="text-[13px] font-mono text-zinc-500">#{i + 1}</span>
                        {m.match ? (
                          <span className="text-[13px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                            Matched
                          </span>
                        ) : (
                          <span className="text-[13px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            Unmatched
                          </span>
                        )}
                        {m.match ? (
                          <span className="text-base text-zinc-600 dark:text-zinc-400 ml-auto tabular-nums">
                            {(m.match.confidence * 100).toFixed(0)}% confidence
                          </span>
                        ) : null}
                      </div>
                      <div className="px-3 py-2 space-y-2 text-base">
                        <div>
                          <span className="text-zinc-500 dark:text-zinc-500">Raw: </span>
                          <span className="text-zinc-900 dark:text-zinc-100">{m.description}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 dark:text-zinc-500">Normalized: </span>
                          <code className="font-mono text-emerald-800 dark:text-emerald-300">
                            {m.normalized || "—"}
                          </code>
                        </div>
                        {m.match ? (
                          <div className="grid gap-1 sm:grid-cols-2 pt-1 border-t border-zinc-200 dark:border-zinc-800 mt-2">
                            <div>
                              <span className="text-zinc-500">EPD id: </span>
                              <code className="font-mono text-zinc-800 dark:text-zinc-200">
                                {m.match.epdId}
                              </code>
                            </div>
                            <div>
                              <span className="text-zinc-500">Product: </span>
                              {m.match.productName}
                            </div>
                            <div>
                              <span className="text-zinc-500">GWP (kg CO₂e / t): </span>
                              {m.match.gwpKgCo2ePerTonne != null
                                ? m.match.gwpKgCo2ePerTonne
                                : "—"}
                            </div>
                            <div>
                              <span className="text-zinc-500">Source: </span>
                              {m.match.source}
                            </div>
                            <div className="sm:col-span-2 pt-1">
                              <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all"
                                  style={{
                                    width: `${Math.min(100, m.match.confidence * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CollapseSection>

              <CollapseSection title="Turtle (RDF)" defaultOpen>
                <div className="mb-1 flex justify-end">
                  <Button type="button" variant="secondary" onClick={copyTurtle}>
                    Copy
                  </Button>
                </div>
                <pre className="max-h-[min(320px,45vh)] overflow-auto rounded border border-zinc-200 bg-zinc-950 p-2 font-mono text-[13px] leading-snug text-zinc-100 dark:border-zinc-800">
                  {result.turtle}
                </pre>
              </CollapseSection>
            </div>
        ) : (
          <p className="border-t border-dashed border-zinc-200 pt-3 text-[13px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Run ingest for matches &amp; Turtle.
          </p>
        )}

        <CollapseSection title="Reference · sample fiche, files & docs" defaultOpen={false}>
          <p className="mb-2 text-[13px] text-zinc-500 dark:text-zinc-400">
            Paper-style fiche preview (full layout). Edit the payload in the collapsible{" "}
            <strong className="font-medium text-zinc-600 dark:text-zinc-300">JSON</strong> section
            above.
          </p>
          <LeveringsbonFicheVisual data={ficheData} variant="full" />
          <div className="mt-3 space-y-2">
            <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400">Technical files</p>
            <TechnicalFilesPanel />
            <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400">Documentation</p>
            <DeepDocumentationPanel />
          </div>
        </CollapseSection>
      </div>

      <div
        role="tabpanel"
        id="deliveries-panel-specification"
        aria-labelledby="deliveries-tab-specification"
        hidden={activeTab !== "specification"}
        className="pt-2"
      >
        <DeliveriesBestekPanel
          projectId={projectId}
          setProjectId={setProjectId}
          initialOpenSavedSpecificationFiche={openSavedSpecificationFiche}
          hideSpatialTypes={hideSpatialTypes}
          hideMetaTypes={hideMetaTypes}
          onHideSpatialTypesChange={onHideSpatialTypesChange}
          onHideMetaTypesChange={onHideMetaTypesChange}
        />
      </div>

      <div
        role="tabpanel"
        id="deliveries-panel-pid"
        aria-labelledby="deliveries-tab-pid"
        hidden={activeTab !== "pid"}
        className="pt-2"
      >
        <DeliveriesPidPanel projectId={projectId} />
      </div>
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense
      fallback={
        <div className={`${appContentWidthClass} box-border py-10 text-base text-zinc-500 dark:text-zinc-400`}>
          Loading…
        </div>
      }
    >
      <DeliveriesPageInner />
    </Suspense>
  );
}
