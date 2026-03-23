"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import KbGraphWithInspector from "@/components/KbGraphWithInspector";

type KnowledgeBaseResponse = {
  projectId: string;
  kbPath: string;
  ttl: string;
  elementCount?: number;
  diff?: {
    addedCount: number;
    removedCount: number;
    addedPreview: string[];
    removedPreview: string[];
  };
  epdCoverage?: {
    materialsTotal: number;
    materialsWithEPD: number;
    materialsWithoutEPD: number;
    matchedPreview: number[];
    unmatchedPreview: number[];
  };
  epdCatalog?: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  matchingPreview?: {
    matched: Array<{
      materialId: number;
      materialName: string;
      matchType?: string;
      matchConfidence?: number;
      epdSlug: string;
      epdName: string;
    }>;
    unmatched: Array<{
      materialId: number;
      materialName: string;
    }>;
  };
};

type KBGraph = {
  materials: Array<{
    materialId: number;
    materialName: string;
    hasEPD: boolean;
    epdSlug?: string;
    matchType?: string;
    matchConfidence?: number;
  }>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
};

export default function KnowledgeBasePage() {
  const [projectId, setProjectId] = useState<string>("example");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrichedPreview, setEnrichedPreview] = useState<string[] | null>(null);
  const [kbResult, setKbResult] = useState<KnowledgeBaseResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [manualSelections, setManualSelections] = useState<
    Record<number, string>
  >({});
  const [manualSaving, setManualSaving] = useState<boolean>(false);
  const [kbGraph, setKbGraph] = useState<KBGraph | null>(null);
  const [kbGraphLoading, setKbGraphLoading] = useState<boolean>(false);

  const autoBuildStartedRef = useRef(false);

  const previewEnriched = useMemo(() => {
    if (!enrichedPreview) return [];
    return enrichedPreview;
  }, [enrichedPreview]);

  useEffect(() => {
    // Allow deep-linking from the Phase 2 pipeline.
    // Use `window.location.search` instead of `useSearchParams` to avoid
    // Next.js pre-rendering/Suspense constraints for this page.
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("projectId");
    const autoBuild = params.get("autoBuild");

    if (pid && pid !== projectId) {
      setProjectId(pid);
      return;
    }

    if (!autoBuild) return;
    if (autoBuild === "0" || autoBuild === "false") return;
    if (autoBuildStartedRef.current) return;
    if (!projectId) return;

    autoBuildStartedRef.current = true;
    runBuildKb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    // Load the last enriched TTL so the user can see what's being translated.
    let cancelled = false;
    setEnrichedPreview(null);
    setKbResult(null);
    setDownloadUrl(null);

    (async () => {
      try {
        const res = await fetch(`/api/enriched?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const json: { ttl: string } = await res.json();
        const firstLines = json.ttl.split(/\r?\n/).slice(0, 60).filter(Boolean);
        if (!cancelled) setEnrichedPreview(firstLines);
      } catch {
        // Ignore preview load errors; the KB build button will still work.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const runBuildKb = async () => {
    setError(null);
    setKbResult(null);
    setDownloadUrl(null);
    setKbGraph(null);
    setLoading(true);
    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "POST /api/kb failed");
      }

      const json: KnowledgeBaseResponse = await res.json();
      setKbResult(json);

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      // Fetch the full graph for visualization.
      setKbGraphLoading(true);
      try {
        const statusRes = await fetch(
          `/api/kb/status?projectId=${encodeURIComponent(projectId)}`
        );
        if (statusRes.ok) {
          const statusJson: any = await statusRes.json();
          setKbGraph(statusJson.kbGraph ?? null);
        }
      } finally {
        setKbGraphLoading(false);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const refreshKbGraph = async () => {
    setKbGraphLoading(true);
    try {
      const statusRes = await fetch(
        `/api/kb/status?projectId=${encodeURIComponent(projectId)}`
      );
      if (!statusRes.ok) return;
      const statusJson: any = await statusRes.json();
      setKbGraph(statusJson.kbGraph ?? null);
    } catch {
      // ignore
    } finally {
      setKbGraphLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Phase 2 - Link</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        Load the last enriched graph and build link matches from materials to available
        EPD data (MVP dictionary matcher for now).
      </p>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium">Build Link Graph</h2>

        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm text-zinc-700 dark:text-zinc-200">projectId</label>
          <input
            className="border border-zinc-200 dark:border-zinc-800 rounded px-3 py-1 text-sm bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </div>

        <button
          className="mt-4 inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
          disabled={loading}
          onClick={runBuildKb}
        >
          {loading ? "Building..." : "Build KB (from enriched)"}
        </button>

        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium">Last Enriched Preview</h2>
        <pre className="mt-2 p-3 text-xs leading-5 font-mono max-h-[35vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
          {previewEnriched?.join("\n") ?? "—"}
        </pre>
      </div>

      {kbResult ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            KB written to:{" "}
            <code className="font-mono">{kbResult.kbPath}</code>
          </p>

          {downloadUrl ? (
            <a
              className="mt-2 inline-block text-sm font-medium underline"
              href={downloadUrl}
              download={kbResult.kbPath.split("/").pop() ?? `${projectId}-kb.ttl`}
            >
              Download KB TTL
            </a>
          ) : null}

          {kbResult.epdCoverage ? (
            <div className="mt-4 p-3 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">EPD coverage</p>
              <div className="mt-1 text-xs space-y-1 text-zinc-700 dark:text-zinc-200">
                <div>
                  Elements in enriched graph:{" "}
                  <code className="font-mono">
                    {kbResult.elementCount ?? "—"}
                  </code>
                </div>
                <div>
                  Materials with EPD:{" "}
                  <code className="font-mono">
                    {kbResult.epdCoverage.materialsWithEPD}/{kbResult.epdCoverage.materialsTotal}
                  </code>
                </div>
                <div>
                  Materials without EPD:{" "}
                  <code className="font-mono">
                    {kbResult.epdCoverage.materialsWithoutEPD}/{kbResult.epdCoverage.materialsTotal}
                  </code>
                </div>
              </div>
            </div>
          ) : null}

          {kbResult.matchingPreview ? (
            <div className="mt-4 p-3 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">What matches what (top preview)</p>

              <div className="mt-2">
                <details open>
                  <summary className="cursor-pointer text-xs text-zinc-700 dark:text-zinc-200">
                    Matched materials (have EPD)
                  </summary>
                  <div className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-200">
                    {kbResult.matchingPreview.matched.length ? (
                      kbResult.matchingPreview.matched.map((m) => (
                        <div key={`m-${m.materialId}`}>
                          <span className="font-mono">{m.materialId}</span>: {m.materialName} →
                          <span className="font-mono"> {m.epdSlug}</span>: {m.epdName}
                          {typeof m.matchConfidence === "number" ? (
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {" "}
                              (conf: {m.matchConfidence.toFixed(2)}{m.matchType ? `, ${m.matchType}` : ""})
                            </span>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div>—</div>
                    )}
                  </div>
                </details>
              </div>

              <div className="mt-2">
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-700 dark:text-zinc-200">
                    Unmatched materials (no EPD)
                  </summary>
                  <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-200 space-y-2">
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Manual matches are applied to <code className="font-mono">data/{projectId}-kb.ttl</code>.
                      Rebuilding the KB will overwrite them (MVP).
                    </div>
                    {kbResult.epdCatalog && kbResult.matchingPreview.unmatched.length ? (
                      kbResult.matchingPreview.unmatched.map((m) => {
                        const selected =
                          manualSelections[m.materialId] ??
                          kbResult.epdCatalog?.[0]?.epdSlug ??
                          "";
                        return (
                          <div
                            key={`u-${m.materialId}`}
                            className="flex flex-col gap-1 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-2"
                          >
                            <div>
                              <span className="font-mono">{m.materialId}</span>: {m.materialName}
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                className="border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex-1"
                                value={selected}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setManualSelections((prev) => ({
                                    ...prev,
                                    [m.materialId]: v,
                                  }));
                                }}
                              >
                                {(kbResult.epdCatalog ?? []).map((epd) => (
                                  <option key={epd.epdSlug} value={epd.epdSlug}>
                                    {epd.epdSlug}: {epd.epdName}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={manualSaving || loading || !selected}
                                className="text-xs font-medium underline disabled:opacity-60"
                                onClick={async () => {
                                  try {
                                    setManualSaving(true);
                                    const res = await fetch(
                                      "/api/kb/override",
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          projectId,
                                          overrides: [
                                            {
                                              materialId: m.materialId,
                                              epdSlug: selected,
                                            },
                                          ],
                                        }),
                                      }
                                    );
                                    if (!res.ok) {
                                      const msg = await res.text();
                                      throw new Error(
                                        msg || "POST /api/kb/override failed"
                                      );
                                    }
                                    const json: KnowledgeBaseResponse =
                                      await res.json();
                                    setKbResult(json);

                                    const blob = new Blob([json.ttl], {
                                      type: "text/turtle",
                                    });
                                    const url = URL.createObjectURL(blob);
                                    setDownloadUrl(url);
                                    // Refresh graph so the visualization reflects manual overrides.
                                    await refreshKbGraph();
                                  } catch (e: any) {
                                    setError(e?.message ?? String(e));
                                  } finally {
                                    setManualSaving(false);
                                  }
                                }}
                              >
                                Apply manual match
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div>—</div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          ) : null}

          {kbGraph ? (
            <div className="mt-4 p-3 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                Knowledge graph (full KB nodes)
              </div>
              {kbGraphLoading ? (
                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  Loading graph...
                </div>
              ) : (
                <div className="mt-2">
                  <KbGraphWithInspector kbGraph={kbGraph} />
                </div>
              )}
            </div>
          ) : null}

          <details className="mt-4" open>
            <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
              KB diff (semantic triple-level)
            </summary>
            <pre className="mt-2 p-3 text-xs leading-5 font-mono max-h-[30vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
              {`Added triples: ${kbResult.diff?.addedCount ?? 0}\nRemoved triples: ${
                kbResult.diff?.removedCount ?? 0
              }\n\nAdded preview:\n${(kbResult.diff?.addedPreview ?? []).slice(0, 40).join("\n") || "—"}\n\nRemoved preview:\n${(kbResult.diff?.removedPreview ?? []).slice(0, 40).join("\n") || "—"}`}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

