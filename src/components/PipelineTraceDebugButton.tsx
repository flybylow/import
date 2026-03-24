"use client";

import { useCallback, useState } from "react";

import { dbg, dbgButton, dbgLoad } from "@/lib/client-pipeline-debug";

export type PipelineTracePayload = {
  projectId: string;
  generatedAt: string;
  phases: Array<{
    id: string;
    title: string;
    description: string;
    files: Array<{
      label: string;
      relativePath: string;
      exists: boolean;
      byteSize?: number;
      mtimeIso?: string;
    }>;
  }>;
  dictionary: {
    path: string;
    exists: boolean;
    version?: string;
    byteSize?: number;
    mtimeIso?: string;
  };
  configJson: { path: string; exists: boolean; byteSize?: number; mtimeIso?: string };
  sources: Array<{
    id: string;
    type: string;
    ttlPath: string;
    enabled: boolean;
    exists: boolean;
    byteSize?: number;
    mtimeIso?: string;
  }>;
  hints: string[];
  summary: {
    hasParsedTtl: boolean;
    hasEnrichedTtl: boolean;
    hasKbTtl: boolean;
    dictionaryVersion: string | null;
  };
};

type Props = {
  projectId: string;
  /** Smaller label when embedded on dense toolbars */
  compact?: boolean;
  compactLabel?: string;
  className?: string;
};

export default function PipelineTraceDebugButton({
  projectId,
  compact,
  compactLabel,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<PipelineTracePayload | null>(null);

  const run = useCallback(async () => {
    const id = projectId.trim();
    dbgButton("PipelineTrace", "open pipeline trace modal / fetch", { projectId: id || "(empty)" });
    if (!id) {
      setError("Set a project id first.");
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    setOpen(true);
    dbgLoad("PipelineTrace", "start", "GET /api/pipeline/trace", { projectId: id });
    try {
      const res = await fetch(
        `/api/pipeline/trace?projectId=${encodeURIComponent(id)}`
      );
      const json = (await res.json()) as PipelineTracePayload & { error?: string };
      if (!res.ok) {
        dbgLoad("PipelineTrace", "error", "GET /api/pipeline/trace", {
          status: res.status,
          error: json.error,
        });
        setTrace(null);
        setError(json.error ?? res.statusText);
        return;
      }
      dbgLoad("PipelineTrace", "ok", "GET /api/pipeline/trace", {
        generatedAt: json.generatedAt,
        hints: json.hints?.length ?? 0,
        phases: json.phases?.length,
      });
      dbg("PipelineTrace", "full trace payload", json);
      setTrace(json as PipelineTracePayload);
    } catch (e) {
      dbgLoad("PipelineTrace", "error", "GET /api/pipeline/trace", {
        message: e instanceof Error ? e.message : String(e),
      });
      setTrace(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const copyJson = useCallback(() => {
    if (!trace) return;
    dbgButton("PipelineTrace", "copy trace JSON to clipboard", {});
    void navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
  }, [trace]);

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        className={`rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${className}`}
        title="Show what exists on disk per phase, sources, dictionary — for tracing the pipeline"
        suppressHydrationWarning
      >
        {compact ? compactLabel ?? "Debug trace" : "Pipeline debug trace"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal
          aria-labelledby="pipeline-trace-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              dbg("PipelineTrace", "close modal (backdrop)");
              setOpen(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              dbg("PipelineTrace", "close modal (Escape)");
              setOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
              <h2
                id="pipeline-trace-title"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Pipeline trace — <span className="font-mono">{projectId || "—"}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyJson}
                  disabled={!trace}
                  className="text-xs rounded px-2 py-1 border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dbgButton("PipelineTrace", "close modal", {});
                    setOpen(false);
                  }}
                  className="text-xs rounded px-2 py-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 text-xs">
              {loading ? (
                <p className="text-zinc-500">Loading trace…</p>
              ) : error ? (
                <p className="text-red-600 dark:text-red-400">{error}</p>
              ) : trace ? (
                <div className="space-y-3">
                  {trace.hints.length ? (
                    <div className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/40 px-2 py-2 text-amber-900 dark:text-amber-100">
                      <div className="font-medium mb-1">Hints</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {trace.hints.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="grid gap-2 text-zinc-700 dark:text-zinc-300">
                    <div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        Summary
                      </span>
                      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                        <dt>parsed .ttl</dt>
                        <dd>{trace.summary.hasParsedTtl ? "yes" : "no"}</dd>
                        <dt>enriched</dt>
                        <dd>{trace.summary.hasEnrichedTtl ? "yes" : "no"}</dd>
                        <dt>KB</dt>
                        <dd>{trace.summary.hasKbTtl ? "yes" : "no"}</dd>
                        <dt>dictionary</dt>
                        <dd>{trace.summary.dictionaryVersion ?? "—"}</dd>
                      </dl>
                    </div>
                    {trace.phases.map((ph) => (
                      <div
                        key={ph.id}
                        className="rounded border border-zinc-200 dark:border-zinc-800 p-2"
                      >
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {ph.title}
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 mb-2">
                          {ph.description}
                        </p>
                        <ul className="space-y-1 font-mono text-[11px]">
                          {ph.files.map((f) => (
                            <li key={f.relativePath} className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <span
                                className={
                                  f.exists
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-zinc-400"
                                }
                              >
                                {f.exists ? "●" : "○"}
                              </span>
                              <span className="text-zinc-800 dark:text-zinc-200">{f.label}</span>
                              <span className="text-zinc-500 break-all">{f.relativePath}</span>
                              {f.exists && f.byteSize != null ? (
                                <span className="text-zinc-500">
                                  {f.byteSize.toLocaleString()} B
                                  {f.mtimeIso ? ` · ${f.mtimeIso}` : ""}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div className="rounded border border-zinc-200 dark:border-zinc-800 p-2">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        Side inputs
                      </div>
                      <ul className="mt-1 space-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        <li>{dictionaryLine(trace.dictionary)}</li>
                        <li>
                          config.json:{" "}
                          {trace.configJson.exists
                            ? `${trace.configJson.byteSize?.toLocaleString()} B · ${trace.configJson.mtimeIso}`
                            : "missing"}
                        </li>
                      </ul>
                      <div className="mt-2 font-medium text-zinc-800 dark:text-zinc-200">
                        Sources (config order)
                      </div>
                      <ul className="mt-1 space-y-1">
                        {trace.sources.map((s) => (
                          <li
                            key={s.id}
                            className="font-mono text-[11px] flex flex-wrap gap-x-2 text-zinc-600 dark:text-zinc-400"
                          >
                            <span className={s.enabled ? "" : "line-through opacity-70"}>
                              {s.id}
                            </span>
                            <span className="text-zinc-500">{s.type}</span>
                            <span className={s.exists ? "text-emerald-600" : "text-amber-600"}>
                              {s.exists ? "file ok" : "missing"}
                            </span>
                            <span className="break-all">{s.ttlPath}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-100 dark:bg-zinc-900 p-2 text-[10px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {JSON.stringify(trace, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-zinc-500">No data.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function dictionaryLine(d: PipelineTracePayload["dictionary"]) {
  if (!d.exists) {
    return (
      <>
        material-dictionary.json: <span className="text-amber-600">missing</span>
      </>
    );
  }
  return (
    <>
      material-dictionary.json: {d.version ?? "—"} · {d.byteSize?.toLocaleString()} B ·{" "}
      {d.mtimeIso}
    </>
  );
}
