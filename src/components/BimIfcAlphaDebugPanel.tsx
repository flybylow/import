"use client";

import { useEffect, useState, type RefObject } from "react";
import type {
  BuildingIfcAlphaDiagSnapshot,
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
  /** That Open Highlighter multi-style overlay demo (Building view + type group with ≥6 ids). */
  highlighterOverlayDemoOn: boolean;
  onHighlighterOverlayDemoOnChange: (on: boolean) => void;
};

function BugIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 9a3 3 0 0 1 6 0v1H9V9z" />
      <path d="M8 10H5a2 2 0 0 0-2 2v1h4" />
      <path d="M16 10h3a2 2 0 0 1 2 2v1h-4" />
      <path d="M8 14H4v1a2 2 0 0 0 2 2h2" />
      <path d="M16 14h4v1a2 2 0 0 1-2 2h-2" />
      <path d="M12 5V3" />
      <path d="M9 5 8 3" />
      <path d="M15 5l1-2" />
    </svg>
  );
}

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
  highlighterOverlayDemoOn,
  onHighlighterOverlayDemoOnChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [liveAlpha, setLiveAlpha] = useState<{
    stress: boolean;
    diag: BuildingIfcAlphaDiagSnapshot | null;
  }>({ stress: false, diag: null });

  useEffect(() => {
    const sample = () => {
      const snap = viewerRef.current?.getAlphaDebugSnapshot() as
        | {
            fragmentsOpacityStress?: boolean;
            alphaDiag?: BuildingIfcAlphaDiagSnapshot;
          }
        | undefined;
      if (!snap) {
        setLiveAlpha({ stress: false, diag: null });
        return;
      }
      setLiveAlpha({
        stress: Boolean(snap.fragmentsOpacityStress),
        diag: snap.alphaDiag ?? null,
      });
    };
    sample();
    const id = window.setInterval(sample, 450);
    return () => window.clearInterval(id);
  }, [viewerRef]);

  const idsPreview =
    visualizerExpressIds != null && visualizerExpressIds.length > 0
      ? visualizerExpressIds.length <= 4
        ? visualizerExpressIds.join(",")
        : `${visualizerExpressIds.slice(0, 4).join(",")}+${visualizerExpressIds.length - 4}`
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

  const modeChip =
    liveAlpha.stress ? (
      <span className="rounded border border-red-500/50 bg-red-950/85 px-1.5 py-0.5 font-medium text-red-100">
        Stress
      </span>
    ) : liveAlpha.diag?.intentKind === "uniform" ? (
      <span className="rounded border border-cyan-500/40 bg-cyan-950/80 px-1.5 py-0.5 font-medium text-cyan-100">
        Ghost{" "}
        {liveAlpha.diag.uniformGhostOpacity != null
          ? `· ${liveAlpha.diag.uniformGhostOpacity.toFixed(2)}`
          : ""}
      </span>
    ) : (
      <span className="rounded border border-zinc-500/50 bg-zinc-900/85 px-1.5 py-0.5 font-medium text-zinc-200">
        Normal
      </span>
    );

  const lastEventShort =
    liveAlpha.diag?.lastEventLabel && liveAlpha.diag.lastEventAtMs > 0
      ? `${new Date(liveAlpha.diag.lastEventAtMs).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })} · ${liveAlpha.diag.lastEventLabel.length > 52 ? `${liveAlpha.diag.lastEventLabel.slice(0, 50)}…` : liveAlpha.diag.lastEventLabel}`
      : null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-end p-2 pt-6"
      aria-label="IFC debug"
    >
      <div className="pointer-events-auto flex flex-col items-end gap-1">
        {!expanded ? (
          <div className="flex max-w-[min(100vw-1rem,18rem)] flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {modeChip}
              <button
                type="button"
                onClick={() => {
                  console.log("[bim-ifc-alpha-debug-panel] toggle: expand");
                  setExpanded(true);
                }}
                title={lastEventShort ?? "IFC alpha / ghost debug"}
                aria-expanded={false}
                aria-label="Open IFC debug panel"
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-md backdrop-blur-sm transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  wholeGraphAlphaOn
                    ? "border-amber-500 bg-amber-200/95 text-amber-950 dark:bg-amber-900/90 dark:text-amber-50"
                    : "border-zinc-400/80 bg-zinc-100/95 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-200"
                }`}
              >
                <BugIcon className="shrink-0" />
                {wholeGraphAlphaOn ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-white dark:ring-zinc-900"
                    aria-hidden
                  />
                ) : null}
              </button>
            </div>
            {lastEventShort ? (
              <p
                className="text-right text-[9px] leading-tight text-zinc-500 dark:text-zinc-400"
                title={liveAlpha.diag?.lastEventLabel}
              >
                {lastEventShort}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="w-[min(100vw-1rem,15rem)] rounded-md border border-amber-500/50 bg-amber-50/98 p-2 text-[10px] shadow-lg backdrop-blur-sm dark:border-amber-700/60 dark:bg-zinc-900/98 dark:text-zinc-100">
            <div className="mb-1.5 flex items-center justify-between gap-1 border-b border-amber-200/80 pb-1 dark:border-zinc-700">
              <span className="font-semibold text-amber-950 dark:text-amber-100">IFC debug</span>
              <button
                type="button"
                onClick={() => {
                  console.log("[bim-ifc-alpha-debug-panel] toggle: collapse");
                  setExpanded(false);
                }}
                className="rounded px-1 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Minimize debug panel"
              >
                Hide
              </button>
            </div>
            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 font-mono leading-tight text-zinc-700 dark:text-zinc-300">
              <dt className="text-zinc-500 dark:text-zinc-500">pid</dt>
              <dd className="min-w-0 truncate" title={projectId}>
                {projectId}
              </dd>
              <dt className="text-zinc-500">view</dt>
              <dd>{viewQuery}</dd>
              <dt className="text-zinc-500">ifc</dt>
              <dd>{ifcSource}</dd>
              <dt className="text-zinc-500">st</dt>
              <dd>{ifcStatus?.status ?? "—"}</dd>
              <dt className="text-zinc-500">exp</dt>
              <dd>{selectedExpressId ?? "—"}</dd>
              <dt className="text-zinc-500">grp</dt>
              <dd className="min-w-0 truncate" title={visualizerActiveKey ?? ""}>
                {visualizerActiveKey ?? "—"}
              </dd>
              <dt className="text-zinc-500">ids</dt>
              <dd className="min-w-0 break-all">{idsPreview}</dd>
              <dt className="text-zinc-500">ovr</dt>
              <dd>{highlighterOverlayDemoOn ? "on" : "off"}</dd>
            </dl>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded border border-amber-600/70 bg-amber-100/90 px-1.5 py-1 text-left text-[10px] font-medium text-amber-950 hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-50 dark:hover:bg-amber-900/80"
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
                {wholeGraphAlphaOn ? "Reset alpha" : "Ghost / alpha"}
              </button>
              <button
                type="button"
                className="rounded border border-zinc-400/80 px-1.5 py-1 text-left text-[10px] font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => {
                  logPanel("click: dump viewer debug state");
                  const snap =
                    viewerRef.current != null ? viewerRef.current.getAlphaDebugSnapshot() : null;
                  console.log("[bim-ifc-alpha-debug-panel] snapshot", snap);
                }}
              >
                Log snapshot
              </button>
              <button
                type="button"
                disabled={viewQuery !== "building"}
                title={
                  viewQuery === "building"
                    ? "Amber = first 3 ids, violet = last 3 (needs material group with ≥6 instances)"
                    : "Open Building view and load a material group (≥6 instances)"
                }
                className="rounded border border-cyan-700/50 bg-cyan-50/90 px-1.5 py-1 text-left text-[10px] font-medium text-cyan-950 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-100 dark:hover:bg-cyan-900/70"
                onClick={() => {
                  const next = !highlighterOverlayDemoOn;
                  logPanel("click: highlighter overlay demo", { on: next });
                  onHighlighterOverlayDemoOnChange(next);
                }}
              >
                {highlighterOverlayDemoOn ? "Clear Highlighter groups" : "Highlighter 2-group demo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
