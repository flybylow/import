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
import BimIfcElementSidebar from "@/components/BimIfcElementSidebar";
import BimIfcGroupVisualizerPanel from "@/components/BimIfcGroupVisualizerPanel";
import BimPassportApiInspect from "@/features/bim-viewer/components/BimPassportApiInspect";
import BimPassportWorkspace from "@/features/bim-viewer/components/BimPassportWorkspace";
import { BIM_GLASS_ISLAND } from "@/lib/bim-glass-ui";
import { bimSearchParamsSummary } from "@/lib/bim-search-params-summary";
import {
  elementSummariesByIfcTypeKey,
  elementSummariesFireRatedDoors,
  loadPhase4PassportsAllInstancesCached,
  type GroupElementSummary,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import { useProjectId } from "@/lib/useProjectId";

type BimViewMode = "building" | "passports" | "inspect" | "3dtest";

function BimFacePageInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { projectId } = useProjectId();

  const qView = searchParams.get("view")?.trim() ?? "";
  const qExpressId = searchParams.get("expressId")?.trim() ?? "";

  const bimUrlFromLocation = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams]);

  const bimUrlDecodedRows = useMemo(
    () => bimSearchParamsSummary(searchParams),
    [searchParams]
  );

  /** 3D sample: enrich URL expressId with a KB label (same passport cache as Element panel). */
  const [urlExpressKbHint, setUrlExpressKbHint] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<BimViewMode>("building");
  const [ifcSource, setIfcSource] = useState<"project" | "test">("project");
  const [selectedExpressId, setSelectedExpressId] = useState<number | null>(null);
  const [ifcStatus, setIfcStatus] = useState<BuildingIfcViewerStatusPayload | null>(null);
  /** 3D sample: highlight + frame all these expressIds (from full KB instance list). */
  const [visualizerExpressIds, setVisualizerExpressIds] = useState<number[] | null>(null);
  const [visualizerLabel, setVisualizerLabel] = useState<string | null>(null);
  const [visualizerActiveKey, setVisualizerActiveKey] = useState<string | null>(null);
  const [visualizerLoading, setVisualizerLoading] = useState(false);
  /** Sub-elements for the active group (same order as viewer highlight). */
  const [visualizerMembers, setVisualizerMembers] = useState<GroupElementSummary[] | null>(null);
  const visualizerRawPassportsRef = useRef<Phase4ElementPassport[] | null>(null);
  const ifcViewerRef = useRef<BuildingIfcViewerHandle | null>(null);
  const [wholeGraphAlphaDebug, setWholeGraphAlphaDebug] = useState(false);
  /** Demo: That Open `Highlighter` overlay groups (multi-color) alongside focus ghosting. */
  const [highlighterOverlayDemoOn, setHighlighterOverlayDemoOn] = useState(false);
  /** Tool dock below glass nav: bulk expand/collapse + per-panel headers still work. */
  const [dockKbOpen, setDockKbOpen] = useState(false);
  const [dockGroupOpen, setDockGroupOpen] = useState(false);
  /** Element (KB) panel: default open; lives in the top overlay with other tools, above the canvas (z-index). */
  const [dockElementOpen, setDockElementOpen] = useState(true);

  const expandAllToolPanels = useCallback(() => {
    setDockKbOpen(true);
    setDockElementOpen(true);
    if (viewMode === "3dtest") setDockGroupOpen(true);
  }, [viewMode]);

  const collapseAllToolPanels = useCallback(() => {
    setDockKbOpen(false);
    setDockGroupOpen(false);
    setDockElementOpen(false);
  }, []);

  const allToolPanelsOpen = useMemo(() => {
    if (viewMode === "3dtest") {
      return dockKbOpen && dockGroupOpen && dockElementOpen;
    }
    return dockKbOpen && dockElementOpen;
  }, [viewMode, dockKbOpen, dockGroupOpen, dockElementOpen]);

  const toggleAllToolPanels = useCallback(() => {
    if (allToolPanelsOpen) collapseAllToolPanels();
    else expandAllToolPanels();
  }, [allToolPanelsOpen, collapseAllToolPanels, expandAllToolPanels]);

  const ifcVisualGroups = useMemo((): BuildingIfcVisualGroup[] | null => {
    if (!highlighterOverlayDemoOn || viewMode !== "3dtest") return null;
    if (!visualizerExpressIds || visualizerExpressIds.length < 6) return null;
    const ids = visualizerExpressIds;
    return [
      { styleKey: "demo:subsetA", color: "#f59e0b", expressIds: ids.slice(0, 3) },
      { styleKey: "demo:subsetB", color: "#a855f7", expressIds: ids.slice(-3) },
    ];
  }, [highlighterOverlayDemoOn, viewMode, visualizerExpressIds]);

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
      else if (mode === "3dtest") p.set("view", "3dtest");
      else {
        p.set("view", "passports");
      }
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, projectId, router, searchParams]
  );

  const onSelectPassportExpressId = useCallback(
    (id: number | null) => {
      setSelectedExpressId(id);
      if (viewMode !== "passports") return;
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", "passports");
      if (id == null) p.delete("expressId");
      else p.set("expressId", String(id));
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [viewMode, pathname, projectId, router, searchParams]
  );

  const onSelectIfcSidebarExpressId = useCallback(
    (id: number | null) => {
      setSelectedExpressId(id);
      if (viewMode !== "building" && viewMode !== "3dtest") return;
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", viewMode === "3dtest" ? "3dtest" : "building");
      if (id == null) p.delete("expressId");
      else p.set("expressId", String(id));
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [viewMode, pathname, projectId, router, searchParams]
  );

  const clearIfcVisualizer = useCallback(() => {
    setVisualizerExpressIds(null);
    setVisualizerLabel(null);
    setVisualizerActiveKey(null);
    setVisualizerMembers(null);
  }, []);

  const ensureVisualizerPassportRows = useCallback(async () => {
    if (visualizerRawPassportsRef.current?.length) return visualizerRawPassportsRef.current;
    const data = await loadPhase4PassportsAllInstancesCached(projectId);
    visualizerRawPassportsRef.current = data.ordered;
    return data.ordered;
  }, [projectId]);

  const runIfcTypeVisualizer = useCallback(
    async (ifcTypeKey: string) => {
      setVisualizerLoading(true);
      try {
        const ordered = await ensureVisualizerPassportRows();
        const summaries = elementSummariesByIfcTypeKey(ordered, ifcTypeKey);
        const ids = summaries.map((s) => s.expressId);
        setVisualizerMembers(summaries.length ? summaries : null);
        setVisualizerExpressIds(ids.length ? ids : null);
        setVisualizerLabel(ids.length ? `${ifcTypeKey} · ${ids.length} instances` : null);
        setVisualizerActiveKey(ids.length ? `ifc:${ifcTypeKey}` : null);
        setSelectedExpressId(null);
        const p = new URLSearchParams(searchParams.toString());
        p.set("projectId", projectId);
        p.set("view", "3dtest");
        p.delete("expressId");
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
      } catch (e) {
        console.warn("[bim] IFC type visualizer", e);
        clearIfcVisualizer();
      } finally {
        setVisualizerLoading(false);
      }
    },
    [
      clearIfcVisualizer,
      ensureVisualizerPassportRows,
      pathname,
      projectId,
      router,
      searchParams,
    ]
  );

  const runFireDoorsVisualizer = useCallback(async () => {
    setVisualizerLoading(true);
    try {
      const ordered = await ensureVisualizerPassportRows();
      const summaries = elementSummariesFireRatedDoors(ordered);
      const ids = summaries.map((s) => s.expressId);
      setVisualizerMembers(summaries.length ? summaries : null);
      setVisualizerExpressIds(ids.length ? ids : null);
      setVisualizerLabel(ids.length ? `Fire-rated doors · ${ids.length} instances` : null);
      setVisualizerActiveKey(ids.length ? "fire-doors" : null);
      setSelectedExpressId(null);
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", "3dtest");
      p.delete("expressId");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    } catch (e) {
      console.warn("[bim] fire doors visualizer", e);
      clearIfcVisualizer();
    } finally {
      setVisualizerLoading(false);
    }
  }, [
    clearIfcVisualizer,
    ensureVisualizerPassportRows,
    pathname,
    projectId,
    router,
    searchParams,
  ]);

  const onSelectIfcRowClearingVisualizer = useCallback(
    (id: number | null) => {
      clearIfcVisualizer();
      onSelectIfcSidebarExpressId(id);
    },
    [clearIfcVisualizer, onSelectIfcSidebarExpressId]
  );

  /** Lime pick / Ctrl+multi in the viewer: sync primary id to URL + KB (Element panel) — no separate “In nav” step. */
  const handleCanvasSelectionChange = useCallback(
    (sel: BuildingIfcCanvasSelection) => {
      const ids = sel.expressIds;
      if (ids.length === 0) return;
      const primary = ids[ids.length - 1];
      if (viewMode === "3dtest") onSelectIfcRowClearingVisualizer(primary);
      else if (viewMode === "building") onSelectIfcSidebarExpressId(primary);
    },
    [viewMode, onSelectIfcRowClearingVisualizer, onSelectIfcSidebarExpressId]
  );

  /** Layout: apply URL view before paint so IFC viewer mounts with the correct mode + expressId in the same commit. */
  useLayoutEffect(() => {
    if (qView === "passports") setViewMode("passports");
    else if (qView === "inspect") setViewMode("inspect");
    else if (qView === "3dtest") setViewMode("3dtest");
    else if (qView === "building") setViewMode("building");
  }, [qView]);

  useEffect(() => {
    visualizerRawPassportsRef.current = null;
    setVisualizerExpressIds(null);
    setVisualizerLabel(null);
    setVisualizerActiveKey(null);
    setVisualizerMembers(null);
  }, [projectId]);

  const visualizerExpressIdsKey =
    visualizerExpressIds != null && visualizerExpressIds.length > 0
      ? visualizerExpressIds.join(",")
      : "";

  /** Viewer clears internal whole-graph debug mode when focus/group targets change; keep the bug-panel chip in sync. */
  useEffect(() => {
    setWholeGraphAlphaDebug(false);
  }, [selectedExpressId, visualizerExpressIdsKey]);

  const onPickGroupMember = useCallback(
    (expressId: number) => {
      clearIfcVisualizer();
      onSelectIfcSidebarExpressId(expressId);
    },
    [clearIfcVisualizer, onSelectIfcSidebarExpressId]
  );

  /** Layout: keep nav selection aligned with the URL before child effects run (avoids IFC focus racing null). */
  useLayoutEffect(() => {
    if (!qExpressId) {
      setSelectedExpressId(null);
      return;
    }
    const n = Number(qExpressId);
    if (Number.isFinite(n)) {
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
    if (viewMode !== "building" && viewMode !== "3dtest") return;
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

  const isIfcViewerMode = viewMode === "building" || viewMode === "3dtest";

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
      <button
        type="button"
        onClick={() => navigateView("3dtest")}
        className={
          viewMode === "3dtest"
            ? "rounded px-3 py-1.5 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "rounded px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700"
        }
      >
        3D sample
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
    </div>
  );

  /** Glass toolbar over the canvas (same look from first paint). */
  const bimOverlayModeToolbar = (
    <div className="flex shrink-0 flex-nowrap items-center gap-2">
      <button
        type="button"
        onClick={() => navigateView("building")}
        className={
          viewMode === "building"
            ? "shrink-0 rounded px-3 py-1.5 text-xs bg-white/90 text-zinc-900"
            : "shrink-0 rounded border border-white/20 bg-black/25 px-3 py-1.5 text-xs text-zinc-100"
        }
      >
        Building
      </button>
      <button
        type="button"
        onClick={() => navigateView("passports")}
        className={
          viewMode === "passports"
            ? "shrink-0 rounded px-3 py-1.5 text-xs bg-white/90 text-zinc-900"
            : "shrink-0 rounded border border-white/20 bg-black/25 px-3 py-1.5 text-xs text-zinc-100"
        }
      >
        Passports
      </button>
      <button
        type="button"
        onClick={() => navigateView("inspect")}
        className={
          viewMode === "inspect"
            ? "shrink-0 rounded px-3 py-1.5 text-xs bg-white/90 text-zinc-900"
            : "shrink-0 rounded border border-white/20 bg-black/25 px-3 py-1.5 text-xs text-zinc-100"
        }
      >
        Inspect
      </button>
      <button
        type="button"
        onClick={() => navigateView("3dtest")}
        className={
          viewMode === "3dtest"
            ? "shrink-0 rounded px-3 py-1.5 text-xs bg-white/90 text-zinc-900"
            : "shrink-0 rounded border border-white/20 bg-black/25 px-3 py-1.5 text-xs text-zinc-100"
        }
      >
        3D sample
      </button>
      <div className="ml-0.5 flex shrink-0 items-center gap-1 rounded border border-white/20 bg-black/25 p-1">
        <button
          type="button"
          onClick={() => setIfcSource("project")}
          className={
            ifcSource === "project"
              ? "rounded px-2 py-1 text-xs bg-white/90 text-zinc-900"
              : "rounded px-2 py-1 text-xs text-zinc-200"
          }
        >
          Project IFC
        </button>
        <button
          type="button"
          onClick={() => setIfcSource("test")}
          className={
            ifcSource === "test"
              ? "rounded px-2 py-1 text-xs bg-white/90 text-zinc-900"
              : "rounded px-2 py-1 text-xs text-zinc-200"
          }
        >
          Test IFC
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`mx-auto flex w-full max-w-none flex-1 flex-col px-3 sm:px-4 lg:px-6 ${
        isIfcViewerMode
          ? "min-h-0 gap-0 pt-0 pb-0"
          : "min-h-min gap-2 pt-2 pb-4"
      }`}
    >
      {!isIfcViewerMode ? (
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
              Raw <code className="font-mono">GET /api/kb/status</code> (passport slice) — same
              contract as Passports
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex w-full flex-col overflow-x-hidden ${
          isIfcViewerMode ? "min-h-0 flex-1 overflow-y-hidden" : ""
        }`}
      >
        {isIfcViewerMode ? (
          <div
            id="bim-ifc-viewer-root"
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden -mx-3 sm:-mx-4 lg:-mx-6"
          >
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
                focusExpressIds={viewMode === "3dtest" ? visualizerExpressIds : null}
                visualGroups={ifcVisualGroups}
                onStatusChange={handleIfcStatusChange}
                onCanvasSelectionChange={handleCanvasSelectionChange}
                className="absolute inset-0 z-0 min-h-0 min-w-0"
              />
            </Suspense>
            {showIfcHousePreloader ? (
              <BimIfcHousePreloader variant="overlay" message={ifcHousePreloaderMessage} />
            ) : null}
            {/* Glass UI above the canvas (higher z than viewer); pointer-events only on islands + dock. */}
            <div
              id="bim-ifc-chrome-overlay"
              role="region"
              aria-label="IFC viewer controls"
              className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-start gap-2 px-3 py-1.5 sm:px-4 sm:gap-2.5 lg:px-6"
            >
                <div
                  className={`pointer-events-auto relative z-40 flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-2 px-2 py-1.5 transition-opacity duration-300 ease-out ${BIM_GLASS_ISLAND} ${
                    ifcStatus?.status === "loading" ? "opacity-80" : "opacity-100"
                  }`}
                >
                  <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
                    {bimOverlayModeToolbar}
                  </div>
                  {ifcStatus && ifcStatus.status !== "idle" ? (
                    <div
                      className={`min-w-0 max-w-[min(72vw,22rem)] shrink-0 ${ifcToolbarClass}`}
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

                {viewMode === "3dtest" ? (
                  <div
                    className={`pointer-events-auto relative z-40 flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-1.5 text-[10px] leading-snug text-zinc-300 ${BIM_GLASS_ISLAND}`}
                  >
                    <p className="min-w-0 max-w-[min(100%,36rem)] break-all font-mono text-[10px]">
                      <span className="text-zinc-500">3D sample · URL · </span>
                      {bimUrlFromLocation}
                    </p>
                    {visualizerLabel ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-cyan-100">
                        <span className="rounded border border-cyan-500/50 bg-cyan-950/60 px-2 py-1">
                          Group: <span className="font-medium">{visualizerLabel}</span>
                        </span>
                        <button
                          type="button"
                          onClick={clearIfcVisualizer}
                          className="rounded border border-zinc-500/60 px-2 py-1 font-medium text-zinc-100 hover:bg-zinc-800/80"
                        >
                          Clear group
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div
                  id="bim-ifc-tools-dock"
                  role="region"
                  aria-label="IFC KB, group, and element detail panels"
                  className="pointer-events-auto relative z-50 flex min-w-0 max-w-full shrink-0 items-start gap-2 overflow-x-auto overscroll-x-contain"
                >
                  <div className="flex shrink-0 items-start border-r border-white/20 pr-2">
                    <button
                      type="button"
                      onClick={toggleAllToolPanels}
                      aria-expanded={allToolPanelsOpen}
                      title={allToolPanelsOpen ? "Collapse all panels" : "Expand all panels"}
                      className={`rounded-md border bg-black/20 px-2 py-1.5 text-left text-[10px] backdrop-blur-md transition-colors ${
                        allToolPanelsOpen
                          ? "border-white/30 text-zinc-100"
                          : "border-white/15 text-zinc-200 hover:border-white/25"
                      }`}
                    >
                      <span className="block text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                        Panels
                      </span>
                      <span className="font-medium">
                        {allToolPanelsOpen ? "Collapse all" : "Expand all"}
                      </span>
                    </button>
                  </div>
                  <BimIfcElementSidebar
                    open={dockKbOpen}
                    onOpenChange={setDockKbOpen}
                    projectId={projectId}
                    selectedExpressId={selectedExpressId}
                    onSelectExpressId={
                      viewMode === "3dtest"
                        ? onSelectIfcRowClearingVisualizer
                        : onSelectIfcSidebarExpressId
                    }
                    className="shrink-0"
                  />
                  {viewMode === "3dtest" ? (
                    <BimIfcGroupVisualizerPanel
                      open={dockGroupOpen}
                      onOpenChange={setDockGroupOpen}
                      projectId={projectId}
                      onVisualizerIfcType={runIfcTypeVisualizer}
                      onVisualizerFireDoors={runFireDoorsVisualizer}
                      onClearVisualizer={clearIfcVisualizer}
                      visualizerActiveKey={visualizerActiveKey}
                      visualizerLoading={visualizerLoading}
                      visualizerMembers={visualizerMembers}
                      onPickGroupMember={onPickGroupMember}
                      className="shrink-0"
                    />
                  ) : null}
                  <BimIfcElementInfoPanel
                    open={dockElementOpen}
                    onOpenChange={setDockElementOpen}
                    projectId={projectId}
                    selectedExpressId={selectedExpressId}
                    viewMode={viewMode === "3dtest" ? "3dtest" : "building"}
                    className="shrink-0"
                  />
                </div>
            </div>
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
        ) : viewMode === "passports" ? (
          <BimPassportWorkspace
            projectId={projectId}
            selectedExpressId={selectedExpressId}
            onSelectExpressId={onSelectPassportExpressId}
            urlQueryString={searchParams.toString()}
            className="w-full"
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
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 px-6 pt-3 pb-3">
          <BimIfcHousePreloader variant="inline" message="Loading BIM…" />
        </div>
      }
    >
      <BimFacePageInner />
    </Suspense>
  );
}
