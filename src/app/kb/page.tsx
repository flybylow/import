"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BimIfcHousePreloader from "@/components/BimIfcHousePreloader";
import type { BuildingIfcViewerStatusPayload } from "@/features/bim-viewer/components/BuildingIfcViewer";

const BuildingIfcViewer = dynamic(
  () => import("@/features/bim-viewer/components/BuildingIfcViewer").then((m) => m.default),
  { ssr: false }
);
import { EpdCatalogSelect } from "@/components/EpdCatalogSelect";
import type { UnmatchedMaterialRowKind } from "@/lib/material-unmatched-diagnostics";
import { unmatchedRowKindBadgeClass } from "@/lib/unmatched-row-kind-ui";
import KbGraphVisualization from "@/components/KbGraphVisualization";
import SourcesMatchingPanel from "@/components/SourcesMatchingPanel";
import ToggleSection from "@/components/ToggleSection";
import { useToast } from "@/components/ToastProvider";
import { dbg, dbgButton, dbgLoad } from "@/lib/client-pipeline-debug";
import { useProjectId } from "@/lib/useProjectId";
import type { KBGraph } from "@/lib/kb-store-queries";
import { bimPassportsElementHref } from "@/lib/passport-navigation-links";
import { appContentWidthClass } from "@/lib/app-page-layout";

