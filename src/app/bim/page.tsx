"use client";

import dynamic from "next/dynamic";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BimIfcAlphaDebugPanel from "@/components/BimIfcAlphaDebugPanel";
import BimIfcHousePreloader from "@/components/BimIfcHousePreloader";
import type {
  BuildingIfcCanvasSelection,
  BuildingIfcViewerHandle,
  BuildingIfcViewerStatusPayload,
  BuildingIfcVisualGroup,
} from "@/features/bim-viewer/components/BuildingIfcViewer";

const BuildingIfcViewer = dynamic(
  () => import("@/features/bim-viewer/components/BuildingIfcViewer").then((m) => m.default),
  { ssr: false }
);
import BimIfcElementInfoPanel from "@/components/BimIfcElementInfoPanel";
import BimPassportApiInspect from "@/features/bim-viewer/components/BimPassportApiInspect";
import BimPassportWorkspace from "@/features/bim-viewer/components/BimPassportWorkspace";
import { bimSearchParamsSummary } from "@/lib/bim-search-params-summary";
import {
  elementSummariesByMaterialSlug,
  loadPhase4PassportsAllInstancesCached,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import { appContentWidthClass } from "@/lib/app-page-layout";
import {
  capExpressIdsForHighlighter,
  ifcHighlightTierFromFocusCount,
  IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP,
} from "@/lib/ifc-highlight-tiers";
import { useProjectId } from "@/lib/useProjectId";

type BimViewMode = "building" | "passports" | "inspect";

function BimFacePageInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { projectId } = useProjectId();

  const qView = searchParams.get("view")?.trim() ?? "";
  const qExpressId = searchParams.get("expressId")?.trim() ?? "";
  const qPassportGroup = searchParams.get("group")?.trim() ?? "";
  const qMaterialSlug = searchParams.get("materialSlug")?.trim() ?? "";

  const bimUrlFromLocation = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams]);

  const bimUrlDecodedRows = useMemo(
    () => bimSearchParamsSummary(searchParams),
    [searchParams]
  );

  const [viewMode, setViewMode] = useState<BimViewMode>("building");
  const [ifcSource, setIfcSource] = useState<"project" | "test">("project");
  const [selectedExpressId, setSelectedExpressId] = useState<number | null>(null);
  const [ifcStatus, setIfcStatus] = useState<BuildingIfcViewerStatusPayload | null>(null);
  /** Material-slug group: highlight + frame these expressIds (from passport instances). */
  const [visualizerExpressIds, setVisualizerExpressIds] = useState<number[] | null>(null);
  const [visualizerLabel, setVisualizerLabel] = useState<string | null>(null);
  const [visualizerActiveKey, setVisualizerActiveKey] = useState<string | null>(null);
  const visualizerRawPassportsRef = useRef<Phase4ElementPassport[] | null>(null);
  /** Last `materialSlug` we fully applied (avoids replace→effect loops). */
  const materialSlugSyncedRef = useRef<string | null>(null);
  const ifcViewerRef = useRef<BuildingIfcViewerHandle | null>(null);
  /**
   * `router.replace` can lag `useSearchParams()` by a frame. Without this, the layout effect that
   * syncs `expressId` from the URL would see an empty `qExpressId` right after a passports row
   * click and call `setSelectedExpressId(null)`, which clears IFC focus and tears down ghost/alpha
   * in `BuildingIfcViewer` before the URL catches up.
   */
  const expressIdOptimisticUntilUrlRef = useRef(false);
  const [wholeGraphAlphaDebug, setWholeGraphAlphaDebug] = useState(false);
  /** Demo: That Open `Highlighter` overlay groups (multi-color) alongside focus ghosting. */
  const [highlighterOverlayDemoOn, setHighlighterOverlayDemoOn] = useState(false);
  /** Building viewer: uniform ghost vs full-opacity materials (`BuildingIfcViewer`). */
  const [uniformGhost, setUniformGhost] = useState(true);

  useLayoutEffect(() => {
    const g = searchParams.get("ghost")?.trim().toLowerCase();
    if (g === "0" || g === "false" || g === "solid" || g === "off") {
      setUniformGhost(false);
    } else if (g === "1" || g === "true" || g === "on" || g === "ghost") {
      setUniformGhost(true);
    } else {
      const qv = searchParams.get("view")?.trim().toLowerCase() ?? "";
      const isBuilding = qv === "" || qv === "building";
      const fromWorkflow = searchParams.get("from")?.trim().toLowerCase() === "workflow";
      if (fromWorkflow && isBuilding) {
        setUniformGhost(false);
        const p = new URLSearchParams(searchParams.toString());
        if (!p.has("ghost")) {
          p.set("ghost", "0");
          p.set("projectId", projectId);
          router.replace(`${pathname}?${p.toString()}`, { scroll: false });
        }
      }
    }
  }, [searchParams, pathname, projectId, router]);

  const setGhostUrlMode = useCallback(
    (ghost: boolean) => {
      setUniformGhost(ghost);
      const p = new URLSearchParams(searchParams.toString());
      p.set("ghost", ghost ? "1" : "0");
      p.set("projectId", projectId);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, projectId, router, searchParams]
  );

  const ifcVisualGroups = useMemo((): BuildingIfcVisualGroup[] | null => {
    if (!highlighterOverlayDemoOn || viewMode !== "building") return null;
    if (!visualizerExpressIds || visualizerExpressIds.length < 6) return null;
    const ids = visualizerExpressIds;
    return [
      { styleKey: "demo:subsetA", color: "#f59e0b", expressIds: ids.slice(0, 3) },
      { styleKey: "demo:subsetB", color: "#a855f7", expressIds: ids.slice(-3) },
    ];
  }, [highlighterOverlayDemoOn, viewMode, visualizerExpressIds]);

  const hasMaterialGroupFocus = useMemo(
    () =>
      Boolean(qMaterialSlug.trim()) ||
      (visualizerExpressIds != null && visualizerExpressIds.length > 0),
    [qMaterialSlug, visualizerExpressIds]
  );

  const materialHighlightTierInfo = useMemo(() => {
    if (!visualizerExpressIds?.length) return null;
    const unique = [...new Set(visualizerExpressIds)].sort((a, b) => a - b);
    const tier = ifcHighlightTierFromFocusCount(unique.length);
    if (!tier) return null;
    const cap = capExpressIdsForHighlighter(unique, tier);
    return { tier, ...cap };
  }, [visualizerExpressIds]);

  const showLargeSelectionBanner =
    materialHighlightTierInfo != null &&
    (materialHighlightTierInfo.tier === "B" || materialHighlightTierInfo.tier === "C");

  const handleIfcStatusChange = useCallback((payload: BuildingIfcViewerStatusPayload) => {
    setIfcStatus(payload);
  }, []);

  const navigateView = useCallback(
    (mode: BimViewMode) => {
      setViewMode(mode);
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      if (mode === "building") p.set("view", "building");
      else if (mode === "inspect") p.set("view", "inspect");
      else {
        p.set("view", "passports");
      }
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, projectId, router, searchParams]
  );

  const onPassportNavigate = useCallback(
    (patch: { expressId?: number | null; groupKey?: string | null }) => {
      if (patch.expressId !== undefined) {
        const ex = patch.expressId;
        if (ex != null && Number.isFinite(Number(ex))) {
          expressIdOptimisticUntilUrlRef.current = true;
        } else {
          expressIdOptimisticUntilUrlRef.current = false;
        }
        setSelectedExpressId(patch.expressId);
      }
      if (viewMode !== "passports") return;
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", "passports");
      if (patch.expressId !== undefined) {
        if (patch.expressId == null) p.delete("expressId");
        else p.set("expressId", String(patch.expressId));
      }
      if (patch.groupKey !== undefined) {
        if (patch.groupKey == null || patch.groupKey === "") p.delete("group");
        else p.set("group", patch.groupKey);
      }
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [viewMode, pathname, projectId, router, searchParams]
  );

  const onSelectIfcSidebarExpressId = useCallback(
    (id: number | null) => {
      if (id != null && Number.isFinite(id)) {
        expressIdOptimisticUntilUrlRef.current = true;
      } else {
        expressIdOptimisticUntilUrlRef.current = false;
      }
      setSelectedExpressId(id);
      if (viewMode !== "building") return;
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", "building");
      if (id == null) p.delete("expressId");
      else p.set("expressId", String(id));
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [viewMode, pathname, projectId, router, searchParams]
  );

  const clearIfcVisualizer = useCallback(() => {
    materialSlugSyncedRef.current = null;
    setVisualizerExpressIds(null);
    setVisualizerLabel(null);
    setVisualizerActiveKey(null);
    expressIdOptimisticUntilUrlRef.current = false;
    setSelectedExpressId(null);
    const p = new URLSearchParams(searchParams.toString());
    if (!p.has("materialSlug")) return;
    p.delete("materialSlug");
    p.delete("expressId");
    p.set("projectId", projectId);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [pathname, projectId, router, searchParams]);

  const ensureVisualizerPassportRows = useCallback(async () => {
    if (visualizerRawPassportsRef.current?.length) return visualizerRawPassportsRef.current;
    const data = await loadPhase4PassportsAllInstancesCached(projectId);
    visualizerRawPassportsRef.current = data.ordered;
    return data.ordered;
  }, [projectId]);

  useEffect(() => {
    if (viewMode !== "building") {
      materialSlugSyncedRef.current = null;
      return;
    }
    if (!qMaterialSlug.trim()) {
      materialSlugSyncedRef.current = null;
      return;
    }
    const slug = qMaterialSlug.trim().toLowerCase();
    if (materialSlugSyncedRef.current === slug) return;
    let cancelled = false;
    void (async () => {
      try {
        const ordered = await ensureVisualizerPassportRows();
        if (cancelled) return;
        const summaries = elementSummariesByMaterialSlug(ordered, slug);
        const ids = summaries.map((s) => s.expressId);
        const uniqueSorted = ids.length ? [...new Set(ids)].sort((a, b) => a - b) : [];
        setVisualizerExpressIds(uniqueSorted.length ? uniqueSorted : null);
        setVisualizerLabel(
          uniqueSorted.length
            ? `Material · ${slug} · ${uniqueSorted.length} instances`
            : `Material · ${slug} · 0 instances`
        );
        setVisualizerActiveKey(`material:${slug}`);
        const urlExRaw = searchParams.get("expressId")?.trim() ?? "";
        const urlEx = Number(urlExRaw);
        const inGroup =
          uniqueSorted.length > 0 && Number.isFinite(urlEx) && uniqueSorted.includes(urlEx);
        const representativeId = inGroup
          ? urlEx
          : uniqueSorted.length
            ? uniqueSorted[0]!
            : null;
        if (representativeId != null && Number.isFinite(representativeId)) {
          expressIdOptimisticUntilUrlRef.current = true;
        } else {
          expressIdOptimisticUntilUrlRef.current = false;
        }
        setSelectedExpressId(representativeId);
        const p = new URLSearchParams(searchParams.toString());
        p.set("projectId", projectId);
        p.set("view", "building");
        if (representativeId != null) p.set("expressId", String(representativeId));
        else p.delete("expressId");
        p.set("materialSlug", slug);
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
        if (!cancelled) materialSlugSyncedRef.current = slug;
      } catch (e) {
        console.warn("[bim] material slug visualizer", e);
        if (!cancelled) {
          materialSlugSyncedRef.current = null;
          clearIfcVisualizer();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    clearIfcVisualizer,
    ensureVisualizerPassportRows,
    pathname,
    projectId,
    qMaterialSlug,
    router,
    searchParams,
    viewMode,
  ]);

  const onSelectIfcRowClearingVisualizer = useCallback(
    (id: number | null) => {
      clearIfcVisualizer();
      onSelectIfcSidebarExpressId(id);
    },
    [clearIfcVisualizer, onSelectIfcSidebarExpressId]
  );

  /** Keep `materialSlug` + group highlight; only change Inspect target (canvas pick still clears group). */
  const onPickInstanceWithinMaterialGroup = useCallback(
    (id: number) => {
      expressIdOptimisticUntilUrlRef.current = true;
      setSelectedExpressId(id);
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", "building");
      p.set("expressId", String(id));
      const slug = qMaterialSlug.trim().toLowerCase();
      if (slug) p.set("materialSlug", slug);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, projectId, qMaterialSlug, router, searchParams]
  );

  const materialGroupContextForPanel = useMemo(() => {
    if (!qMaterialSlug.trim() || !visualizerExpressIds?.length) return null;
    const slug = qMaterialSlug.trim().toLowerCase();
    const unique = [...new Set(visualizerExpressIds)].sort((a, b) => a - b);
    return {
      slug,
      instanceCount: unique.length,
      expressIds: unique,
    };
  }, [qMaterialSlug, visualizerExpressIds]);

  /** Lime pick / Ctrl+multi in the viewer: sync primary id to URL + KB (Element panel) — no separate “In nav” step. */
  const handleCanvasSelectionChange = useCallback(
    (sel: BuildingIfcCanvasSelection) => {
      const ids = sel.expressIds;
      if (ids.length === 0) return;
      const primary = ids[ids.length - 1];
      if (hasMaterialGroupFocus) onSelectIfcRowClearingVisualizer(primary);
      else onSelectIfcSidebarExpressId(primary);
    },
    [hasMaterialGroupFocus, onSelectIfcRowClearingVisualizer, onSelectIfcSidebarExpressId]
  );

  /** Legacy `view=3dtest` was the same viewer as Building — normalize URL. */
  useLayoutEffect(() => {
    if (qView !== "3dtest") return;
    const p = new URLSearchParams(searchParams.toString());
    p.set("view", "building");
    p.set("projectId", projectId);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [qView, pathname, projectId, router, searchParams]);

  /** Layout: apply URL view before paint so IFC viewer mounts with the correct mode + expressId in the same commit. */
  useLayoutEffect(() => {
    if (qView === "passports") setViewMode("passports");
    else if (qView === "inspect") setViewMode("inspect");
    else setViewMode("building");
  }, [qView]);

  useEffect(() => {
    visualizerRawPassportsRef.current = null;
    materialSlugSyncedRef.current = null;
    expressIdOptimisticUntilUrlRef.current = false;
    setVisualizerExpressIds(null);
    setVisualizerLabel(null);
    setVisualizerActiveKey(null);
  }, [projectId]);

  const visualizerExpressIdsKey =
    visualizerExpressIds != null && visualizerExpressIds.length > 0
      ? visualizerExpressIds.join(",")
      : "";

  /** Viewer clears internal whole-graph debug mode when focus/group targets change; keep the bug-panel chip in sync. */
  useEffect(() => {
    setWholeGraphAlphaDebug(false);
  }, [selectedExpressId, visualizerExpressIdsKey]);

  /** Layout: keep nav selection aligned with the URL before child effects run (avoids IFC focus racing null). */
  useLayoutEffect(() => {
    if (!qExpressId) {
      if (expressIdOptimisticUntilUrlRef.current) {
        return;
      }
      setSelectedExpressId(null);
      return;
    }
    const n = Number(qExpressId);
    if (Number.isFinite(n)) {
      expressIdOptimisticUntilUrlRef.current = false;
      console.log("[bim][focus-pipeline] URL → selectedExpressId (layout)", {
        expressId: n,
        view: qView || "(default)",
      });
      setSelectedExpressId(n);
    }
  }, [qExpressId, qView]);

  /**
   * IFC viewer load / highlighter setup can run across many frames; re-apply URL expressId once the
   * viewer is ready so nothing in between can leave focus stale (e.g. transient query params or
   * internal clears). Idempotent when already correct.
   */
  useEffect(() => {
    if (viewMode !== "building") return;
    if (ifcStatus?.status !== "ready") return;
    if (!qExpressId) return;
    const n = Number(qExpressId);
    if (!Number.isFinite(n)) return;
    setSelectedExpressId((prev) => (prev === n ? prev : n));
  }, [viewMode, ifcStatus?.status, qExpressId]);

  const ifcToolbarClass =
    ifcStatus?.status === "error"
      ? "rounded border border-red-400/35 bg-red-950/35 px-2 py-1 text-[10px] text-red-200"
      : ifcStatus?.status === "ready"
        ? "rounded border border-emerald-400/35 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-100"
        : "rounded border border-amber-400/35 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-100";

  const isIfcViewerMode = viewMode === "building";

  /** After the viewer chunk loads, hide when `ready` / `error` (null = only Suspense fallback shows). */
  const showIfcHousePreloader =
    isIfcViewerMode &&
    ifcStatus != null &&
    (ifcStatus.status === "idle" || ifcStatus.status === "loading");

  const ifcHousePreloaderMessage =
    ifcStatus?.status === "loading" && ifcStatus.message
      ? ifcStatus.message
      : "Preparing the model…";

  useEffect(() => {
    if (!isIfcViewerMode) setIfcStatus(null);
  }, [isIfcViewerMode]);

  const bimModeAndIfcButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => navigateView("building")}
        className={
          viewMode === "building"
            ? "rounded px-3 py-1.5 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "rounded px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700"
        }
      >
        Building
      </button>
      <button
        type="button"
        onClick={() => navigateView("passports")}
        className={
          viewMode === "passports"
            ? "rounded px-3 py-1.5 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "rounded px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700"
        }
      >
        Passports
      </button>
      <button
        type="button"
        onClick={() => navigateView("inspect")}
        className={
          viewMode === "inspect"
            ? "rounded px-3 py-1.5 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "rounded px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700"
        }
      >
        Inspect
      </button>
      {isIfcViewerMode ? (
        <div className="ml-1 flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 p-1">
          <button
            type="button"
            onClick={() => setIfcSource("project")}
            className={
              ifcSource === "project"
                ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-2 py-1 text-xs"
            }
          >
            Project IFC
          </button>
          <button
            type="button"
            onClick={() => setIfcSource("test")}
            className={
              ifcSource === "test"
                ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-2 py-1 text-xs"
            }
          >
            Test IFC
          </button>
        </div>
      ) : null}
      {isIfcViewerMode ? (
        <div
          className="ml-1 flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 p-1"
          title="Ghost dims the whole model so picks and focus read clearly; Solid uses full IFC materials."
        >
          <button
            type="button"
            onClick={() => setGhostUrlMode(true)}
            className={
              uniformGhost
                ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-2 py-1 text-xs"
            }
          >
            Ghost
          </button>
          <button
            type="button"
            onClick={() => setGhostUrlMode(false)}
            className={
              !uniformGhost
                ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-2 py-1 text-xs"
            }
          >
            Solid
          </button>
        </div>
      ) : null}
    </div>
  );

  const isPassportsMode = viewMode === "passports";

  return (
    <div
      className={`${appContentWidthClass} flex flex-1 flex-col ${
        isIfcViewerMode
          ? "min-h-0 gap-0 pt-0 pb-0"
          : isPassportsMode
            ? "min-h-0 gap-2 pt-2 pb-4"
            : "min-h-min gap-2 pt-2 pb-4"
      }`}
    >
      {isIfcViewerMode ? (
        <div
          className="shrink-0 space-y-2 border-b border-zinc-200 bg-zinc-50/95 py-2 dark:border-zinc-800 dark:bg-zinc-950/80 -mx-6 px-6"
          aria-label="BIM building toolbar"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {bimModeAndIfcButtons}
            {ifcStatus && ifcStatus.status !== "idle" ? (
              <div
                className={`min-w-0 max-w-[min(72vw,24rem)] shrink-0 ${ifcToolbarClass}`}
                title={ifcStatus.message}
              >
                <div className="flex items-center gap-2 px-2 py-1">
                  {ifcStatus.status === "loading" ? (
                    <span
                      className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500"
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 truncate font-mono text-[10px] leading-snug">
                    {ifcStatus.message}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          {qMaterialSlug.trim() || visualizerLabel ? (
            <div className="flex min-w-0 max-w-full flex-col gap-2 text-[10px] leading-snug text-zinc-700 dark:text-zinc-300">
              <p className="min-w-0 max-w-[min(100%,48rem)] break-all font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {bimUrlFromLocation}
              </p>
              {visualizerLabel ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-cyan-800 dark:text-cyan-200">
                  <span className="rounded border border-cyan-500/50 bg-cyan-100/80 px-2 py-1 dark:bg-cyan-950/60">
                    Group: <span className="font-medium">{visualizerLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={clearIfcVisualizer}
                    className="rounded border border-zinc-400 px-2 py-1 font-medium text-zinc-800 hover:bg-zinc-200/80 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                  >
                    Clear group
                  </button>
                </div>
              ) : null}
              {showLargeSelectionBanner && materialHighlightTierInfo ? (
                <p className="max-w-[min(100%,48rem)] text-[11px] leading-snug text-amber-900 dark:text-amber-100/95">
                  {materialHighlightTierInfo.tier === "C"
                    ? `Very large group (${materialHighlightTierInfo.total} elements): 3D highlights up to ${IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP} ids; camera frames that subset. Uniform ghost stays off for this selection.`
                    : `Large group (${materialHighlightTierInfo.total} elements): uniform ghost is off for this selection (solid materials + Highlighter only) to protect the IFC worker.`}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
          {bimModeAndIfcButtons}
          {viewMode === "passports" && selectedExpressId != null ? (
            <div className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0">
              expressId <code className="font-mono">{selectedExpressId}</code>
              <Link
                href={`/bim?projectId=${encodeURIComponent(projectId)}&view=passports&expressId=${encodeURIComponent(String(selectedExpressId))}`}
                className="ml-2 font-medium text-zinc-800 underline dark:text-zinc-100"
                target="_blank"
                rel="noreferrer"
              >
                Open viewer URL
              </Link>
            </div>
          ) : null}
          {viewMode === "inspect" ? (
            <div className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0">
              <code className="font-mono">GET /api/kb/status</code> — JSON or{" "}
              <code className="font-mono">inspectDisplay=ui</code> (finder columns + optional flat list)
            </div>
          ) : null}
        </div>
      )}

      <div
        className={`flex w-full flex-col overflow-x-hidden ${
          isIfcViewerMode || isPassportsMode
            ? "min-h-0 flex-1 overflow-y-hidden"
            : ""
        }`}
      >
        {isIfcViewerMode ? (
          <div
            id="bim-ifc-viewer-root"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden -mx-6 sm:flex-row"
          >
            <aside
              className="pointer-events-auto z-50 flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col border-b border-zinc-200/80 dark:border-zinc-800 sm:max-h-none sm:w-[min(17.5rem,36vw)] sm:shrink-0 sm:border-b-0 sm:border-r"
              aria-label="Inspect element"
            >
              <BimIfcElementInfoPanel
                layout="leftRail"
                projectId={projectId}
                selectedExpressId={selectedExpressId}
                onNavigateExpressId={
                  hasMaterialGroupFocus
                    ? onSelectIfcRowClearingVisualizer
                    : onSelectIfcSidebarExpressId
                }
                materialGroupContext={materialGroupContextForPanel}
                onPickMaterialGroupInstance={
                  hasMaterialGroupFocus ? onPickInstanceWithinMaterialGroup : undefined
                }
                className="min-h-0 min-w-0 flex-1"
              />
            </aside>
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
              <Suspense
                fallback={
                  <BimIfcHousePreloader variant="overlay" message="Loading 3D viewer…" />
                }
              >
                <BuildingIfcViewer
                  ref={ifcViewerRef}
                  projectId={projectId}
                  ifcSource={ifcSource}
                  focusExpressId={selectedExpressId}
                  focusExpressIds={visualizerExpressIds}
                  visualGroups={ifcVisualGroups}
                  uniformGhost={uniformGhost}
                  onStatusChange={handleIfcStatusChange}
                  onCanvasSelectionChange={handleCanvasSelectionChange}
                  className="absolute inset-0 z-0 min-h-0 min-w-0"
                />
              </Suspense>
              {showIfcHousePreloader ? (
                <BimIfcHousePreloader variant="overlay" message={ifcHousePreloaderMessage} />
              ) : null}
              <BimIfcAlphaDebugPanel
                viewerRef={ifcViewerRef}
                projectId={projectId}
                viewQuery={viewMode}
                ifcSource={ifcSource}
                selectedExpressId={selectedExpressId}
                visualizerExpressIds={visualizerExpressIds}
                visualizerActiveKey={visualizerActiveKey}
                ifcStatus={ifcStatus}
                wholeGraphAlphaOn={wholeGraphAlphaDebug}
                onWholeGraphAlphaOnChange={setWholeGraphAlphaDebug}
                highlighterOverlayDemoOn={highlighterOverlayDemoOn}
                onHighlighterOverlayDemoOnChange={setHighlighterOverlayDemoOn}
              />
            </div>
          </div>
        ) : viewMode === "passports" ? (
          <BimPassportWorkspace
            projectId={projectId}
            selectedExpressId={selectedExpressId}
            passportGroupFromUrl={qPassportGroup}
            onPassportNavigate={onPassportNavigate}
            urlQueryString={searchParams.toString()}
            className="w-full min-h-0 flex-1"
          />
        ) : (
          <BimPassportApiInspect projectId={projectId} className="w-full" />
        )}
      </div>
    </div>
  );
}

export default function BimFacePage() {
  return (
    <Suspense
      fallback={
        <div className={`${appContentWidthClass} flex flex-1 flex-col gap-3 py-3`}>
          <BimIfcHousePreloader variant="inline" message="Loading BIM…" />
        </div>
      }
    >
      <BimFacePageInner />
    </Suspense>
  );
}
