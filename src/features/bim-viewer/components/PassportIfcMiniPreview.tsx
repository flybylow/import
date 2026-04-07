"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import BimIfcHousePreloader from "@/components/BimIfcHousePreloader";
import type {
  BuildingIfcCanvasSelection,
  BuildingIfcViewerStatusPayload,
} from "@/features/bim-viewer/components/BuildingIfcViewer";

const BuildingIfcViewer = dynamic(
  () =>
    import("@/features/bim-viewer/components/BuildingIfcViewer").then(
      (m) => m.default
    ),
  { ssr: false }
);

type Props = {
  projectId: string;
  focusExpressId: number | null;
  /** When set (non-empty), frames/highlights all ids together; overrides single `focusExpressId`. */
  focusExpressIds?: number[] | null;
  onSelectExpressId: (id: number | null) => void;
  className?: string;
};

/**
 * Universal IFC mini-viewer for passports (reuse anywhere you need the same 3D pipeline as Building):
 * wraps `BuildingIfcViewer` with project IFC, single-id or multi-id group focus, and canvas pick.
 * In passports, pair with `PassportElementFinder`: Groups (IFC type) → Elements → this preview + detail.
 */
export default function PassportIfcMiniPreview(props: Props) {
  const {
    projectId,
    focusExpressId,
    focusExpressIds = null,
    onSelectExpressId,
    className = "",
  } = props;
  const [ifcStatus, setIfcStatus] = useState<BuildingIfcViewerStatusPayload | null>(
    null
  );
  const [slowLoadHint, setSlowLoadHint] = useState(false);

  useEffect(() => {
    if (ifcStatus?.status !== "loading" && ifcStatus?.status !== "idle") {
      setSlowLoadHint(false);
      return;
    }
    const t = window.setTimeout(() => setSlowLoadHint(true), 25_000);
    return () => window.clearTimeout(t);
  }, [ifcStatus?.status]);

  const handleCanvas = useCallback(
    (sel: BuildingIfcCanvasSelection) => {
      const ids = sel.expressIds;
      if (ids.length === 0) return;
      onSelectExpressId(ids[ids.length - 1]);
    },
    [onSelectExpressId]
  );

  const showHousePreloader =
    ifcStatus != null &&
    (ifcStatus.status === "idle" || ifcStatus.status === "loading");

  const buildingHref = `/bim?projectId=${encodeURIComponent(projectId)}&view=building`;

  return (
    <div
      className={`relative min-h-[12rem] min-w-0 flex-1 overflow-hidden ${className}`.trim()}
    >
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-950/50">
            <BimIfcHousePreloader variant="inline" message="Loading IFC preview…" />
          </div>
        }
      >
        <BuildingIfcViewer
          projectId={projectId}
          ifcSource="project"
          focusExpressId={focusExpressId}
          focusExpressIds={
            focusExpressIds != null && focusExpressIds.length > 0
              ? focusExpressIds
              : null
          }
          alphaBaselineIgnoreHighlightTier
          onStatusChange={setIfcStatus}
          onCanvasSelectionChange={handleCanvas}
          className="absolute inset-0 z-0 min-h-0 min-w-0"
        />
      </Suspense>
      {ifcStatus?.status === "error" ? (
        <div className="absolute inset-0 z-10 flex flex-col justify-center gap-2 overflow-y-auto bg-zinc-950/85 p-3 text-xs text-zinc-100 backdrop-blur-sm">
          <p className="font-medium text-red-200">IFC preview could not load</p>
          <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-300">
            {ifcStatus.message || "Unknown error"}
          </p>
          <p className="text-[11px] text-zinc-400">
            Large models can take a long time. Try the full{" "}
            <Link href={buildingHref} className="font-medium text-cyan-300 underline">
              Building
            </Link>{" "}
            tab, or confirm{" "}
            <code className="rounded bg-zinc-800 px-1">data/{projectId}.ifc</code> exists.
          </p>
        </div>
      ) : null}
      {showHousePreloader ? (
        <BimIfcHousePreloader
          variant="overlay"
          message={
            ifcStatus?.status === "loading" && ifcStatus.message
              ? ifcStatus.message
              : "Loading IFC…"
          }
        />
      ) : null}
      {slowLoadHint && showHousePreloader ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center px-2">
          <p className="max-w-md rounded border border-amber-500/40 bg-amber-950/90 px-2 py-1 text-center text-[10px] text-amber-100">
            Still loading a large IFC — this can take several minutes.{" "}
            <Link href={buildingHref} className="pointer-events-auto font-medium underline">
              Open Building view
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