type KnowledgeBaseResponse = {
  projectId: string;
  kbPath: string;
  ttl?: string;
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

type KbLinkedElementRow = {
  expressId: number;
  elementName?: string;
  ifcType?: string;
};

/**
 * One row to show by default: IFC often has many `IfcBuildingElementProxy` instances (mailboxes, etc.)
 * sharing a material. Prefer a more specific IFC type, then lowest express id (list is already sorted).
 */
function kbRepresentativeMaterialOccurrence(
  linked: ReadonlyArray<KbLinkedElementRow>
): KbLinkedElementRow | null {
  if (linked.length === 0) return null;
  const proxyType = "IfcBuildingElementProxy";
  const nonProxy = linked.filter((e) => e.ifcType !== proxyType);
  const pool = nonProxy.length > 0 ? nonProxy : linked;
  return pool[0] ?? null;
}

type KbOccurrenceGroup = {
  /** IFC element name (or "Unnamed"). */
  displayLabel: string;
  sortKey: string;
  members: KbLinkedElementRow[];
  representative: KbLinkedElementRow;
  count: number;
  /** Single shared type, or a short label when instances differ. */
  ifcTypeSummary?: string;
};

/** Group occurrences that share the same trimmed IFC element name (case-insensitive). */
function kbGroupOccurrencesByElementLabel(linked: ReadonlyArray<KbLinkedElementRow>): KbOccurrenceGroup[] {
  const byKey = new Map<string, KbLinkedElementRow[]>();
  const keyOrder: string[] = [];
  for (const el of linked) {
    const trimmed = el.elementName?.trim() ?? "";
    const sortKey = trimmed.length > 0 ? trimmed.toLowerCase() : "__unnamed__";
    if (!byKey.has(sortKey)) {
      byKey.set(sortKey, []);
      keyOrder.push(sortKey);
    }
    byKey.get(sortKey)!.push(el);
  }

  const groups: KbOccurrenceGroup[] = keyOrder.map((sortKey) => {
    const members = byKey.get(sortKey)!;
    const displayLabel =
      sortKey === "__unnamed__" ? "Unnamed" : (members[0]?.elementName?.trim() ?? sortKey);
    const representative = kbRepresentativeMaterialOccurrence(members) ?? members[0]!;
    const typeSet = new Set(members.map((m) => m.ifcType).filter(Boolean) as string[]);
    let ifcTypeSummary: string | undefined;
    if (typeSet.size === 1) ifcTypeSummary = [...typeSet][0];
    else if (typeSet.size > 1) ifcTypeSummary = "Mixed IFC types";

    return {
      displayLabel,
      sortKey,
      members,
      representative,
      count: members.length,
      ifcTypeSummary,
    };
  });

  groups.sort((a, b) => {
    if (a.sortKey === "__unnamed__") return 1;
    if (b.sortKey === "__unnamed__") return -1;
    return a.displayLabel.localeCompare(b.displayLabel, undefined, { sensitivity: "base" });
  });

  return groups;
}

function formatStableDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default function KnowledgeBasePage() {
  const { showToast } = useToast();
  const { projectId } = useProjectId();
  const searchParams = useSearchParams();

  const focusMaterialId = useMemo((): number | null => {
    const raw =
      searchParams.get("focusMaterialId") ?? searchParams.get("materialId");
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const focusExpressId = useMemo((): number | undefined => {
    const raw = searchParams.get("expressId")?.trim();
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [searchParams]);

  const matchedSourceQ = useMemo(
    () => searchParams.get("matchedSource")?.trim() || null,
    [searchParams]
  );

  const buildKbHref = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") p.delete(k);
        else p.set(k, v);
      }
      if (!p.get("projectId")?.trim()) p.set("projectId", projectId);
      return `/kb?${p.toString()}`;
    },
    [searchParams, projectId]
  );

  useEffect(() => {
    setKbMaterialReaderPreviewExpressId(null);
    setKbMaterialReaderIfcStatus(null);
  }, [focusMaterialId]);

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
  const [sourceToggleId, setSourceToggleId] = useState<string | null>(null);
  const [detailsReady, setDetailsReady] = useState(false);
  /** Material reader: occurrence click → 3D focus (same project IFC as /bim). */
  const [kbMaterialReaderPreviewExpressId, setKbMaterialReaderPreviewExpressId] = useState<
    number | null
  >(null);
  const [kbMaterialReaderIfcStatus, setKbMaterialReaderIfcStatus] =
    useState<BuildingIfcViewerStatusPayload | null>(null);

  const autoBuildStartedRef = useRef(false);
  /** Avoid repeating “not in preview” toasts for the same id. */
  const materialFocusMissToastRef = useRef<number | null>(null);

  const previewEnriched = useMemo(() => {
    if (!enrichedPreview) return [];
    return enrichedPreview;
  }, [enrichedPreview]);

  const unmatchedRows = useMemo(
    () => kbResult?.matchingPreview?.unmatched ?? [],
    [kbResult?.matchingPreview?.unmatched]
  );
  const matchedRows = useMemo(
    () => kbResult?.matchingPreview?.matched ?? [],
    [kbResult?.matchingPreview?.matched]
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
  const matchedIdsKey = useMemo(
    () =>
      matchedRows
        .map((r) => r.materialId)
        .sort((a, b) => a - b)
        .join(","),
    [matchedRows]
  );

  /** Single-material deep link: summary from preview rows + full `kbGraph` (not preview-capped). */
  const materialReader = useMemo(() => {
    if (focusMaterialId == null) return null;
    const matched = matchedRows.find((r) => r.materialId === focusMaterialId);
    const unmatched = unmatchedRows.find((r) => r.materialId === focusMaterialId);
    const fromGraph = kbGraph?.materials.find((m) => m.materialId === focusMaterialId);
    const materialName =
      matched?.materialName ??
      unmatched?.materialName ??
      fromGraph?.materialName ??
      null;
    const inMatchingPreview = matched != null || unmatched != null;
    const hasEpd: boolean | null =
      matched != null
        ? true
        : unmatched != null
          ? false
          : fromGraph != null
            ? fromGraph.hasEPD
            : null;
    const epdSlug = matched?.epdSlug ?? (fromGraph?.hasEPD ? fromGraph.epdSlug : undefined);
    const epdNameFromMatched = matched?.epdName;
    const epdMeta =
      epdSlug && kbGraph?.epds
        ? kbGraph.epds.find((e) => e.epdSlug === epdSlug)
        : undefined;
    const expressSeen = new Set<number>();
    const linkedElements: Array<{
      expressId: number;
      elementName?: string;
      ifcType?: string;
    }> = [];
    for (const l of kbGraph?.elementMaterialLinks ?? []) {
      if (l.materialId !== focusMaterialId) continue;
      if (expressSeen.has(l.expressId)) continue;
      expressSeen.add(l.expressId);
      const row = kbGraph?.elements?.find((e) => e.expressId === l.expressId);
      linkedElements.push({
        expressId: l.expressId,
        elementName: row?.elementName,
        ifcType: row?.ifcType,
      });
    }
    linkedElements.sort((a, b) => a.expressId - b.expressId);
    const representativeOccurrence =
      linkedElements.length === 0
        ? null
        : (kbRepresentativeMaterialOccurrence(linkedElements) ?? linkedElements[0]!);
    const occurrenceGroups = kbGroupOccurrencesByElementLabel(linkedElements);
    const materialComposition = fromGraph
      ? {
          ifcMaterialType: fromGraph.ifcMaterialType,
          layerSetName: fromGraph.layerSetName,
          schemaNameRaw: fromGraph.schemaNameRaw,
          standardNameKb: fromGraph.standardNameKb,
          compositionLayerLabels: fromGraph.compositionLayerLabels,
        }
      : null;
    return {
      materialId: focusMaterialId,
      materialName,
      inMatchingPreview,
      hasEpd,
      unmatchedRow: unmatched,
      matchedRow: matched,
      epdSlug,
      epdDisplayName: epdNameFromMatched ?? epdMeta?.epdName ?? epdSlug,
      epdMeta,
      materialSource: fromGraph?.materialSource,
      linkedElements,
      representativeOccurrence,
      occurrenceGroups,
      knownInGraph: fromGraph != null,
      materialComposition,
    };
  }, [
    focusMaterialId,
    kbGraph?.materials,
    kbGraph?.epds,
    kbGraph?.elements,
    kbGraph?.elementMaterialLinks,
    matchedRows,
    unmatchedRows,
  ]);

  /** Cold open from Passports / Sources: load matching preview + graph without requiring “Build KB” first. */
  useEffect(() => {
    if (!projectId) return;
    if (focusMaterialId == null && focusExpressId == null) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/kb/status?projectId=${encodeURIComponent(projectId)}&includeElementPassports=false&matchedLimit=500&unmatchedLimit=5000`
        );
        if (cancelled) return;
        if (res.status === 404) {
          showToast({
            type: "info",
            message: "No KB on disk for this project yet — run Build link graph on Phase 2 first.",
          });
          return;
        }
        if (!res.ok) {
          return;
        }
        const statusJson = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        setKbResult((prev) => {
          const next: KnowledgeBaseResponse = {
            projectId,
            kbPath: (statusJson.kbPath as string) ?? `data/${projectId}-kb.ttl`,
            ttl: prev?.ttl,
            kbGraph: (statusJson.kbGraph as KBGraph | undefined) ?? prev?.kbGraph,
            elementCount: statusJson.elementCount as number | undefined,
            buildMeta: prev?.buildMeta,
            diff: prev?.diff,
            epdCoverage: statusJson.epdCoverage as KnowledgeBaseResponse["epdCoverage"],
            epdCatalog: statusJson.epdCatalog as KnowledgeBaseResponse["epdCatalog"],
            matchingPreview: statusJson.matchingPreview as KnowledgeBaseResponse["matchingPreview"],
          };
          return next;
        });
        setKbGraph((statusJson.kbGraph as KBGraph | null | undefined) ?? null);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showToast stable enough; avoid refetch loops
  }, [projectId, focusMaterialId, focusExpressId]);

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

  /** Toast when deep-linked material is outside capped preview tables (reader still uses full graph). */
  useEffect(() => {
    if (focusMaterialId == null || !kbResult?.matchingPreview) return;
    const inUnmatched = unmatchedRows.some((r) => r.materialId === focusMaterialId);
    const inMatched = matchedRows.some((r) => r.materialId === focusMaterialId);
    if (!inUnmatched && !inMatched) {
      if (materialFocusMissToastRef.current !== focusMaterialId) {
        materialFocusMissToastRef.current = focusMaterialId;
        showToast({
          type: "info",
          message: `Material ${focusMaterialId} is not in this preview (matched list is capped at 500 rows, or id has no EPD / not in KB). Open the graph or rebuild.`,
        });
      }
    }
  }, [
    focusMaterialId,
    kbResult?.matchingPreview,
    matchedIdsKey,
    matchedRows,
    showToast,
    unmatchedIdsKey,
    unmatchedRows,
  ]);

  /**
   * Material deep link: keep the Material reader in view — do not scroll to Matching results tables
   * (that jumped users to the bottom of a long unmatched list).
   */
  useEffect(() => {
    if (focusMaterialId == null) return;
    const raf = requestAnimationFrame(() => {
      document.getElementById("kb-material-reader")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusMaterialId]);

  useEffect(() => {
    // Deep-link: `?autoBuild=1` from enrich/pipeline (`projectId` comes from `useProjectId` + URL).
    const params = new URLSearchParams(window.location.search);
    const autoBuild = params.get("autoBuild");

    if (!autoBuild) return;
    if (autoBuild === "0" || autoBuild === "false") return;
    if (autoBuildStartedRef.current) return;
    if (!projectId) return;

    autoBuildStartedRef.current = true;
    (async () => {
      // If we already have a KB TTL on disk (including any manual overrides),
      // don't rebuild here; rebuilding overwrites manual links (MVP behavior).
      try {
        const statusRes = await fetch(
          `/api/kb/status?projectId=${encodeURIComponent(projectId)}&includeElementPassports=false&matchedLimit=20&unmatchedLimit=30`
        );
        if (statusRes.ok) {
          const statusJson: any = await statusRes.json();
          setKbResult({
            projectId,
            kbPath: statusJson.kbPath,
            elementCount: statusJson.elementCount,
            epdCoverage: statusJson.epdCoverage,
            matchingPreview: statusJson.matchingPreview,
            epdCatalog: statusJson.epdCatalog,
            kbGraph: statusJson.kbGraph ?? undefined,
            // `ttl` intentionally omitted; manual edits are already persisted on disk.
          });
          setKbGraph(statusJson.kbGraph ?? null);
          return;
        }
      } catch {
        // Fall through to building.
      }

      runBuildKb();
    })();
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

  const loadSourcesStatus = useCallback(() => {
    void (async () => {
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
        setSourcesStatus(list);
      } catch (e: any) {
        dbgLoad("Phase2", "error", "GET /api/sources", { message: e?.message });
      }
    })();
  }, []);

  useEffect(() => {
    loadSourcesStatus();
  }, [loadSourcesStatus]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadSourcesStatus();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadSourcesStatus]);

  const toggleSourceEnabled = async (s: SourceApiRow) => {
    const nextEnabled = !s.enabled;
    const action = nextEnabled ? "set-active" : "set-inactive";
    const prevEnabled = s.enabled;
    setSourceToggleId(s.id);
    setSourcesStatus((list) =>
      list
        ? list.map((row) =>
            row.id === s.id ? { ...row, enabled: nextEnabled } : row
          )
        : list
    );
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sourceId: s.id }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "POST /api/sources failed");
      }
      showToast({
        type: "success",
        message: `${s.id} ${nextEnabled ? "on" : "off"} (config saved). Rebuild link graph to apply.`,
      });
    } catch (e: any) {
      setSourcesStatus((list) =>
        list
          ? list.map((row) =>
              row.id === s.id ? { ...row, enabled: prevEnabled } : row
            )
          : list
      );
      showToast({
        type: "error",
        message: e?.message ?? "Could not update source.",
      });
    } finally {
      setSourceToggleId(null);
    }
  };

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

      const blob = new Blob([json.ttl ?? ""], { type: "text/turtle" });
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

      const blob = new Blob([json.ttl ?? ""], { type: "text/turtle" });
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

  const applyFocusedMaterialEpd = async () => {
    if (focusMaterialId == null) return;
    const slug =
      manualSelections[focusMaterialId] ||
      bulkDefaultEpd ||
      defaultEpdSlug;
    if (!slug) {
      showToast({ type: "error", message: "Choose an EPD slug first." });
      return;
    }
    setManualSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/kb/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          overrides: [{ materialId: focusMaterialId, epdSlug: slug }],
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "POST /api/kb/override failed");
      }
      const json: KnowledgeBaseResponse = await res.json();
      setKbResult(json);
      const blob = new Blob([json.ttl ?? ""], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      await refreshKbGraph();
      showToast({
        type: "success",
        message: `Linked material ${focusMaterialId} to ${slug}.`,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
      showToast({
        type: "error",
        message: e?.message ?? "Failed to apply manual match.",
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
    <div className={`${appContentWidthClass} flex flex-col gap-4 py-6`}>
      {focusMaterialId != null ? (
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Material reader</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Phase 2 link graph ·{" "}
            <code className="font-mono text-xs">{projectId}</code>
            {" · "}
            <span className="font-mono text-zinc-800 dark:text-zinc-200">
              mat-{focusMaterialId}
            </span>
          </p>
        </header>
      ) : (
        <h1 className="text-2xl font-semibold">Phase 2 - Link</h1>
      )}

      <div className="sticky top-0 z-20 -mx-6 border-b border-zinc-200/90 dark:border-zinc-800/90 bg-zinc-50/95 px-6 py-2.5 backdrop-blur-sm dark:bg-zinc-950/95">
        {sourcesStatus ? (
          <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-800 dark:text-zinc-100 shrink-0">Sources</span>
              {sourcesStatus.map((s) => {
                const ok = s.enabled && s.exists;
                const busy = sourceToggleId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    aria-busy={busy}
                    aria-pressed={s.enabled}
                    title={`${sourceVersionLabel(s.ttlPath)} — ${s.enabled ? "On" : "Off"}${s.exists ? "" : " (TTL missing)"}. Click to toggle.`}
                    onClick={() => toggleSourceEnabled(s)}
                    className={
                      ok
                        ? "rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 px-2 py-1 cursor-pointer hover:opacity-90 disabled:opacity-60"
                        : s.enabled
                          ? "rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2 py-1 cursor-pointer hover:opacity-90 disabled:opacity-60"
                          : "rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-100/90 dark:bg-zinc-900/80 text-zinc-500 dark:text-zinc-400 px-2 py-1 line-through decoration-zinc-400 cursor-pointer hover:opacity-90 disabled:opacity-60"
                    }
                  >
                    {s.id}
                  </button>
                );
              })}
            </div>

            <details className="group mt-2 border-t border-zinc-200/80 pt-2 dark:border-zinc-700/80">
              <summary
                className="cursor-pointer list-none text-[11px] font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 [&::-webkit-details-marker]:hidden"
                title="LCA bucket chips, Open sources page, and config / Link materials help"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-zinc-400 tabular-nums dark:text-zinc-500" aria-hidden>
                    ▶
                  </span>
                  <span>
                    LCA attribution
                    {kbResult?.epdCoverage?.materialsWithEPD != null
                      ? ` (${kbResult.epdCoverage.materialsWithEPD} linked)`
                      : ""}
                    , Open sources &amp; help
                  </span>
                </span>
              </summary>
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 gap-y-2">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-prose min-w-0">
                    Same toggles as{" "}
                    <Link
                      href={`/sources?from=kb&projectId=${encodeURIComponent(projectId)}`}
                      className="font-medium underline"
                    >
                      Sources
                    </Link>
                    : saved in <code className="font-mono">config.json</code>. Re-run{" "}
                    <span className="font-medium">Link materials to EPD</span> so matching uses the new
                    set.
                  </p>
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
                {kbResult?.epdCoverage?.sourceBreakdown &&
                Object.keys(kbResult.epdCoverage.sourceBreakdown).length > 0 ? (
                  <div
                    className="flex flex-wrap items-center gap-x-3 gap-y-2"
                    title={
                      "LCA attribution buckets — not the Sources toggles. Click a chip to list materials below; click again to clear. " +
                      "dictionary-no-lca: dictionary linked an EPD slug, but no enabled TTL snapshot hydrated GWP (e.g. weak KBOB match)."
                    }
                  >
                    <span className="shrink-0 text-[11px] font-medium text-zinc-800 dark:text-zinc-100">
                      LCA attribution ({kbResult.epdCoverage.materialsWithEPD} linked)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(kbResult.epdCoverage.sourceBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, count]) => {
                          const active = matchedSourceQ === key;
                          return (
                            <Link
                              key={key}
                              href={buildKbHref({
                                matchedSource: active ? null : key,
                              })}
                              scroll={false}
                              className={
                                active
                                  ? "rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                                  : "rounded border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              }
                              title={
                                key === "dictionary-no-lca"
                                  ? `${count} materials: dictionary linked a slug but no enabled TTL hydrated LCA (not an extra source toggle). Click to list.`
                                  : `${key}: ${count} materials. Toggle drill-down.`
                              }
                            >
                              {key}{" "}
                              <span className="text-zinc-500 dark:text-zinc-400">{count}</span>
                            </Link>
                          );
                        })}
                    </div>
                  </div>
                ) : kbResult ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    LCA bucket chips appear after Link materials to EPD (source breakdown on KB).
                  </p>
                ) : null}
              </div>
            </details>
          </div>
        ) : (
          <p className="px-1 py-2 text-xs text-zinc-500 dark:text-zinc-400">Loading sources…</p>
        )}
      </div>

      {materialReader ? (
        <section
          id="kb-material-reader"
          className="scroll-mt-24 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-amber-50/80 to-white dark:from-amber-950/25 dark:to-zinc-900 p-4 shadow-sm"
          aria-label="Focused material"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1 basis-0 space-y-2" aria-label="Material details and occurrences">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 leading-snug break-words [overflow-wrap:anywhere]">
                    {materialReader.materialName ?? `Material ${materialReader.materialId}`}
                  </span>
                  {materialReader.hasEpd === true ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                      Linked to EPD
                    </span>
                  ) : materialReader.hasEpd === false ? (
                    <span className="shrink-0 rounded-full bg-rose-100 dark:bg-rose-950/50 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:text-rose-200">
                      No EPD
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                      Loading…
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
                  <Link
                    href={`/kb?projectId=${encodeURIComponent(projectId)}`}
                    className="inline-flex shrink-0 justify-center whitespace-nowrap rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Full KB view
                  </Link>
                  {materialReader.hasEpd === true && materialReader.epdSlug ? (
                    <Link
                      href={`/sources?from=kb&projectId=${encodeURIComponent(projectId)}&materialId=${encodeURIComponent(String(materialReader.materialId))}&epdSlug=${encodeURIComponent(materialReader.epdSlug)}`}
                      className="inline-flex shrink-0 justify-center whitespace-nowrap rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Sources (matching)
                    </Link>
                  ) : materialReader.hasEpd === false ? (
                    <Link
                      href={`/sources?from=kb&projectId=${encodeURIComponent(projectId)}&materialId=${encodeURIComponent(String(materialReader.materialId))}`}
                      className="inline-flex shrink-0 justify-center whitespace-nowrap rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Sources
                    </Link>
                  ) : null}
                </div>
              </div>
              {!materialReader.knownInGraph && kbGraph === null ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Loading KB graph for this material…
                </p>
              ) : !materialReader.knownInGraph ? (
                <p className="text-xs text-amber-800 dark:text-amber-200/90">
                  This material id is not in the KB graph for this project (check{" "}
                  <code className="font-mono">projectId</code> or rebuild the link graph).
                </p>
              ) : !materialReader.inMatchingPreview && materialReader.hasEpd === true ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Not in the matched preview table (first 500 rows); full graph and passports still use this
                  material.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-700/80 md:grid-cols-2 md:items-start md:gap-6">
                <div className="min-w-0 space-y-2" aria-label="IFC material and composition">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-prose">
                    One passport per <strong className="font-medium text-zinc-700 dark:text-zinc-200">material</strong>{" "}
                    (+ EPD when linked). Elements below are{" "}
                    <strong className="font-medium text-zinc-700 dark:text-zinc-200">uses</strong> of that material in
                    the IFC.
                  </p>
                  {materialReader.materialComposition &&
                  (materialReader.materialComposition.compositionLayerLabels?.length ||
                    materialReader.materialComposition.layerSetName ||
                    materialReader.materialComposition.ifcMaterialType ||
                    materialReader.materialComposition.standardNameKb) ? (
                    <div className="rounded-lg border border-zinc-200/90 bg-white/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/40">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        IFC composition
                      </div>
                      {materialReader.materialComposition.ifcMaterialType ? (
                        <p className="mt-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                          <span className="text-zinc-500 dark:text-zinc-400">IFC type: </span>
                          <code className="font-mono text-[11px]">
                            {materialReader.materialComposition.ifcMaterialType}
                          </code>
                        </p>
                      ) : null}
                      {materialReader.materialComposition.layerSetName ? (
                        <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-200">
                          <span className="text-zinc-500 dark:text-zinc-400">Layer set / assembly: </span>
                          <span className="break-words">{materialReader.materialComposition.layerSetName}</span>
                        </p>
                      ) : null}
                      {materialReader.materialComposition.standardNameKb ? (
                        <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-200">
                          <span className="text-zinc-500 dark:text-zinc-400">KB standard name: </span>
                          <span className="break-words">{materialReader.materialComposition.standardNameKb}</span>
                        </p>
                      ) : null}
                      {materialReader.materialComposition.compositionLayerLabels &&
                      materialReader.materialComposition.compositionLayerLabels.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                            {materialReader.materialComposition.compositionLayerLabels.length > 1
                              ? "Layer labels (IFC)"
                              : "IFC label"}
                          </p>
                          <ul className="mt-1 list-decimal pl-4 text-xs text-zinc-700 dark:text-zinc-200 space-y-0.5">
                            {materialReader.materialComposition.compositionLayerLabels.map((line, i) => (
                              <li key={i} className="break-words [overflow-wrap:anywhere]">
                                {line}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : materialReader.knownInGraph ? (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      No composition breakdown in the KB graph for this id (re-run Phase 1 enrich if you expect layer
                      lists).
                    </p>
                  ) : null}
                </div>

                <div className="min-w-0 space-y-2" aria-label="EPD and LCA from KB">
              {materialReader.hasEpd === true && materialReader.epdSlug ? (
                <div className="text-sm text-zinc-700 dark:text-zinc-200 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-zinc-500 dark:text-zinc-400">EPD</span>
                    <code
                      className="font-mono text-xs text-zinc-800 dark:text-zinc-200"
                      title={`KB graph id: bim:epd-${materialReader.epdSlug} (internal id, not a website URL)`}
                    >
                      {materialReader.epdSlug}
                    </code>
                    {materialReader.epdDisplayName ? (
                      <span className="text-zinc-700 dark:text-zinc-200">— {materialReader.epdDisplayName}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {materialReader.epdMeta?.sourceProductUri ? (
                      <a
                        href={materialReader.epdMeta.sourceProductUri}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                      >
                        Programme record
                      </a>
                    ) : null}
                    <Link
                      href={`/sources?from=kb&projectId=${encodeURIComponent(projectId)}${materialReader.epdSlug ? `&materialId=${encodeURIComponent(String(materialReader.materialId))}&epdSlug=${encodeURIComponent(materialReader.epdSlug)}` : ""}`}
                      className="font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
                      title="TTL imports and source order (config.json)"
                    >
                      Sources
                    </Link>
                    <Link
                      href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
                      className="font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
                    >
                      Calculate
                    </Link>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {materialReader.matchedRow?.matchType ? (
                      <span>
                        Match {materialReader.matchedRow.matchType}
                        {typeof materialReader.matchedRow.matchConfidence === "number"
                          ? ` · ${materialReader.matchedRow.matchConfidence.toFixed(2)}`
                          : ""}
                      </span>
                    ) : null}
                    {materialReader.matchedRow?.matchType && materialReader.epdMeta ? (
                      <span> · </span>
                    ) : null}
                    {materialReader.epdMeta ? (
                      <span>
                        LCA{" "}
                        {materialReader.epdMeta.lcaReady ? (
                          <span className="text-emerald-700 dark:text-emerald-300">ready</span>
                        ) : (
                          <span className="text-amber-800 dark:text-amber-200">incomplete</span>
                        )}
                        {materialReader.epdMeta.hasGwp ? "" : " · no GWP"}
                      </span>
                    ) : null}
                  </div>
                  {materialReader.epdMeta ? (
                    <>
                      <div className="rounded-lg border border-zinc-200/90 bg-white/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/40">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          LCA fields (KB)
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                          From <code className="font-mono text-[10px]">bim:epd-*</code> after source import + Link
                          materials. Order: Sources / <code className="font-mono text-[10px]">config.json</code>.
                        </p>
                        <dl className="mt-2 space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                          {materialReader.materialSource ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt
                                className="shrink-0 text-zinc-500 dark:text-zinc-400"
                                title="ont:source on material"
                              >
                                Material
                              </dt>
                              <dd>
                                <code className="font-mono text-[10px] text-zinc-800 dark:text-zinc-200">
                                  {materialReader.materialSource}
                                </code>
                              </dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.epdSource ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt
                                className="shrink-0 text-zinc-500 dark:text-zinc-400"
                                title="ont:source on EPD"
                              >
                                Dataset
                              </dt>
                              <dd>
                                <code className="font-mono text-[10px] text-zinc-800 dark:text-zinc-200">
                                  {materialReader.epdMeta.epdSource}
                                </code>
                              </dd>
                            </div>
                          ) : null}
                          {typeof materialReader.epdMeta.gwpPerUnit === "number" ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400" title="ont:gwpPerUnit">
                                GWP
                              </dt>
                              <dd className="font-mono text-[10px]">
                                {materialReader.epdMeta.gwpPerUnit.toLocaleString(undefined, {
                                  maximumFractionDigits: 6,
                                })}
                                {materialReader.epdMeta.declaredUnit
                                  ? ` · ${materialReader.epdMeta.declaredUnit}`
                                  : ""}
                              </dd>
                            </div>
                          ) : materialReader.epdMeta.declaredUnit ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Unit</dt>
                              <dd className="font-mono text-[10px]">{materialReader.epdMeta.declaredUnit}</dd>
                            </div>
                          ) : null}
                          {typeof materialReader.epdMeta.densityKgPerM3 === "number" ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400" title="ont:density">
                                Density
                              </dt>
                              <dd className="font-mono text-[10px]">
                                {materialReader.epdMeta.densityKgPerM3.toLocaleString(undefined, {
                                  maximumFractionDigits: 4,
                                })}{" "}
                                <span className="font-sans text-zinc-500 dark:text-zinc-400">kg/m³</span>
                              </dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.epdDataProvenance ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt
                                className="shrink-0 text-zinc-500 dark:text-zinc-400"
                                title="ont:epdDataProvenance"
                              >
                                Provenance
                              </dt>
                              <dd>
                                <code className="break-all font-mono text-[10px] text-zinc-800 dark:text-zinc-200">
                                  {materialReader.epdMeta.epdDataProvenance}
                                </code>
                              </dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.epdIdentifier ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Identifier</dt>
                              <dd className="break-all font-mono text-[10px]">{materialReader.epdMeta.epdIdentifier}</dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.producer ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Producer</dt>
                              <dd className="break-words">{materialReader.epdMeta.producer}</dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.productionLocation ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Production</dt>
                              <dd className="break-words">{materialReader.epdMeta.productionLocation}</dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.issueDate || materialReader.epdMeta.validUntil ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Validity</dt>
                              <dd className="text-zinc-600 dark:text-zinc-300">
                                {materialReader.epdMeta.issueDate ? (
                                  <span>issue {materialReader.epdMeta.issueDate}</span>
                                ) : null}
                                {materialReader.epdMeta.issueDate && materialReader.epdMeta.validUntil ? " · " : null}
                                {materialReader.epdMeta.validUntil ? (
                                  <span>until {materialReader.epdMeta.validUntil}</span>
                                ) : null}
                              </dd>
                            </div>
                          ) : null}
                          {materialReader.epdMeta.sourceFileName ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Imported file</dt>
                              <dd className="min-w-0 break-all">
                                <Link
                                  href={`/api/file?name=${encodeURIComponent(materialReader.epdMeta.sourceFileName)}`}
                                  className="font-mono text-[10px] text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                                  title="File under data/"
                                >
                                  {materialReader.epdMeta.sourceFileName}
                                </Link>
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : materialReader.hasEpd === false && materialReader.knownInGraph ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  No EPD linked for this material in the KB. Use dictionary / Sources to attach one, then Link
                  materials.
                </p>
              ) : materialReader.hasEpd == null && materialReader.knownInGraph ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading EPD link state…</p>
              ) : null}
                </div>
              </div>

              {materialReader.unmatchedRow?.rowKind && materialReader.unmatchedRow.rowKindLabel ? (
                <div className="text-xs">
                  <span
                    className={`inline-block max-w-full rounded px-1.5 py-0.5 font-medium ${unmatchedRowKindBadgeClass(
                      materialReader.unmatchedRow.rowKind
                    )}`}
                    title={materialReader.unmatchedRow.rowKindLabel}
                  >
                    {materialReader.unmatchedRow.rowKindLabel}
                  </span>
                </div>
              ) : null}
              {materialReader.linkedElements.length > 0 && materialReader.representativeOccurrence ? (
                <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <div
                    className="text-[10px] text-zinc-500 dark:text-zinc-400"
                    title="Each IFC element gets its own ont:madeOf. Lists are grouped by element display name. IfcBuildingElementProxy is a generic IFC class (e.g. accessories), not the Deliveries − proxy filter."
                  >
                    <p className="font-medium text-zinc-700 dark:text-zinc-200 text-xs">
                      Elements using this material ({materialReader.linkedElements.length})
                    </p>
                    <p className="mt-0.5">Grouped by IFC name; pick express id for 3D or open Passport.</p>
                  </div>
                  {materialReader.occurrenceGroups.length === 1 ? (
                    <div className="rounded-lg border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/40">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                        title="Chosen: non-proxy IFC type if possible, else lowest express id"
                      >
                        Suggested element
                      </p>
                      <ul className="mt-2 list-none space-y-0.5">
                        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              const r = materialReader.representativeOccurrence;
                              if (r) setKbMaterialReaderPreviewExpressId(r.expressId);
                            }}
                            className={`font-mono text-[11px] underline decoration-sky-600/70 dark:decoration-sky-400/70 underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300 ${
                              kbMaterialReaderPreviewExpressId ===
                              materialReader.representativeOccurrence.expressId
                                ? "font-semibold text-sky-800 dark:text-sky-200"
                                : "text-zinc-800 dark:text-zinc-100"
                            }`}
                            title="Show in 3D preview"
                          >
                            #{materialReader.representativeOccurrence.expressId}
                          </button>
                          <Link
                            href={bimPassportsElementHref(
                              projectId,
                              materialReader.representativeOccurrence.expressId,
                              materialReader.representativeOccurrence.ifcType
                            )}
                            className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                          >
                            Passport
                          </Link>
                          {materialReader.representativeOccurrence.elementName ? (
                            <span className="text-zinc-500 dark:text-zinc-400">
                              — {materialReader.representativeOccurrence.elementName}
                            </span>
                          ) : null}
                          {materialReader.representativeOccurrence.ifcType ? (
                            <span className="text-zinc-400 dark:text-zinc-500">
                              ({materialReader.representativeOccurrence.ifcType})
                            </span>
                          ) : null}
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/40">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                        title="Per group: prefer non-proxy type, else lowest express id. Expand below for all instances."
                      >
                        Suggested per IFC name
                      </p>
                      <ul className="mt-2 list-none space-y-2">
                        {materialReader.occurrenceGroups.map((g) => (
                          <li
                            key={g.sortKey}
                            className="rounded-md border border-zinc-200/70 bg-white/60 px-2 py-1.5 dark:border-zinc-600/80 dark:bg-zinc-950/30"
                          >
                            <div className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                              {g.displayLabel}
                              {g.ifcTypeSummary ? (
                                <span className="font-normal text-zinc-500 dark:text-zinc-400">
                                  {" "}
                                  · {g.ifcTypeSummary}
                                </span>
                              ) : null}
                              <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {g.count}×</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <button
                                type="button"
                                onClick={() => setKbMaterialReaderPreviewExpressId(g.representative.expressId)}
                                className={`font-mono text-[11px] underline decoration-sky-600/70 dark:decoration-sky-400/70 underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300 ${
                                  kbMaterialReaderPreviewExpressId === g.representative.expressId
                                    ? "font-semibold text-sky-800 dark:text-sky-200"
                                    : "text-zinc-800 dark:text-zinc-100"
                                }`}
                                title="Show in 3D preview"
                              >
                                #{g.representative.expressId}
                              </button>
                              <Link
                                href={bimPassportsElementHref(
                                  projectId,
                                  g.representative.expressId,
                                  g.representative.ifcType
                                )}
                                className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                              >
                                Passport
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {materialReader.linkedElements.length > 1 ? (
                    <details className="group text-xs text-zinc-600 dark:text-zinc-300">
                      <summary className="cursor-pointer list-none font-medium text-zinc-700 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-zinc-400 group-open:hidden dark:text-zinc-500" aria-hidden>
                            ▶
                          </span>
                          <span className="hidden text-zinc-400 group-open:inline dark:text-zinc-500" aria-hidden>
                            ▼
                          </span>
                          All occurrences ({materialReader.linkedElements.length} elements ·{" "}
                          {materialReader.occurrenceGroups.length}{" "}
                          {materialReader.occurrenceGroups.length === 1 ? "name" : "names"})
                        </span>
                      </summary>
                      <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                        Grouped by IFC element name; each row is still a separate IFC element with the same material
                        id.
                      </p>
                      <div className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1">
                        {materialReader.occurrenceGroups.map((g) => (
                          <div key={g.sortKey}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                              {g.displayLabel}
                              {g.ifcTypeSummary ? (
                                <span className="font-normal normal-case text-zinc-500 dark:text-zinc-400">
                                  {" "}
                                  · {g.ifcTypeSummary}
                                </span>
                              ) : null}
                              <span className="font-normal normal-case text-zinc-500 dark:text-zinc-400">
                                {" "}
                                · {g.count}×
                              </span>
                            </div>
                            <ul className="mt-1 list-disc pl-4 space-y-0.5">
                              {g.members.map((el) => (
                                <li key={el.expressId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setKbMaterialReaderPreviewExpressId(el.expressId)}
                                    className={`font-mono text-[11px] underline decoration-sky-600/70 dark:decoration-sky-400/70 underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300 ${
                                      kbMaterialReaderPreviewExpressId === el.expressId
                                        ? "font-semibold text-sky-800 dark:text-sky-200"
                                        : "text-zinc-800 dark:text-zinc-100"
                                    }`}
                                    title="Show in 3D preview"
                                  >
                                    #{el.expressId}
                                  </button>
                                  <Link
                                    href={bimPassportsElementHref(projectId, el.expressId, el.ifcType)}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                  >
                                    Passport
                                  </Link>
                                  {el.elementName ? (
                                    <span className="text-zinc-500 dark:text-zinc-400">— {el.elementName}</span>
                                  ) : null}
                                  {el.ifcType ? (
                                    <span className="text-zinc-400 dark:text-zinc-500">({el.ifcType})</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : materialReader.knownInGraph ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  No element→material links in the KB for this material (only appears in the material layer).
                </p>
              ) : null}
            </div>
            <div
              className="flex w-full shrink-0 flex-col gap-2 lg:w-[min(100%,440px)] lg:max-w-[min(100%,440px)] lg:sticky lg:top-24 lg:self-start"
              aria-label="IFC 3D preview"
            >
              <div>
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100">3D preview</p>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Click an express id to focus · <span className="whitespace-nowrap">Passport → full element</span>
                </p>
              </div>
              <div className="relative h-[min(420px,55vh)] min-h-[280px] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950/5 dark:border-zinc-700 dark:bg-black/20">
                {kbMaterialReaderIfcStatus != null &&
                (kbMaterialReaderIfcStatus.status === "idle" ||
                  kbMaterialReaderIfcStatus.status === "loading") ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/25 dark:bg-black/40">
                    <div className="rounded-md border border-zinc-200/80 bg-white/95 px-3 py-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200">
                      {kbMaterialReaderIfcStatus.status === "loading" &&
                      kbMaterialReaderIfcStatus.message
                        ? kbMaterialReaderIfcStatus.message
                        : "Loading IFC…"}
                    </div>
                  </div>
                ) : null}
                <Suspense fallback={<BimIfcHousePreloader />}>
                  <BuildingIfcViewer
                    key={`kb-material-reader-${projectId}-${focusMaterialId ?? "none"}`}
                    projectId={projectId}
                    ifcSource="project"
                    focusExpressId={kbMaterialReaderPreviewExpressId}
                    uniformGhost
                    onStatusChange={setKbMaterialReaderIfcStatus}
                  />
                </Suspense>
              </div>
              {kbMaterialReaderPreviewExpressId != null ? (
                <Link
                  href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building&expressId=${encodeURIComponent(String(kbMaterialReaderPreviewExpressId))}`}
                  className="text-center text-[11px] font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                >
                  Open full BIM viewer for #{kbMaterialReaderPreviewExpressId}
                </Link>
              ) : null}
            </div>
          </div>
          {materialReader.hasEpd === false && kbResult?.epdCatalog?.length ? (
            <div className="mt-4 flex flex-col gap-2 border-t border-amber-200/80 dark:border-amber-900/50 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-md">
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  Assign EPD manually
                </label>
                <EpdCatalogSelect
                  catalog={kbResult.epdCatalog}
                  value={manualSelections[materialReader.materialId] ?? ""}
                  size="comfortable"
                  showCaption={false}
                  aria-label={`EPD for material ${materialReader.materialId}`}
                  onChange={(v) => {
                    setManualSelections((prev) => ({
                      ...prev,
                      [materialReader.materialId]: v,
                    }));
                  }}
                />
              </div>
              <button
                type="button"
                disabled={
                  manualSaving ||
                  loading ||
                  !(manualSelections[materialReader.materialId] || bulkDefaultEpd || defaultEpdSlug)
                }
                className="inline-flex items-center justify-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900 disabled:opacity-50"
                onClick={() => void applyFocusedMaterialEpd()}
              >
                {manualSaving ? "Applying…" : "Apply EPD to this material"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

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

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium">Build Link Graph</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            projectId: <code className="font-mono">{projectId}</code>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {kbResult ? (
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              Materials linked to EPD
            </p>
          ) : (
            <button
              className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
              disabled={loading}
              onClick={runBuildKb}
              suppressHydrationWarning
            >
              {loading ? "Linking materials…" : "Link materials to EPD"}
            </button>
          )}
          {kbResult ? (
            <Link
              href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium underline text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-zinc-50"
              onClick={() =>
                dbgButton("Phase2", "navigate → /calculate (Phase 3)", { projectId })
              }
            >
              Go to calculator phase three
            </Link>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>

      {kbResult ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-700 dark:text-zinc-200">KB is written</div>
            {downloadUrl ? (
              <a
                className="inline-flex items-center gap-1.5 text-sm font-medium underline"
                href={downloadUrl}
                download={kbResult.kbPath.split("/").pop() ?? `${projectId}-kb.ttl`}
                title={`Download ${kbResult.kbPath.split("/").pop() ?? `${projectId}-kb.ttl`}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v7.69L6.53 7.72a.75.75 0 1 0-1.06 1.06l4 4a.75.75 0 0 0 1.06 0l4-4a.75.75 0 0 0-1.06-1.06l-2.72 2.72V2.75Z" />
                  <path d="M3.5 13.25a.75.75 0 0 1 .75.75v1.25c0 .69.56 1.25 1.25 1.25h9c.69 0 1.25-.56 1.25-1.25V14a.75.75 0 0 1 1.5 0v1.25A2.75 2.75 0 0 1 14.5 18h-9a2.75 2.75 0 0 1-2.75-2.75V14a.75.75 0 0 1 .75-.75Z" />
                </svg>
                Written
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
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      LCA buckets:{" "}
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">sticky chips</span> — hover
                      for help. Drill-down:{" "}
                      <a href="#kb-dictionary-matching" className="underline font-medium text-zinc-700 dark:text-zinc-200">
                        Dictionary + KB matching
                      </a>
                      .
                    </p>
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

          <div id="kb-dictionary-matching" className="mt-4 scroll-mt-24">
            <SourcesMatchingPanel
              projectId={projectId}
              dictionaryVersion={
                kbResult.buildMeta?.materialDictionaryVersion ?? "—"
              }
              dictionaryPath="src/data/material-dictionary.json"
              matchedSourceUrlSync
              suppressAttributionChips
            />
          </div>

          {kbResult.matchingPreview ? (
            <div className="mt-4 p-3 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                Matching results
              </p>

              <div className="mt-2">
                <ToggleSection
                  key={
                    focusMaterialId != null &&
                    matchedRows.some((r) => r.materialId === focusMaterialId)
                      ? `matched-open-${focusMaterialId}`
                      : "matched-default"
                  }
                  defaultOpen={
                    focusMaterialId != null &&
                    matchedRows.some((r) => r.materialId === focusMaterialId)
                  }
                  title={`Matched materials (${kbResult.epdCoverage?.materialsWithEPD ?? kbResult.matchingPreview.matched.length} have EPD)`}
                  summaryClassName="cursor-pointer text-xs text-zinc-700 dark:text-zinc-200"
                >
                  <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-200">
                    {kbResult.epdCoverage &&
                    kbResult.matchingPreview.matched.length <
                      kbResult.epdCoverage.materialsWithEPD ? (
                      <div className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Showing top preview rows:{" "}
                        <code className="font-mono">
                          {kbResult.matchingPreview.matched.length}/
                          {kbResult.epdCoverage.materialsWithEPD}
                        </code>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)_150px_90px_90px] gap-x-3 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      <span>ID</span>
                      <span>Material</span>
                      <span>EPD</span>
                      <span>Match</span>
                      <span>Confidence</span>
                      <span>Actions</span>
                    </div>
                    <div className="space-y-1">
                    {kbResult.matchingPreview.matched.length ? (
                      kbResult.matchingPreview.matched.map((m) => (
                        <div
                          id={`kb-matched-row-${m.materialId}`}
                          key={`m-${m.materialId}`}
                          className="rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1"
                        >
                          <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)_150px_90px_90px] gap-x-3 gap-y-1 items-start">
                            <span className="font-mono text-zinc-500 dark:text-zinc-400">
                              {m.materialId}
                            </span>
                            <span className="truncate" title={m.materialName}>
                              {m.materialName}
                            </span>
                            <span
                              className="truncate font-mono text-zinc-700 dark:text-zinc-200"
                              title={`${m.epdSlug} — ${m.epdName}`}
                            >
                              {m.epdSlug}
                            </span>
                            <span
                              className="truncate text-zinc-500 dark:text-zinc-400"
                              title={m.matchType ?? "—"}
                            >
                              {m.matchType ?? "—"}
                            </span>
                            <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                              {typeof m.matchConfidence === "number"
                                ? m.matchConfidence.toFixed(2)
                                : "—"}
                            </span>
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
                          </div>
                        </div>
                      ))
                    ) : (
                      <div>—</div>
                    )}
                    </div>
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
                  focusMaterialId != null &&
                  unmatchedRows.some((r) => r.materialId === focusMaterialId)
                    ? `unmatched-open-${focusMaterialId}`
                    : "unmatched-default"
                }
                defaultOpen={
                  focusMaterialId != null &&
                  unmatchedRows.some((r) => r.materialId === focusMaterialId)
                }
                title={
                  <>
                    Unmatched materials ({unmatchedTotal} have NO EPD)
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
                  overwrites them (MVP).                   Deep-link{" "}
                  <code className="font-mono">
                    {`/kb?projectId=…&focusMaterialId=<id>`}
                  </code>{" "}
                  loads the KB and scrolls to this row if the material is unmatched, or to{" "}
                  <strong className="font-medium text-zinc-700 dark:text-zinc-300">Matched materials</strong>{" "}
                  if it already has an EPD (preview capped at 500 matched rows).
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
                          Default EPD for bulk fill — same list as each row (routing / “route via
                          source” slugs such as <code className="font-mono">aac</code> included).
                        </span>
                        <EpdCatalogSelect
                          catalog={kbResult.epdCatalog ?? []}
                          value={bulkDefaultEpd || defaultEpdSlug}
                          size="comfortable"
                          showCaption
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
                Knowledge graph
              </div>
              {kbGraphLoading ? (
                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  Loading graph...
                </div>
              ) : (
                <div className="mt-2">
                  <KbGraphVisualization
                    kbGraph={kbGraph}
                    focusExpressId={focusExpressId}
                    focusMaterialId={focusMaterialId ?? undefined}
                  />
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

    </div>
  );
}

