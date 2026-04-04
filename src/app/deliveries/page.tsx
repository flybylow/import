"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import LeveringsbonFicheVisual, {
  type LeveringsbonFicheData,
} from "@/components/LeveringsbonFicheVisual";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
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

const FLOW_STEPS = [
  {
    id: "parse",
    title: "Parse leveringsbon",
    detail:
      "Valid JSON with an items array. Each line needs a description (Belgian supplier text).",
  },
  {
    id: "normalize",
    title: "Normalize descriptions",
    detail:
      "Same rules as IFC material matching: NFKD, lowercase, NL/BE tokens mapped to English match tokens (see material-norm).",
  },
  {
    id: "match",
    title: "Dictionary match",
    detail:
      "Substring match against matchPatterns in src/data/material-dictionary.json (first hit wins).",
  },
  {
    id: "gwp",
    title: "GWP (MVP)",
    detail:
      "Optional gwpKgCo2ePerTonne on dictionary rows until Phase 2 hydrates from KB / sources.",
  },
  {
    id: "turtle",
    title: "Turtle output",
    detail:
      "dpp: delivery note + lines; bim:epd-* IRIs for matched slugs. Ready for graph ingest.",
  },
] as const;

const TECH_FILES = [
  { path: "src/lib/deliveries-importer.ts", label: "Core ingest + Turtle" },
  { path: "src/app/api/deliveries/ingest/route.ts", label: "POST API" },
  { path: "src/data/material-dictionary.json", label: "Patterns + MVP GWP" },
  { path: "src/lib/material-norm.ts", label: "Normalization" },
];

