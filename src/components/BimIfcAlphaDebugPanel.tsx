"use client";

import type { RefObject } from "react";
import type {
  BuildingIfcViewerHandle,
  BuildingIfcViewerStatusPayload,
} from "@/features/bim-viewer/components/BuildingIfcViewer";

type Props = {
  viewerRef: RefObject<BuildingIfcViewerHandle | null>;
  projectId: string;
  viewQuery: string;
  ifcSource: "project" | "test";
  selectedExpressId: number | null;
  visualizerExpressIds: number[] | null;
  visualizerActiveKey: string | null;
  ifcStatus: BuildingIfcViewerStatusPayload | null;
  wholeGraphAlphaOn: boolean;
  onWholeGraphAlphaOnChange: (on: boolean) => void;
};

export default function BimIfcAlphaDebugPanel({
  viewerRef,
  projectId,
  viewQuery,
  ifcSource,
  selectedExpressId,
  visualizerExpressIds,
  visualizerActiveKey,
  ifcStatus,
  wholeGraphAlphaOn,
  onWholeGraphAlphaOnChange,
}: Props) {
  const idsPreview =
    visualizerExpressIds != null && visualizerExpressIds.length > 0
      ? visualizerExpressIds.length <= 6
        ? visualizerExpressIds.join(", ")
        : `${visualizerExpressIds.slice(0, 6).join(", ")}… (${visualizerExpressIds.length} total)`
      : "—";

  const logPanel = (action: string, detail?: Record<string, unknown>) => {
    console.log("[bim-ifc-alpha-debug-panel]", action, {
      ...detail,
      projectId,
      view: viewQuery,
      ifcSource,
      selectedExpressId,
      groupCount: visualizerExpressIds?.length ?? 0,
      visualizerActiveKey,
      ifcStatus: ifcStatus?.status ?? null,
      wholeGraphAlphaOn,
    });
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end p-3 pt-8"
      aria-label="IFC alpha debug"
    >
      <div className="pointer-events-auto w-full max-w-[22rem] rounded-lg border border-amber-400/70 bg-amber-50/95 p-3 text-xs shadow-lg backdrop-blur-sm dark:border-amber-700/80 dark:bg-zinc-900/95 dark:text-zinc-100">
        <div className="mb-2 font-semibold text-amber-950 dark:text-amber-100">
          IFC · alpha / ghost debug
        </div>
        <dl className="mb-3 space-y-1 font-mono text-[11px] leading-snug text-zinc-800 dark:text-zinc-200">
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">projectId</dt>
            <dd className="min-w-0 break-all">{projectId}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">view</dt>
            <dd>{viewQuery}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">ifcSource</dt>
            <dd>{ifcSource}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">viewer</dt>
            <dd>{ifcStatus?.status ?? "—"}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">expressId</dt>
            <dd>{selectedExpressId ?? "—"}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">group key</dt>
            <dd className="min-w-0 break-all">{visualizerActiveKey ?? "—"}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">group ids</dt>
            <dd className="min-w-0 break-all">{idsPreview}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded border border-amber-600/80 bg-amber-100 px-2 py-1.5 text-left text-[11px] font-medium text-amber-950 hover:bg-amber-200 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-900/70"
            onClick={() => {
              if (wholeGraphAlphaOn) {
                logPanel("click: deactivate whole-graph alpha");
                void viewerRef.current?.resetFullVisuals().then(() => {
                  onWholeGraphAlphaOnChange(false);
                  console.log("[bim-ifc-alpha-debug-panel] resetFullVisuals settled");
                });
                return;
              }
              logPanel("click: activate whole-graph alpha (ghost all geometry)");
              void viewerRef.current?.activateWholeGraphAlpha().then(() => {
                onWholeGraphAlphaOnChange(true);
                console.log("[bim-ifc-alpha-debug-panel] activateWholeGraphAlpha settled");
              });
            }}
          >
            {wholeGraphAlphaOn
              ? "Deactivate whole-graph alpha (reset visuals)"
              : "Activate Ghost or Alpha Mode"}
          </button>
          <button
            type="button"
            className="rounded border border-zinc-400 px-2 py-1.5 text-left text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              logPanel("click: dump viewer debug state");
              const snap =
                viewerRef.current != null ? viewerRef.current.getAlphaDebugSnapshot() : null;
              console.log("[bim-ifc-alpha-debug-panel] snapshot", snap);
            }}
          >
            Log viewer state to console
          </button>
        </div>
      </div>
    </div>
  );
}
