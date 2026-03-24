"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EpdCatalogSelect } from "@/components/EpdCatalogSelect";
import type { UnmatchedMaterialRowKind } from "@/lib/material-unmatched-diagnostics";
import { unmatchedRowKindBadgeClass } from "@/lib/unmatched-row-kind-ui";
import KbGraphVisualization from "@/components/KbGraphVisualization";
import ToggleSection from "@/components/ToggleSection";
import { useToast } from "@/components/ToastProvider";
import { dbg, dbgButton, dbgLoad } from "@/lib/client-pipeline-debug";
import { useProjectId } from "@/lib/useProjectId";

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

type KnowledgeBaseResponse = {
  projectId: string;
  kbPath: string;
  ttl: string;
  /** Present after POST /api/kb — avoids a second GET /api/kb/status round-trip. */
  kbGraph?: KBGraph;
  elementCount?: number;
  buildMeta?: {
    kbBuiltAt: string;
    enrichedInput: {
      path: string;
      byteSize: number;
      mtimeIso: string;
    };
    materialDictionaryVersion: string | null;
    materialDictionaryMtimeIso: string;
  };
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
    sourceBreakdown?: Record<string, number>;
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
      rowKind?: UnmatchedMaterialRowKind;
      rowKindLabel?: string;
    }>;
  };
};

type SourceApiRow = {
  id: string;
  type: string;
  ttlPath: string;
  enabled: boolean;
  exists: boolean;
  report?: {
    rowCount?: number;
    generatedAt?: string;
    inputFile?: string;
    outputTtl?: string;
  } | null;
};

function sourceVersionLabel(ttlPath: string): string {
  const base = ttlPath.split("/").pop() ?? ttlPath;
  return base.replace(/\.ttl$/i, "");
}

function formatStableDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default function KnowledgeBasePage() {
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrichedPreview, setEnrichedPreview] = useState<string[] | null>(null);
  const [kbResult, setKbResult] = useState<KnowledgeBaseResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [manualSelections, setManualSelections] = useState<
    Record<number, string>
  >({});
  const [unmatchedSelected, setUnmatchedSelected] = useState<number[]>([]);
  const [bulkDefaultEpd, setBulkDefaultEpd] = useState<string>("");
  const [manualSaving, setManualSaving] = useState<boolean>(false);
  const [kbGraph, setKbGraph] = useState<KBGraph | null>(null);
  const [kbGraphLoading, setKbGraphLoading] = useState<boolean>(false);
  const [sourcesStatus, setSourcesStatus] = useState<SourceApiRow[] | null>(null);
  const [detailsReady, setDetailsReady] = useState(false);
  /** Deep-link from Sources (or bookmarks): `/kb?...&focusMaterialId=123` */
  const [focusMaterialId, setFocusMaterialId] = useState<number | null>(null);

  const autoBuildStartedRef = useRef(false);

  const previewEnriched = useMemo(() => {
    if (!enrichedPreview) return [];
    return enrichedPreview;
  }, [enrichedPreview]);

  const unmatchedRows = useMemo(
    () => kbResult?.matchingPreview?.unmatched ?? [],
    [kbResult?.matchingPreview?.unmatched]
  );
  const unmatchedTotal =
    kbResult?.epdCoverage?.materialsWithoutEPD ?? unmatchedRows.length;
  const defaultEpdSlug = kbResult?.epdCatalog?.[0]?.epdSlug ?? "";

  const unmatchedIdsKey = useMemo(
    () =>
      unmatchedRows
        .map((r) => r.materialId)
        .sort((a, b) => a - b)
        .join(","),
    [unmatchedRows]
  );

  useEffect(() => {
    const allowed = new Set(unmatchedRows.map((r) => r.materialId));
    setUnmatchedSelected((prev) => prev.filter((id) => allowed.has(id)));
  }, [unmatchedIdsKey, unmatchedRows]);
  const catalogSlugs = useMemo(
    () => kbResult?.epdCatalog?.map((e) => e.epdSlug) ?? [],
    [kbResult?.epdCatalog]
  );

  useEffect(() => {
    if (!kbResult?.epdCatalog?.length) return;
    setBulkDefaultEpd((prev) =>
      prev && catalogSlugs.includes(prev)
        ? prev
        : kbResult.epdCatalog![0].epdSlug
    );
  }, [kbResult?.epdCatalog, catalogSlugs]);

  useEffect(() => {
    queueMicrotask(() => setDetailsReady(true));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("focusMaterialId") ?? params.get("materialId");
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n)) setFocusMaterialId(n);
  }, []);

  useEffect(() => {
    if (focusMaterialId == null || !kbResult?.matchingPreview) return;
    if (!unmatchedRows.some((r) => r.materialId === focusMaterialId)) return;

    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`kb-unmatched-row-${focusMaterialId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add(
        "ring-2",
        "ring-amber-500/70",
        "ring-offset-2",
        "ring-offset-white",
        "dark:ring-offset-zinc-900"
      );
      window.setTimeout(() => {
        el.classList.remove(
          "ring-2",
          "ring-amber-500/70",
          "ring-offset-2",
          "ring-offset-white",
          "dark:ring-offset-zinc-900"
        );
      }, 2600);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusMaterialId, kbResult?.matchingPreview, unmatchedIdsKey, unmatchedRows]);

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
      dbgLoad("Phase2", "start", "GET /api/enriched (preview lines)", { projectId });
      try {
        const res = await fetch(`/api/enriched?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) {
          dbgLoad("Phase2", "error", "GET /api/enriched", { status: res.status });
          return;
        }
        const json: { ttl: string } = await res.json();
        const firstLines = json.ttl.split(/\r?\n/).slice(0, 60).filter(Boolean);
        dbgLoad("Phase2", "ok", "GET /api/enriched", {
          ttlBytes: json.ttl?.length ?? 0,
          previewLines: firstLines.length,
        });
        if (!cancelled) setEnrichedPreview(firstLines);
      } catch (e: any) {
        dbgLoad("Phase2", "error", "GET /api/enriched", { message: e?.message });
        // Ignore preview load errors; the KB build button will still work.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      dbgLoad("Phase2", "start", "GET /api/sources");
      try {
        const res = await fetch("/api/sources");
        if (!res.ok) {
          dbgLoad("Phase2", "error", "GET /api/sources", { status: res.status });
          return;
        }
        const json: { sources?: SourceApiRow[] } = await res.json();
        const list = json.sources ?? [];
        dbgLoad("Phase2", "ok", "GET /api/sources", {
          count: list.length,
          ids: list.map((s) => s.id),
        });
        if (!cancelled) setSourcesStatus(list);
      } catch (e: any) {
        dbgLoad("Phase2", "error", "GET /api/sources", { message: e?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runBuildKb = async () => {
    dbgButton("Phase2", "Build KB (from enriched)", { projectId });
    setError(null);
    setKbResult(null);
    setDownloadUrl(null);
    setKbGraph(null);
    setLoading(true);
    dbgLoad("Phase2", "start", "POST /api/kb", { projectId });
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
      dbgLoad("Phase2", "ok", "POST /api/kb", {
        kbPath: json.kbPath,
        ttlBytes: json.ttl?.length ?? 0,
        epdCoverage: json.epdCoverage,
        buildMeta: json.buildMeta,
      });
      setKbResult(json);

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      showToast({ type: "success", message: "Link graph built successfully." });

      if (json.kbGraph) {
        dbgLoad("Phase2", "ok", "GET /api/kb/status (skipped — kbGraph in POST body)", {
          projectId,
        });
        setKbGraph(json.kbGraph);
      } else {
        setKbGraphLoading(true);
        dbgLoad("Phase2", "start", "GET /api/kb/status (after build, for graph)", {
          projectId,
        });
        try {
          const statusRes = await fetch(
            `/api/kb/status?projectId=${encodeURIComponent(projectId)}`
          );
          if (statusRes.ok) {
            const statusJson: Record<string, unknown> = await statusRes.json();
            dbgLoad("Phase2", "ok", "GET /api/kb/status", {
              elementCount: statusJson.elementCount,
              materialsWithEPD: (statusJson.epdCoverage as { materialsWithEPD?: number } | undefined)
                ?.materialsWithEPD,
            });
            setKbGraph((statusJson.kbGraph as KBGraph | undefined) ?? null);
          } else {
            dbgLoad("Phase2", "error", "GET /api/kb/status", { status: statusRes.status });
          }
        } finally {
          setKbGraphLoading(false);
        }
      }
    } catch (e: any) {
      dbgLoad("Phase2", "error", "POST /api/kb", { message: e?.message });
      setError(e?.message ?? String(e));
      showToast({ type: "error", message: e?.message ?? "Failed to build link graph." });
    } finally {
      setLoading(false);
    }
  };

  const refreshKbGraph = async () => {
    dbgButton("Phase2", "refresh KB graph (implicit)", { projectId });
    setKbGraphLoading(true);
    dbgLoad("Phase2", "start", "GET /api/kb/status (refresh graph)", { projectId });
    try {
      const statusRes = await fetch(
        `/api/kb/status?projectId=${encodeURIComponent(projectId)}`
      );
      if (!statusRes.ok) {
        dbgLoad("Phase2", "error", "GET /api/kb/status", { status: statusRes.status });
        return;
      }
      const statusJson: any = await statusRes.json();
      dbgLoad("Phase2", "ok", "GET /api/kb/status", {
        elementCount: statusJson.elementCount,
      });
      setKbGraph(statusJson.kbGraph ?? null);
    } catch (e: any) {
      dbgLoad("Phase2", "error", "GET /api/kb/status", { message: e?.message });
    } finally {
      setKbGraphLoading(false);
    }
  };

  const fillSelectionWithBulkEpd = () => {
    dbgButton("Phase2", "fill selection with bulk EPD", {
      unmatchedSelected: unmatchedSelected.length,
      bulkDefaultEpd: bulkDefaultEpd || defaultEpdSlug,
    });
    if (!unmatchedSelected.length) return;
    const slug = bulkDefaultEpd || defaultEpdSlug;
    if (!slug) return;
    setManualSelections((prev) => {
      const next = { ...prev };
      for (const id of unmatchedSelected) {
        next[id] = slug;
      }
      return next;
    });
  };

  const applyBatchManualMatches = async () => {
    dbgButton("Phase2", "Apply manual batch matches", {
      selectedCount: unmatchedSelected.length,
    });
    if (!unmatchedSelected.length) {
      showToast({ type: "error", message: "Select at least one unmatched material." });
      return;
    }
    const fallback = bulkDefaultEpd || defaultEpdSlug;
    if (!fallback) {
      showToast({ type: "error", message: "No EPD catalog available." });
      return;
    }
    const overrides = unmatchedSelected.map((materialId) => ({
      materialId,
      epdSlug: manualSelections[materialId] || fallback,
    }));

    setManualSaving(true);
    setError(null);
    dbgLoad("Phase2", "start", "POST /api/kb/override", {
      projectId,
      overrideCount: overrides.length,
    });
    try {
      const res = await fetch("/api/kb/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, overrides }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "POST /api/kb/override failed");
      }
      const json: KnowledgeBaseResponse = await res.json();
      dbgLoad("Phase2", "ok", "POST /api/kb/override", {
        kbPath: json.kbPath,
        ttlBytes: json.ttl?.length ?? 0,
      });
      setKbResult(json);

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      await refreshKbGraph();
      showToast({
        type: "success",
        message: `Applied ${overrides.length} manual match(es).`,
      });
    } catch (e: any) {
      dbgLoad("Phase2", "error", "POST /api/kb/override", { message: e?.message });
      setError(e?.message ?? String(e));
      showToast({
        type: "error",
        message: e?.message ?? "Failed to apply manual matches.",
      });
    } finally {
      setManualSaving(false);
    }
  };

  const allUnmatchedIds = useMemo(
    () => unmatchedRows.map((r) => r.materialId),
    [unmatchedRows]
  );
  const allUnmatchedSelected =
    allUnmatchedIds.length > 0 &&
    unmatchedSelected.length === allUnmatchedIds.length;

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Phase 2 - Link</h1>
      {detailsReady ? (
        <details className="text-sm text-zinc-700 dark:text-zinc-200">
          <summary className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium underline">
            Read more
          </summary>
          <p className="mt-2">
            Load the last enriched graph and link materials to EPD nodes. Matching order:
            dictionary patterns first, then KBOB, then ICE (Educational), as configured in{" "}
            <code className="font-mono">config.json</code>.
          </p>
        </details>
      ) : (
        <p
          className="text-sm text-zinc-700 dark:text-zinc-200"
          suppressHydrationWarning
        />
      )}

      {sourcesStatus ? (
        <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 justify-between gap-y-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-medium text-zinc-800 dark:text-zinc-100 shrink-0">
                Sources
              </span>
              {sourcesStatus.map((s) => {
                const ok = s.enabled && s.exists;
                return (
                  <span
                    key={s.id}
                    title={sourceVersionLabel(s.ttlPath)}
                    className={
                      ok
                        ? "rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 px-2 py-1"
                        : "rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2 py-1"
                    }
                  >
                    {s.id}
                  </span>
                );
              })}
            </div>
            <Link
              href={`/sources?from=kb&projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex items-center gap-1.5 shrink-0 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Open full Sources page: import snapshots, enable/disable, reorder"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 text-zinc-600 dark:text-zinc-300"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M4.25 5.5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-1.5 0V7.56l-6.22 6.22a.75.75 0 1 1-1.06-1.06L11.94 6.5H5a.75.75 0 0 1-.75-.75Z"
                  clipRule="evenodd"
                />
              </svg>
              Open sources
            </Link>
          </div>
        </div>
      ) : null}

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium">Build Link Graph</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            projectId: <code className="font-mono">{projectId}</code>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
            disabled={loading}
            onClick={runBuildKb}
            suppressHydrationWarning
          >
            {loading ? "Linking materials..." : "Link materials to EPD"}
          </button>
          {kbResult ? (
            <Link
              href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex items-center justify-center rounded px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Materials linked to EPD - Phase 3
            </Link>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>

      {kbResult ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700 dark:text-zinc-200">
            <p>
            KB written to:{" "}
            <code className="font-mono">{kbResult.kbPath}</code>
            </p>

            {downloadUrl ? (
              <a
                className="text-sm font-medium underline"
                href={downloadUrl}
                download={kbResult.kbPath.split("/").pop() ?? `${projectId}-kb.ttl`}
              >
                Download KB TTL
              </a>
            ) : null}
          </div>

          {kbResult.epdCoverage ? (
            <div className="mt-4 p-3 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">EPD coverage</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Changes only after re-enrich or updated matching rules.
              </p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2 text-xs space-y-1 text-zinc-700 dark:text-zinc-200">
                  <div>
                    Elements in enriched graph:{" "}
                    <code className="font-mono">{kbResult.elementCount ?? "—"}</code>
                  </div>
                  <div>
                    Materials without EPD:{" "}
                    <code className="font-mono">
                      {kbResult.epdCoverage.materialsWithoutEPD}/{kbResult.epdCoverage.materialsTotal}
                    </code>
                  </div>
                  <div>
                    Materials with EPD:{" "}
                    <code className="font-mono">
                      {kbResult.epdCoverage.materialsWithEPD}/{kbResult.epdCoverage.materialsTotal}
                    </code>
                  </div>
                  <div>
                    Materials (total):{" "}
                    <code className="font-mono">{kbResult.epdCoverage.materialsTotal}</code>
                  </div>
                  {kbResult.epdCoverage.sourceBreakdown ? (
                    <div className="truncate">
                      Matched by source:{" "}
                      <code className="font-mono">
                        {Object.entries(kbResult.epdCoverage.sourceBreakdown)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => `${k} ${v}`)
                          .join(" · ") || "—"}
                      </code>
                    </div>
                  ) : null}
                </div>

                <div className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2 text-xs space-y-1 text-zinc-600 dark:text-zinc-400">
                  {kbResult.buildMeta ? (
                    <>
                      <div>
                        KB built:{" "}
                        <code className="font-mono text-[11px]">
                          {formatStableDateTime(kbResult.buildMeta.kbBuiltAt)}
                        </code>
                      </div>
                      <div>
                        Enriched file mtime:{" "}
                        <code className="font-mono text-[11px]">
                          {formatStableDateTime(kbResult.buildMeta.enrichedInput.mtimeIso)}
                        </code>{" "}
                        ({kbResult.buildMeta.enrichedInput.byteSize.toLocaleString()} bytes)
                      </div>
                      <div>
                        Dictionary:{" "}
                        <code className="font-mono text-[11px]">
                          {kbResult.buildMeta.materialDictionaryVersion ?? "—"}
                        </code>{" "}
                        (mtime{" "}
                        <code className="font-mono text-[11px]">
                          {formatStableDateTime(
                            kbResult.buildMeta.materialDictionaryMtimeIso
                          )}
                        </code>
                        )
                      </div>
                    </>
                  ) : (
                    <div>Build metadata unavailable.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {kbResult.matchingPreview ? (
            <div className="mt-4 p-3 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                What matches what (top preview)
              </p>

              <div className="mt-2">
                <ToggleSection
                  title="Matched materials (have EPD)"
                  summaryClassName="cursor-pointer text-xs text-zinc-700 dark:text-zinc-200"
                >
                  <div className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-200">
                    {kbResult.matchingPreview.matched.length ? (
                      kbResult.matchingPreview.matched.map((m) => (
                        <div
                          key={`m-${m.materialId}`}
                          className="rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-mono">{m.materialId}</span>
                            <span className="font-mono text-zinc-500 dark:text-zinc-400">
                              material-{m.materialId}
                            </span>
                            <span className="truncate">{m.materialName}</span>
                            <span aria-hidden>→</span>
                            <span className="font-mono">{m.epdSlug}</span>
                            <Link
                              href={`/sources?from=kb&projectId=${encodeURIComponent(
                                projectId
                              )}&materialId=${encodeURIComponent(
                                String(m.materialId)
                              )}&epdSlug=${encodeURIComponent(m.epdSlug)}`}
                              className="inline-flex items-center justify-center rounded border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                              aria-label={`Open sources editor (matching) for material ${m.materialId}`}
                              title="Update sources (KBOB/ICE snapshots & ordering)"
                            >
                              ↗
                            </Link>
                            <span className="truncate text-zinc-600 dark:text-zinc-300">
                              {m.epdName}
                            </span>
                          </div>
                          {typeof m.matchConfidence === "number" ? (
                            <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              conf: {m.matchConfidence.toFixed(2)}
                              {m.matchType ? ` · ${m.matchType}` : ""}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div>—</div>
                    )}
                  </div>
                </ToggleSection>
              </div>
            </div>
          ) : null}

          {kbResult?.matchingPreview ? (
            <div
              id="kb-unmatched-section"
              className="mt-4 p-3 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
            >
              <ToggleSection
                key={
                  focusMaterialId != null
                    ? `unmatched-open-${focusMaterialId}`
                    : "unmatched-default"
                }
                defaultOpen={focusMaterialId != null}
                title={
                  <>
                    Unmatched materials (no EPD)
                    <span className="ml-2 font-normal text-zinc-600 dark:text-zinc-300">
                      — {unmatchedTotal} total
                    </span>
                    {unmatchedSelected.length ? (
                      <span className="ml-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {unmatchedSelected.length} selected
                      </span>
                    ) : null}
                  </>
                }
                summaryClassName="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              >
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Manual matches write to{" "}
                  <code className="font-mono">data/{projectId}-kb.ttl</code>. Rebuilding the KB
                  overwrites them (MVP).                   Open from Sources with{" "}
                  <code className="font-mono">
                    {`/kb?projectId=…&focusMaterialId=<id>`}
                  </code>{" "}
                  to jump here.
                </p>

                {kbResult.epdCatalog && unmatchedRows.length ? (
                  <>
                    <div className="mt-2 max-h-[60vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full table-fixed border-collapse text-sm leading-snug">
                      <colgroup>
                        <col className="w-9" />
                        <col className="w-14" />
                        <col className="min-w-[7.25rem] w-[14%]" />
                        <col className="min-w-[12rem] w-[30%]" />
                        <col className="min-w-[14rem] w-[38%]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          <th className="w-9 px-1.5 py-2 text-left font-medium">
                            <input
                              type="checkbox"
                              className="align-middle"
                              checked={allUnmatchedSelected}
                              ref={(el) => {
                                if (!el) return;
                                const n = allUnmatchedIds.length;
                                const k = unmatchedSelected.length;
                                el.indeterminate = k > 0 && k < n;
                              }}
                              onChange={() => {
                                if (allUnmatchedSelected) {
                                  setUnmatchedSelected([]);
                                } else {
                                  setUnmatchedSelected([...allUnmatchedIds]);
                                }
                              }}
                              aria-label="Select all unmatched materials"
                            />
                          </th>
                          <th className="w-14 px-1.5 py-2 text-left font-medium">ID</th>
                          <th
                            className="px-1.5 py-2 text-left font-medium text-[10px] min-w-[7rem]"
                            title="Why this row is unmatched (IFC signal, not EPD product category)"
                          >
                            Kind
                          </th>
                          <th className="px-1.5 py-2 text-left font-medium min-w-[12rem]">
                            Material
                          </th>
                          <th className="px-1.5 py-1.5 text-left font-medium min-w-[14rem]">
                            EPD (slug)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-800 dark:text-zinc-100">
                        {unmatchedRows.map((m) => {
                          const selected = manualSelections[m.materialId] ?? "";
                          const isRowSelected = unmatchedSelected.includes(m.materialId);
                          return (
                            <tr
                              id={`kb-unmatched-row-${m.materialId}`}
                              key={`u-${m.materialId}`}
                              className={
                                isRowSelected
                                  ? "bg-amber-500/10 dark:bg-amber-500/10"
                                  : "odd:bg-white even:bg-zinc-50/80 dark:odd:bg-zinc-900 dark:even:bg-zinc-950/80"
                              }
                            >
                              <td className="px-1.5 py-1 align-middle border-t border-zinc-100 dark:border-zinc-800">
                                <input
                                  type="checkbox"
                                  className="align-middle"
                                  checked={isRowSelected}
                                  onChange={() => {
                                    setUnmatchedSelected((prev) =>
                                      prev.includes(m.materialId)
                                        ? prev.filter((id) => id !== m.materialId)
                                        : [...prev, m.materialId]
                                    );
                                  }}
                                  aria-label={`Select material ${m.materialId}`}
                                />
                              </td>
                              <td className="px-1.5 py-1 align-middle font-mono text-xs border-t border-zinc-100 dark:border-zinc-800">
                                {m.materialId}
                              </td>
                              <td className="max-w-0 px-1.5 py-1 align-top border-t border-zinc-100 dark:border-zinc-800">
                                {m.rowKind && m.rowKindLabel ? (
                                  <span
                                    className={`inline-block max-w-full truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight ${unmatchedRowKindBadgeClass(
                                      m.rowKind
                                    )}`}
                                    title={m.rowKindLabel}
                                  >
                                    {m.rowKindLabel}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">—</span>
                                )}
                              </td>
                              <td className="min-w-0 px-1.5 py-1 align-top border-t border-zinc-100 dark:border-zinc-800">
                                <span
                                  className="text-sm leading-snug break-words [overflow-wrap:anywhere]"
                                  title={m.materialName}
                                >
                                  {m.materialName}
                                </span>
                              </td>
                              <td className="px-1.5 py-1 align-top border-t border-zinc-100 dark:border-zinc-800">
                                <EpdCatalogSelect
                                  catalog={kbResult.epdCatalog ?? []}
                                  value={selected}
                                  size="compact"
                                  showCaption={false}
                                  aria-label={`EPD for material ${m.materialId}`}
                                  onChange={(v) => {
                                    setManualSelections((prev) => ({
                                      ...prev,
                                      [m.materialId]: v,
                                    }));
                                    setUnmatchedSelected((prev) => {
                                      if (!v) {
                                        return prev.filter(
                                          (id) => id !== m.materialId
                                        );
                                      }
                                      if (prev.includes(m.materialId)) {
                                        return prev;
                                      }
                                      return [...prev, m.materialId];
                                    });
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                      <div className="min-w-0 flex-1 sm:max-w-xl">
                        <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-300">
                          Default EPD (slug in menu; full name below)
                        </span>
                        <EpdCatalogSelect
                          catalog={(kbResult.epdCatalog ?? []).filter(
                            (epd) => epd.epdName !== "AAC (route via source)"
                          )}
                          value={bulkDefaultEpd || defaultEpdSlug}
                          size="comfortable"
                          showCaption={false}
                          showPlaceholderOption={false}
                          aria-label="Default EPD for bulk fill"
                          onChange={(v) => setBulkDefaultEpd(v)}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!unmatchedSelected.length || manualSaving || loading}
                        className="shrink-0 rounded border border-zinc-300 dark:border-zinc-600 px-3 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                        onClick={fillSelectionWithBulkEpd}
                      >
                        Fill selection
                      </button>
                    </div>
                    <div className="flex w-full flex-col items-stretch gap-1 sm:ml-auto sm:w-auto sm:items-end">
                      <button
                        type="button"
                        disabled={
                          !unmatchedSelected.length ||
                          manualSaving ||
                          loading ||
                          !(bulkDefaultEpd || defaultEpdSlug)
                        }
                        className="inline-flex items-center justify-center rounded px-3 py-2 text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                        onClick={applyBatchManualMatches}
                      >
                        {manualSaving
                          ? "Applying…"
                          : `Apply selected (${unmatchedSelected.length})`}
                      </button>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Choosing an EPD selects the row for apply.
                      </p>
                    </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">—</p>
                )}
              </ToggleSection>
            </div>
          ) : null}

          {kbGraph ? (
            <div className="mt-4 p-3 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                Knowledge graph — force graph, grouped list, or SVG outline
              </div>
              {kbGraphLoading ? (
                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  Loading graph...
                </div>
              ) : (
                <div className="mt-2">
                  <KbGraphVisualization kbGraph={kbGraph} />
                </div>
              )}
            </div>
          ) : null}

          <details className="mt-4">
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

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <details>
          <summary className="cursor-pointer text-base font-medium">
            Last Enriched Preview
          </summary>
          <pre className="mt-2 p-3 text-xs leading-5 font-mono max-h-[35vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
            {previewEnriched?.join("\n") ?? "—"}
          </pre>
        </details>
      </div>
    </div>
  );
}