function StepRail() {
  return (
    <ol className="relative space-y-0 border-l border-zinc-200 dark:border-zinc-700 ml-3">
      {FLOW_STEPS.map((step, i) => (
        <li key={step.id} className="mb-8 ml-6 last:mb-0">
          <span
            className="absolute flex items-center justify-center w-6 h-6 rounded-full -left-3 ring-4 ring-white dark:ring-zinc-950 bg-emerald-700 dark:bg-emerald-600 text-[10px] font-bold text-white"
            aria-hidden
          >
            {i + 1}
          </span>
          <div className="pl-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {step.title}
            </h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {step.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TechnicalFilesPanel() {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Technical files
      </h3>
      <ul className="mt-2 space-y-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-300">
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
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Deeper documentation (repo)
      </h3>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        Open in your editor or Git host; paths are relative to the project root.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {DEEP_DOCS.map((d) => (
          <li key={d.path} className="leading-snug">
            <span className="text-zinc-700 dark:text-zinc-300">{d.label}</span>
            <br />
            <code className="text-[11px] font-mono text-emerald-800 dark:text-emerald-400">
              {d.path}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

type DeliveriesTabId = "flow" | "ingest";

const TAB_DEFS: { id: DeliveriesTabId; label: string }[] = [
  { id: "flow", label: "What happens (in order)" },
  { id: "ingest", label: "Ingest" },
];

function leveringsbonFicheFromParsed(parsed: unknown): LeveringsbonFicheData | null {
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

export default function DeliveriesPage() {
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const [activeTab, setActiveTab] = useState<DeliveriesTabId>("flow");
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

  const ficheData = useMemo(
    () => leveringsbonFicheFromParsed(parsedPreview),
    [parsedPreview]
  );

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
      setActiveTab("ingest");
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
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Beyond IFC — leveringsbon intake
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mt-1">
          Deliveries importer
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
          Match delivery-note lines to the material dictionary, see confidence and MVP GWP, and
          copy Turtle. Same contract as{" "}
          <code className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
            POST /api/deliveries/ingest
          </code>
          . On the Ingest tab you can append a{" "}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">timeline</strong> entry
          and/or RDF under{" "}
          <code className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
            data/&lt;projectId&gt;
          </code>
          .
        </p>
        <nav
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          aria-label="Related pages"
        >
          <Link
            href="/pipeline"
            className="text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Pipeline journey
          </Link>
          <Link
            href="/sources"
            className="text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Sources
          </Link>
          <Link
            href={`/timeline?projectId=${encodeURIComponent(projectId)}`}
            className="text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Timeline
          </Link>
        </nav>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div
          role="tablist"
          aria-label="Deliveries sections"
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
                aria-selected={selected}
                aria-controls={`deliveries-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(t.id)}
                className={[
                  "shrink-0 rounded-t-md border px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950",
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
        id="deliveries-panel-flow"
        aria-labelledby="deliveries-tab-flow"
        hidden={activeTab !== "flow"}
        className="pt-8 space-y-8"
      >
        <section className="max-w-2xl space-y-3" aria-labelledby="deliveries-fiche-heading">
          <div>
            <h2
              id="deliveries-fiche-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Voorbeeldfiche (Wienerberger-stijl)
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Zo ziet de bron er ongeveer uit op papier: leveringsbon met werfadres en
              artikelregels. De JSON in het tabblad Ingest is de digitale versie hiervan.
            </p>
          </div>
          <LeveringsbonFicheVisual data={ficheData} variant="full" />
        </section>
        <div className="max-w-2xl">
          <StepRail />
        </div>
        <div className="max-w-2xl">
          <TechnicalFilesPanel />
        </div>
        <div className="max-w-2xl">
          <DeepDocumentationPanel />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
          <button
            type="button"
            onClick={() => setActiveTab("ingest")}
            className="font-medium text-emerald-700 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300"
          >
            Open the Ingest tab
          </button>{" "}
          to paste JSON, run the request, and view matches plus Turtle.
        </p>
      </div>

      <div
        role="tabpanel"
        id="deliveries-panel-ingest"
        aria-labelledby="deliveries-tab-ingest"
        hidden={activeTab !== "ingest"}
        className="pt-8 space-y-6"
      >
        <div className="max-w-md space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/30 px-4 py-3">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Project persistence (file “database”)
          </p>
          <ProjectIdField value={projectId} onChange={setProjectId} />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            This app has no SQL server: project state lives under{" "}
            <code className="font-mono">data/</code>. See{" "}
            <code className="font-mono text-[10px]">docs/deliveries-importer-integration.md</code>{" "}
            for wiring to an external DB.
          </p>
          <div className="flex flex-col gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 rounded border-zinc-300 dark:border-zinc-600"
                checked={recordTimelineEvent}
                onChange={(e) => setRecordTimelineEvent(e.target.checked)}
              />
              <span>
                Append <strong>timeline</strong> event{" "}
                <code className="text-[11px] font-mono">delivery_document_added</code> to{" "}
                <code className="text-[11px] font-mono">data/&lt;projectId&gt;-timeline.ttl</code>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 rounded border-zinc-300 dark:border-zinc-600"
                checked={appendDeliveriesTurtle}
                onChange={(e) => setAppendDeliveriesTurtle(e.target.checked)}
              />
              <span>
                <strong>Append</strong> response Turtle to{" "}
                <code className="text-[11px] font-mono">data/&lt;projectId&gt;-deliveries.ttl</code>
              </span>
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Live voorbeeld — volgt je JSON
          </p>
          <LeveringsbonFicheVisual data={ficheData} variant="compact" />
        </div>
        <div>
          <label
            htmlFor="deliveries-json"
            className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2"
          >
            Leveringsbon JSON
          </label>
          <textarea
            id="deliveries-json"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            className="w-full min-h-[220px] rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono text-xs p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={loading || !!parseError}
              onClick={runIngest}
            >
              {loading ? "Running…" : "Run ingest"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setJsonText(SAMPLE_JSON)}
            >
              Reset sample
            </Button>
            {itemCount != null ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {itemCount} line{itemCount === 1 ? "" : "s"} in JSON
              </span>
            ) : null}
          </div>
          {parseError ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              JSON: {parseError}
            </p>
          ) : null}
          {fetchError ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {fetchError}
            </p>
          ) : null}
        </div>

        {result ? (
          <div className="space-y-8 border-t border-zinc-200 dark:border-zinc-800 pt-8">
              {result.persistence ? (
                <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 mb-2">
                    Persisted to disk
                  </h2>
                  <ul className="text-xs text-emerald-900/90 dark:text-emerald-200/90 space-y-1 font-mono">
                    {result.persistence.timeline ? (
                      <li>
                        Timeline: {result.persistence.timeline.path} (eventId{" "}
                        {result.persistence.timeline.eventId})
                        <br />
                        <a
                          href={`/timeline?projectId=${encodeURIComponent(
                            result.persistence.projectId ?? projectId
                          )}`}
                          className="inline-block mt-1 text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-100"
                          onClick={(e) => {
                            e.preventDefault();
                            window.location.assign(e.currentTarget.href);
                          }}
                        >
                          Open timeline for this project
                        </a>
                        <span className="mt-1 block text-[10px] font-normal text-emerald-800/80 dark:text-emerald-200/70">
                          Full page load so <code className="rounded bg-emerald-100/80 px-0.5 dark:bg-emerald-900/50">?projectId=</code> is applied before the timeline fetches events.
                        </span>
                      </li>
                    ) : null}
                    {result.persistence.deliveriesTtl ? (
                      <li>Turtle append: {result.persistence.deliveriesTtl.path}</li>
                    ) : null}
                  </ul>
                </section>
              ) : null}
              <section>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                  Summary
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Total lines", result.summary.total],
                    ["Matched", result.summary.matched],
                    ["Unmatched", result.summary.unmatched],
                    ["Avg confidence", result.summary.avgConfidence],
                  ].map(([label, val]) => (
                    <div
                      key={String(label)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {label}
                      </p>
                      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums">
                        {typeof val === "number" && label === "Avg confidence"
                          ? val.toFixed(2)
                          : val}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                  Line by line
                </h2>
                <ul className="space-y-3">
                  {result.matches.map((m, i) => (
                    <li
                      key={`${m.description}-${i}`}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/30 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-200/80 dark:border-zinc-800">
                        <span className="text-[10px] font-mono text-zinc-500">#{i + 1}</span>
                        {m.match ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                            Matched
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            Unmatched
                          </span>
                        )}
                        {m.match ? (
                          <span className="text-xs text-zinc-600 dark:text-zinc-400 ml-auto tabular-nums">
                            {(m.match.confidence * 100).toFixed(0)}% confidence
                          </span>
                        ) : null}
                      </div>
                      <div className="px-3 py-2 space-y-2 text-xs">
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
              </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Turtle (RDF)
                  </h2>
                  <Button type="button" variant="secondary" onClick={copyTurtle}>
                    Copy Turtle
                  </Button>
                </div>
                <pre className="max-h-[min(420px,50vh)] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 font-mono text-[11px] p-3 leading-relaxed">
                  {result.turtle}
                </pre>
              </section>
            </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 border-t border-dashed border-zinc-200 dark:border-zinc-800 pt-6">
            Run ingest to see normalization, matches, summary, and Turtle here.
          </p>
        )}
      </div>
    </div>
  );
}
