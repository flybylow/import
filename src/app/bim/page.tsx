"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BimIfcAlphaDebugPanel from "@/components/BimIfcAlphaDebugPanel";
import BuildingIfcViewer, {
  type BuildingIfcViewerHandle,
  type BuildingIfcViewerStatusPayload,
} from "@/features/bim-viewer/components/BuildingIfcViewer";
import BimIfcElementSidebar from "@/components/BimIfcElementSidebar";
import BimPassportApiInspect from "@/features/bim-viewer/components/BimPassportApiInspect";
import BimPassportWorkspace from "@/features/bim-viewer/components/BimPassportWorkspace";
import {
  elementSummariesByIfcTypeKey,
  elementSummariesFireRatedDoors,
  loadPhase4PassportsAllInstances,
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
    const data = await loadPhase4PassportsAllInstances(projectId);
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

  useEffect(() => {
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

  useEffect(() => {
    if (!qExpressId) {
      setSelectedExpressId(null);
      return;
    }
    const n = Number(qExpressId);
    if (Number.isFinite(n)) setSelectedExpressId(n);
  }, [qExpressId]);

  const ifcToolbarClass =
    ifcStatus?.status === "error"
      ? "rounded border border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-xs text-red-800 dark:text-red-200"
      : ifcStatus?.status === "ready"
        ? "rounded border border-emerald-300/80 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25 px-2 py-1 text-xs text-emerald-900 dark:text-emerald-100"
        : "rounded border border-amber-300/80 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 px-2 py-1 text-xs text-amber-950 dark:text-amber-100";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-2 px-6 pt-2 pb-4">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
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
          {viewMode === "building" || viewMode === "3dtest" ? (
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

        {(viewMode === "building" || viewMode === "3dtest") && selectedExpressId != null ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0">
            IFC focus{" "}
            <code className="font-mono">expressId {selectedExpressId}</code>
            <Link
              href={`/bim?projectId=${encodeURIComponent(projectId)}&view=${viewMode === "3dtest" ? "3dtest" : "building"}&expressId=${encodeURIComponent(String(selectedExpressId))}`}
              className="ml-2 font-medium text-zinc-800 underline dark:text-zinc-100"
              target="_blank"
              rel="noreferrer"
            >
              Link
            </Link>
          </div>
        ) : null}

        {viewMode === "inspect" ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0">
            Raw <code className="font-mono">GET /api/kb/status</code> (passport
            slice) — same contract as Passports
          </div>
        ) : null}

        {viewMode === "3dtest" ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0 max-w-xl">
            3D sample: click an IFC type in the sidebar to load all matching{" "}
            <code className="font-mono">expressId</code>s and highlight them together. Single-row
            picks still focus one element. IFC:{" "}
            <code className="font-mono">data/&lt;projectId&gt;.ifc</code> or{" "}
            <code className="font-mono">/ifc/test.ifc</code>.
          </div>
        ) : null}

        {viewMode === "3dtest" && visualizerLabel ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-800 dark:text-cyan-200 shrink-0">
            <span className="rounded border border-cyan-400/80 bg-cyan-50 px-2 py-1 dark:border-cyan-700 dark:bg-cyan-950/50">
              Group: <span className="font-medium">{visualizerLabel}</span>
            </span>
            <button
              type="button"
              onClick={clearIfcVisualizer}
              className="rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Clear group
            </button>
          </div>
        ) : null}

        {(viewMode === "building" || viewMode === "3dtest") &&
        ifcStatus &&
        ifcStatus.status !== "idle" ? (
          <div className={`min-w-0 max-w-full flex-1 basis-[min(100%,28rem)] ${ifcToolbarClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              {ifcStatus.status === "loading" ? (
                <span
                  className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
              <span className="min-w-0 font-mono leading-snug">{ifcStatus.message}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:flex-row">
        {viewMode === "building" || viewMode === "3dtest" ? (
          <>
            <BimIfcElementSidebar
              projectId={projectId}
              selectedExpressId={selectedExpressId}
              onSelectExpressId={
                viewMode === "3dtest" ? onSelectIfcRowClearingVisualizer : onSelectIfcSidebarExpressId
              }
              showStoryTools={viewMode === "3dtest"}
              onVisualizerIfcType={viewMode === "3dtest" ? runIfcTypeVisualizer : undefined}
              onVisualizerFireDoors={viewMode === "3dtest" ? runFireDoorsVisualizer : undefined}
              onClearVisualizer={viewMode === "3dtest" ? clearIfcVisualizer : undefined}
              visualizerActiveKey={viewMode === "3dtest" ? visualizerActiveKey : null}
              visualizerLoading={viewMode === "3dtest" ? visualizerLoading : false}
              visualizerMembers={viewMode === "3dtest" ? visualizerMembers : null}
              onPickGroupMember={viewMode === "3dtest" ? onPickGroupMember : undefined}
              className="max-h-[40vh] min-h-[12rem] shrink-0 lg:max-h-none lg:h-full lg:w-[min(100%,360px)] lg:shrink-0"
            />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <BuildingIfcViewer
                ref={ifcViewerRef}
                projectId={projectId}
                ifcSource={ifcSource}
                focusExpressId={selectedExpressId}
                focusExpressIds={viewMode === "3dtest" ? visualizerExpressIds : null}
                onStatusChange={handleIfcStatusChange}
                className="min-h-0 min-w-0 flex-1"
              />
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
              />
            </div>
          </>
        ) : viewMode === "passports" ? (
          <BimPassportWorkspace
            projectId={projectId}
            selectedExpressId={selectedExpressId}
            onSelectExpressId={onSelectPassportExpressId}
            className="min-h-0 flex-1 overflow-hidden"
          />
        ) : (
          <BimPassportApiInspect projectId={projectId} className="min-h-0 flex-1" />
        )}
      </div>
    </div>
  );
}

export default function BimFacePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 px-6 pt-3 pb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Loading BIM…
        </div>
      }
    >
      <BimFacePageInner />
    </Suspense>
  );
}
