"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EpdCatalogSelect } from "@/components/EpdCatalogSelect";
import { useToast } from "@/components/ToastProvider";
import type { UnmatchedMaterialRowKind } from "@/lib/material-unmatched-diagnostics";
import { unmatchedRowKindBadgeClass } from "@/lib/unmatched-row-kind-ui";

type SourceRow = {
  id: string;
  type: string;
  ttlPath: string;
  enabled: boolean;
  exists: boolean;
  report: null | {
    rowCount?: number;
    generatedAt?: string;
    inputFile?: string;
    outputTtl?: string;
  };
};

type KbGapStatus = {
  projectId: string;
  kbPath?: string;
  elementCount?: number;
  epdCatalog?: Array<{ epdSlug: string; epdName: string }>;
  epdCoverage?: {
    materialsTotal: number;
    materialsWithEPD: number;
    materialsWithoutEPD: number;
    sourceBreakdown?: Record<string, number>;
  };
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
      schemaName?: string;
      layerSetName?: string;
      standardName?: string;
      ifcType?: string;
      normalizedForMatch?: string;
      flowHint?: string;
      suggestedApiQuery?: string;
      rowKind?: UnmatchedMaterialRowKind;
      rowKindLabel?: string;
    }>;
  };
};

function versionHint(ttlPath: string): string {
  const base = ttlPath.split("/").pop() ?? ttlPath;
  return base.replace(/\.ttl$/i, "");
}

function readKbContextFromUrl(): { fromKb: boolean; projectId: string | null } {
  if (typeof window === "undefined") {
    return { fromKb: false, projectId: null };
  }
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const projectId = params.get("projectId");
  return {
    fromKb: from === "kb",
    projectId: projectId?.trim() || null,
  };
}

export default function SourcesPage() {
  const { showToast } = useToast();
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [kbContext, setKbContext] = useState<{
    fromKb: boolean;
    projectId: string | null;
  }>({ fromKb: false, projectId: null });
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  const [gapData, setGapData] = useState<KbGapStatus | null>(null);
  const [copiedMaterialId, setCopiedMaterialId] = useState<number | null>(null);
  const [manualSelections, setManualSelections] = useState<Record<number, string>>({});
  const [unmatchedSelected, setUnmatchedSelected] = useState<number[]>([]);
  const [bulkDefaultEpd, setBulkDefaultEpd] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/sources");
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    setSources(json.sources ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        await load();
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadGapStatus = useCallback(async (projectId: string) => {
    const q = new URLSearchParams({
      projectId,
      includeElementPassports: "false",
      elementPassportsLimit: "0",
      matchedLimit: "30",
      unmatchedLimit: "5000",
    });
    const res = await fetch(`/api/kb/status?${q.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const json = (await res.json()) as KbGapStatus;
    setGapData(json);
    setGapError(null);
  }, []);

  useEffect(() => {
    const ctx = readKbContextFromUrl();
    setKbContext(ctx);
    if (!ctx.fromKb || !ctx.projectId) {
      setGapData(null);
      setGapError(null);
      setGapLoading(false);
      return;
    }

    let cancelled = false;
    setGapLoading(true);
    setGapError(null);
    setGapData(null);

    (async () => {
      try {
        await loadGapStatus(ctx.projectId!);
      } catch (e: unknown) {
        if (!cancelled) {
          setGapError(e instanceof Error ? e.message : String(e));
          setGapData(null);
        }
      } finally {
        if (!cancelled) setGapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadGapStatus]);

  const postAction = async (action: string, sourceId: string) => {
    setBusyId(sourceId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sourceId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || (await res.text()) || "Request failed");
      }
      setMessage(`OK: ${action} (${sourceId})`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const showGapPanel = kbContext.fromKb && kbContext.projectId;

  const unmatchedRows = useMemo(
    () => gapData?.matchingPreview?.unmatched ?? [],
    [gapData?.matchingPreview?.unmatched]
  );
  const unmatchedTotal =
    gapData?.epdCoverage?.materialsWithoutEPD ?? unmatchedRows.length;
  const matchedPreview = gapData?.matchingPreview?.matched ?? [];
  const defaultEpdSlug = gapData?.epdCatalog?.[0]?.epdSlug ?? "";

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
    () => gapData?.epdCatalog?.map((e) => e.epdSlug) ?? [],
    [gapData?.epdCatalog]
  );

  useEffect(() => {
    if (!gapData?.epdCatalog?.length) return;
    setBulkDefaultEpd((prev) =>
      prev && catalogSlugs.includes(prev) ? prev : gapData.epdCatalog![0].epdSlug
    );
  }, [gapData?.epdCatalog, catalogSlugs]);

  const allUnmatchedIds = useMemo(
    () => unmatchedRows.map((r) => r.materialId),
    [unmatchedRows]
  );
  const allUnmatchedSelected =
    allUnmatchedIds.length > 0 &&
    unmatchedSelected.length === allUnmatchedIds.length;

  const sourceBreakdownEntries = useMemo(() => {
    const m = gapData?.epdCoverage?.sourceBreakdown;
    if (!m) return [];
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gapData?.epdCoverage?.sourceBreakdown]);

  const containerClass =
    showGapPanel && gapData
      ? "max-w-7xl mx-auto p-4 sm:p-6 flex flex-col gap-4"
      : "max-w-4xl mx-auto p-6 flex flex-col gap-4";

  const copyApiLine = async (materialId: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMaterialId(materialId);
      window.setTimeout(() => setCopiedMaterialId(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const fillSelectionWithBulkEpd = () => {
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
    const pid = kbContext.projectId;
    if (!pid) return;
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
    try {
      const res = await fetch("/api/kb/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, overrides }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "POST /api/kb/override failed");
      }
      showToast({
        type: "success",
        message: `Saved ${overrides.length} manual EPD link(s) to data/${pid}-kb.ttl.`,
      });
      setManualSelections({});
      setUnmatchedSelected([]);
      setGapLoading(true);
      try {
        await loadGapStatus(pid);
      } catch (e: unknown) {
        showToast({
          type: "error",
          message:
            e instanceof Error
              ? `Saved but list refresh failed: ${e.message}`
              : "Saved but list refresh failed.",
        });
      }
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setGapLoading(false);
      setManualSaving(false);
    }
  };

  return (
    <div className={containerClass}>
      <h1 className="text-2xl font-semibold">Sources</h1>

      {showGapPanel ? (
        <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                KB gaps (from Phase 2)
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                projectId:{" "}
                <code className="font-mono">{kbContext.projectId}</code>
              </p>
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 max-w-xl">
                Pick an EPD per row and <strong>Apply selected</strong> — writes{" "}
                <code className="font-mono">
                  data/{kbContext.projectId}-kb.ttl
                </code>{" "}
                (same as Phase 2). Rebuilding the KB overwrites manual links (MVP).
              </p>
            </div>
          </div>

          {gapLoading ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading KB status…</p>
          ) : gapError ? (
            <div className="text-sm text-amber-800 dark:text-amber-200 space-y-2">
              <p>
                Could not load KB for this project. Build the link graph first on{" "}
                <Link
                  className="underline font-medium"
                  href={`/kb?projectId=${encodeURIComponent(kbContext.projectId ?? "")}`}
                >
                  Phase 2 — Link
                </Link>
                .
              </p>
              <pre className="text-xs p-2 rounded border border-zinc-200 dark:border-zinc-700 overflow-auto max-h-32">
                {gapError}
              </pre>
            </div>
          ) : gapData?.epdCoverage ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                <div className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2">
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    Not linked
                  </div>
                  <div className="font-mono text-amber-900 dark:text-amber-100">
                    {gapData.epdCoverage.materialsWithoutEPD}
                  </div>
                </div>
                <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">
                    With EPD
                  </div>
                  <div className="font-mono text-emerald-900 dark:text-emerald-100">
                    {gapData.epdCoverage.materialsWithEPD}
                  </div>
                </div>
                <div className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Materials (total)</div>
                  <div className="font-mono text-zinc-900 dark:text-zinc-50">
                    {gapData.epdCoverage.materialsTotal}
                  </div>
                </div>
              </div>

              {sourceBreakdownEntries.length ? (
                <div className="text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">Matched by source (material rows):</span>{" "}
                  <code className="font-mono break-all">
                    {sourceBreakdownEntries.map(([k, v]) => `${k} ${v}`).join(" · ")}
                  </code>
                </div>
              ) : null}

              {unmatchedTotal > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-2">
                    Materials not linked ({unmatchedRows.length}
                    {unmatchedRows.length < unmatchedTotal
                      ? ` shown · ${unmatchedTotal} total`
                      : ` / ${unmatchedTotal}`}
                    )
                  </h3>
                  <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-500">
                    <strong>Normalized</strong> is the same joined string Phase 2 uses for
                    dictionary + source overlap. <strong>API suggestion</strong> is a
                    human-readable line to try in an external matcher when the IFC name is
                    useless. <strong>Kind</strong> summarises the IFC row (e.g. hatch vs
                    no auto-match), not the EPD product category. Choose <strong>EPD</strong>{" "}
                    and <strong>Apply selected</strong> below. Hover <strong>ℹ</strong> for the
                    full reason.
                  </p>
                  <div className="max-h-[min(62vh,640px)] overflow-x-auto overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full min-w-0 table-fixed border-collapse text-[11px] leading-snug">
                      <colgroup>
                        <col className="w-8" />
                        <col className="w-[4.25rem]" />
                        <col className="min-w-[7.25rem] w-[10%]" />
                        {/* Label: min width so short names like "26 Gipsplaat" stay one line */}
                        <col className="min-w-[12rem] w-[18%]" />
                        <col className="w-[14%]" />
                        <col className="w-[10%]" />
                        <col className="w-[11%]" />
                        <col className="w-[29%]" />
                        <col className="w-9" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          <th className="px-1 py-1.5 text-left font-medium">
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
                          <th className="text-left px-1 py-1.5 font-medium">ID</th>
                          <th
                            className="text-left px-1 py-1.5 font-medium text-[10px]"
                            title="Why this row is unmatched (IFC signal, not EPD product category)"
                          >
                            Kind
                          </th>
                          <th className="text-left px-1 py-1.5 font-medium">Label</th>
                          <th className="text-left px-1 py-1.5 font-medium">IFC</th>
                          <th className="text-left px-1 py-1.5 font-medium">Norm.</th>
                          <th className="text-left px-1 py-1.5 font-medium">API</th>
                          <th className="text-left px-1 py-1.5 font-medium">EPD</th>
                          <th
                            className="px-1 py-1.5 text-center font-medium text-[10px]"
                            title="Why unmatched — hover row control"
                          >
                            ℹ
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-800 dark:text-zinc-200">
                        {unmatchedRows.map((m) => {
                          const apiLine =
                            m.suggestedApiQuery?.trim() ||
                            m.normalizedForMatch ||
                            m.materialName;
                          const selected = manualSelections[m.materialId] ?? "";
                          const isRowSelected = unmatchedSelected.includes(m.materialId);
                          const ifcRawTitle = [
                            m.schemaName != null && String(m.schemaName).trim() !== ""
                              ? `schema: ${m.schemaName}`
                              : null,
                            m.layerSetName ? `layer: ${m.layerSetName}` : null,
                            m.standardName ? `standard: ${m.standardName}` : null,
                            m.ifcType ? `ifc: ${m.ifcType}` : null,
                          ]
                            .filter(Boolean)
                            .join("\n");
                          return (
                            <tr
                              key={m.materialId}
                              className={
                                isRowSelected
                                  ? "bg-amber-500/10 dark:bg-amber-500/10"
                                  : "odd:bg-white even:bg-zinc-50/80 dark:odd:bg-zinc-900 dark:even:bg-zinc-950/80"
                              }
                            >
                              <td className="px-1 py-1 align-middle border-t border-zinc-100 dark:border-zinc-800">
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
                              <td className="px-1 py-1 align-top border-t border-zinc-100 dark:border-zinc-800 font-mono text-[10px] tabular-nums text-zinc-700 dark:text-zinc-200">
                                {m.materialId}
                              </td>
                              <td className="max-w-0 px-1 py-1 align-top border-t border-zinc-100 dark:border-zinc-800">
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
                                <div
                                  className="text-[11px] leading-snug text-zinc-800 dark:text-zinc-100 break-words [overflow-wrap:anywhere]"
                                  title={m.materialName}
                                >
                                  {m.materialName}
                                </div>
                              </td>
                              <td className="max-w-0 px-1 py-1 align-top border-t border-zinc-100 dark:border-zinc-800">
                                <div
                                  className="line-clamp-2 break-words text-[10px] leading-tight text-zinc-600 dark:text-zinc-400"
                                  title={ifcRawTitle || undefined}
                                >
                                  {m.schemaName ? (
                                    <span>
                                      <span className="text-zinc-400">s:</span> {m.schemaName}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400">s: —</span>
                                  )}
                                  {m.layerSetName ? (
                                    <>
                                      {" "}
                                      <span className="text-zinc-400">· L:</span>{" "}
                                      {m.layerSetName}
                                    </>
                                  ) : null}
                                  {m.standardName ? (
                                    <>
                                      {" "}
                                      <span className="text-zinc-400">· std:</span>{" "}
                                      {m.standardName}
                                    </>
                                  ) : null}
                                  {m.ifcType ? (
                                    <>
                                      {" "}
                                      <span className="text-zinc-400">·</span> {m.ifcType}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                              <td className="max-w-0 px-1 py-1 align-top border-t border-zinc-100 dark:border-zinc-800">
                                <div
                                  className="truncate font-mono text-[10px] text-zinc-700 dark:text-zinc-300"
                                  title={m.normalizedForMatch ?? undefined}
                                >
                                  {m.normalizedForMatch ?? "—"}
                                </div>
                              </td>
                              <td className="max-w-0 px-1 py-1 align-middle border-t border-zinc-100 dark:border-zinc-800">
                                <div className="flex min-w-0 flex-row flex-nowrap items-center gap-1">
                                  <span
                                    className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-800 dark:text-zinc-100"
                                    title={apiLine}
                                  >
                                    {apiLine}
                                  </span>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded border border-zinc-300 dark:border-zinc-600 px-1 py-px text-[9px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    onClick={() => copyApiLine(m.materialId, apiLine)}
                                  >
                                    {copiedMaterialId === m.materialId ? "Copied" : "Copy"}
                                  </button>
                                </div>
                              </td>
                              <td className="max-w-0 px-1 py-0.5 align-top border-t border-zinc-100 dark:border-zinc-800">
                                {gapData?.epdCatalog?.length ? (
                                  <div className="min-w-0">
                                    <EpdCatalogSelect
                                      catalog={gapData.epdCatalog}
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
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-zinc-500">—</span>
                                )}
                              </td>
                              <td className="px-1 py-1 align-top border-t border-zinc-100 dark:border-zinc-800 text-center">
                                {m.flowHint ? (
                                  <button
                                    type="button"
                                    className="cursor-help rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-950 px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    title={m.flowHint}
                                    aria-label={m.flowHint}
                                  >
                                    ℹ
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-zinc-500">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {gapData?.epdCatalog && unmatchedRows.length ? (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                        <div className="min-w-0 flex-1 sm:max-w-xl">
                          <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-300">
                            Default EPD (for menus & bulk fill)
                          </span>
                          <EpdCatalogSelect
                            catalog={gapData.epdCatalog.filter(
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
                          disabled={!unmatchedSelected.length || manualSaving}
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
                            !(bulkDefaultEpd || defaultEpdSlug)
                          }
                          className="inline-flex items-center justify-center rounded px-3 py-2 text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                          onClick={applyBatchManualMatches}
                        >
                          {manualSaving
                            ? "Saving…"
                            : `Apply selected (${unmatchedSelected.length})`}
                        </button>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          Choosing an EPD in a row selects it for apply (no separate checkbox
                          step).
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  All materials in this KB have an EPD link.
                </p>
              )}

              {matchedPreview.length ? (
                <details className="text-xs text-zinc-600 dark:text-zinc-400">
                  <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-200">
                    Sample matched rows (preview)
                  </summary>
                  <ul className="mt-2 space-y-1 pl-2 border-l-2 border-zinc-200 dark:border-zinc-700">
                    {matchedPreview.map((m) => (
                      <li key={m.materialId} className="font-mono">
                        {m.materialId} → {m.epdSlug}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        Versioned KBOB and ICE (Educational) snapshots live under{" "}
        <code className="font-mono">data/sources/</code>. Phase 2 consults enabled sources in{" "}
        <code className="font-mono">config.json</code> order (dictionary matches still win
        first). See <code className="font-mono">docs/sources-contract.md</code>.
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Tip: open this page as{" "}
        <code className="font-mono">
          /sources?from=kb&amp;projectId=yourProjectId
        </code>{" "}
        to see unmatched materials and next steps next to your source list.
      </p>

      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">Active snapshots & order</h2>
          <button
            type="button"
            className="text-xs font-medium underline disabled:opacity-50"
            disabled={busyId !== null}
            onClick={() => load()}
          >
            Refresh
          </button>
        </div>
        {!sources ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Loading…</p>
        ) : (
          <div className="mt-3 space-y-3">
            {sources.map((s, index) => (
              <div
                key={s.id}
                className="border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{s.id}</span>{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">({s.type})</span>
                    <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                      order {index + 1}
                    </span>
                    {!s.enabled ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                        disabled
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={
                      s.exists
                        ? "text-xs text-green-700 dark:text-green-300"
                        : "text-xs text-red-700 dark:text-red-300"
                    }
                  >
                    {s.exists ? "TTL present" : "TTL missing"}
                  </div>
                </div>
                <div className="mt-1 text-xs font-mono break-all text-zinc-700 dark:text-zinc-200">
                  {s.ttlPath}
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  Version: <code className="font-mono">{versionHint(s.ttlPath)}</code>
                </div>
                {s.report ? (
                  <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                    Rows:{" "}
                    <code className="font-mono">{s.report.rowCount ?? "—"}</code>
                    · Generated:{" "}
                    <code className="font-mono">{s.report.generatedAt ?? "—"}</code>
                    {s.report.inputFile ? (
                      <>
                        <br />
                        Input:{" "}
                        <code className="font-mono break-all">{s.report.inputFile}</code>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    No report file next to TTL — run Import to generate.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => postAction("import", s.id)}
                  >
                    {busyId === s.id ? "Importing…" : "Import now"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null || !s.enabled}
                    className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => postAction("set-inactive", s.id)}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null || s.enabled}
                    className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => postAction("set-active", s.id)}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null || index === 0}
                    className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => postAction("move-up", s.id)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null || index >= sources.length - 1}
                    className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => postAction("move-down", s.id)}
                  >
                    Move down
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium">CLI (local)</h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">From the repo root:</p>
        <pre className="mt-2 p-3 text-xs leading-5 font-mono overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
          {`npm run import:kbob
npm run import:ice
npm run import:sources`}
        </pre>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          ICE Educational use is subject to the bundled PDF terms in{" "}
          <code className="font-mono">{`docs/DataSetMaterials/ICE DB Educational V4.1 - Oct 2025/`}</code>
          .
        </p>
      </div>
    </div>
  );
}
