"use client";

import Link from "next/link";
import { useMemo } from "react";
import BimViewer3D from "@/components/BimViewer3D";
import PassportBatchOverview from "@/components/PassportBatchOverview";
import ElementPassportPanel from "@/components/ElementPassportPanel";
import ElementPassportQuantitiesPanel from "@/components/ElementPassportQuantitiesPanel";
import PassportElementFinder from "@/components/PassportElementFinder";
import { PassportPreviewSnapshot } from "@/components/PassportPreviewSnapshot";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

type ViewerItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  globalId?: string;
  heightHint?: number;
};

type Props = {
  projectId: string;
  loading: boolean;
  kbMissing: boolean;
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
  passportByExpressId: Record<number, Phase4ElementPassport>;
  passportsOrdered: Phase4ElementPassport[];
  /** Total passports in KB (may exceed loaded batch). */
  passportTotal: number;
  /** IFC element count in KB graph from status, when present. */
  loadedElementCountInKb?: number;
  className?: string;
};

/** Shared chrome for cards on the details column */
const DETAIL_CARD =
  "rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";

export default function PassportModelView(props: Props) {
  const {
    projectId,
    loading,
    kbMissing,
    selectedExpressId,
    onSelectExpressId,
    passportByExpressId,
    passportsOrdered,
    passportTotal,
    loadedElementCountInKb,
    className = "",
  } = props;

  const viewerItems = useMemo<ViewerItem[]>(
    () =>
      passportsOrdered.map((p) => ({
        expressId: p.expressId ?? p.elementId,
        label: p.elementName ?? `element-${p.elementId}`,
        ifcType: p.ifcType,
        globalId: p.globalId,
        heightHint: p.ifcQuantities.find((q) => q.quantityName === "Height")
          ?.value,
      })),
    [passportsOrdered]
  );

  /** Up to 600 boxes; always include `selectedExpressId` so URL deep links can focus the camera. */
  const VIEWER_3D_CAP = 600;
  const viewerItemsFor3d = useMemo(() => {
    const base = viewerItems.slice(0, VIEWER_3D_CAP);
    if (selectedExpressId == null) return base;
    if (base.some((x) => x.expressId === selectedExpressId)) return base;
    const extra = viewerItems.find((x) => x.expressId === selectedExpressId);
    if (!extra) return base;
    return [extra, ...base.slice(0, VIEWER_3D_CAP - 1)];
  }, [viewerItems, selectedExpressId]);

  const selectedMissingFromPassportBatch =
    selectedExpressId != null &&
    viewerItems.length > 0 &&
    !passportByExpressId[selectedExpressId];

  const selectedPassport = useMemo(
    () =>
      selectedExpressId != null
        ? (passportByExpressId[selectedExpressId] ?? null)
        : null,
    [passportByExpressId, selectedExpressId]
  );

  /**
   * Data flow (single selection pipeline):
   * `selectedExpressId` (URL ↔ parent) → abstract 3D + finder highlight + `passportByExpressId[id]` → detail cards.
   */

  return (
    <div
      className={`flex w-full flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-6 ${className}`.trim()}
    >
      {/* —— Left ~⅓: overview + abstract spatial preview —— */}
      <section
        className="flex w-full min-w-0 shrink-0 flex-col gap-2 lg:max-w-md xl:max-w-lg"
        aria-label="Passport overview and spatial preview"
      >
        {selectedMissingFromPassportBatch ? (
          <div className="shrink-0 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            expressId{" "}
            <code className="font-mono">{selectedExpressId}</code> is not in this
            passport batch (API limit / ordering). This preview cannot place it — open{" "}
            <Link
              href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
              className="font-medium underline"
            >
              Building
            </Link>{" "}
            for IFC mesh, or raise{" "}
            <code className="font-mono">elementPassportsLimit</code> in the API.
          </div>
        ) : null}

        {viewerItems.length ? (
          <PassportBatchOverview
            passportsOrdered={passportsOrdered}
            batchCount={passportsOrdered.length}
            passportTotal={passportTotal}
            elementCountInKb={loadedElementCountInKb}
            className="w-full shrink-0"
          />
        ) : null}

        <div
          className={`flex h-[min(42dvh,22rem)] min-h-[12rem] w-full shrink-0 flex-col overflow-hidden sm:min-h-[14rem] ${DETAIL_CARD}`}
        >
          <header className="shrink-0 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
              Spatial preview
            </h2>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              Ghost boxes for the batch; the selected element is opaque. One box per row in the loaded
              slice (not IFC mesh).{" "}
              <Link
                href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
                className="font-medium text-violet-700 underline dark:text-violet-300"
              >
                Building
              </Link>{" "}
              /{" "}
              <Link
                href={`/bim?projectId=${encodeURIComponent(projectId)}&view=3dtest`}
                className="font-medium text-violet-700 underline dark:text-violet-300"
              >
                3D sample
              </Link>{" "}
              for real geometry.
            </p>
          </header>
          {viewerItems.length ? (
            <BimViewer3D
              items={viewerItemsFor3d}
              selectedExpressId={selectedExpressId}
              onSelectExpressId={(id) => onSelectExpressId(id)}
              className="min-h-0 min-h-[12rem] flex-1 border-t-0"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {loading
                ? "Loading preview…"
                : kbMissing
                  ? "No KB — nothing to draw."
                  : "No rows in this passport batch."}
            </div>
          )}
        </div>
      </section>

      {/* —— Right ~⅔: finder + inspect / quantities —— */}
      <section
        className="flex w-full min-w-0 flex-1 flex-col gap-3 lg:min-w-0 lg:flex-[2]"
        aria-label="Passport element workspace"
      >
        {viewerItems.length ? (
          <>
            <div className={`flex w-full min-h-0 flex-col overflow-hidden ${DETAIL_CARD}`}>
              <header className="shrink-0 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
                <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                  Find element
                </h2>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Chooses <code className="rounded bg-zinc-100 px-0.5 font-mono dark:bg-zinc-900">expressId</code>{" "}
                  → URL, spatial preview, and tiles below. The third finder column is a quick glance; full passport
                  (materials &amp; EPD) is in <span className="font-medium text-zinc-600 dark:text-zinc-300">Passport snapshot</span>{" "}
                  under the grid.
                </p>
              </header>
              <div className="min-h-0 max-h-[min(40vh,22rem)] shrink-0 overflow-hidden">
                <PassportElementFinder
                  items={viewerItems}
                  selectedExpressId={selectedExpressId}
                  onSelectExpressId={onSelectExpressId}
                  disabled={loading}
                  passportByExpressId={passportByExpressId}
                  className="h-full max-h-[min(40vh,22rem)] w-full rounded-none border-0 bg-transparent dark:bg-transparent"
                />
              </div>

              <div className="flex min-h-[min(42dvh,26rem)] flex-1 flex-col border-t border-zinc-200 dark:border-zinc-800">
                <header className="shrink-0 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
                  <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">Passport snapshot</h2>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                    Same KB row as <span className="font-medium text-zinc-600 dark:text-zinc-300">Element details</span>{" "}
                    — identity, materials, GWP hint, and EPD registry fields. Uses the full width of this column.
                  </p>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {selectedExpressId == null ? (
                    <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Select an element in the finder or click a box in the spatial preview. The URL{" "}
                      <code className="rounded bg-zinc-100 px-0.5 font-mono text-[10px] dark:bg-zinc-900">
                        expressId
                      </code>{" "}
                      drives this panel too.
                    </p>
                  ) : selectedMissingFromPassportBatch ? (
                    <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-100">
                      No passport row for <code className="font-mono">expressId {selectedExpressId}</code> in this
                      batch. See the left-column banner or open{" "}
                      <Link
                        href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
                        className="font-medium underline"
                      >
                        Building
                      </Link>
                      .
                    </p>
                  ) : selectedPassport ? (
                    <PassportPreviewSnapshot passport={selectedPassport} />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0">
                <ElementPassportPanel
                  projectId={projectId}
                  passport={selectedPassport}
                  selectedExpressId={selectedExpressId}
                  onClearSelection={() => onSelectExpressId(null)}
                  className="min-w-0 w-full"
                />
              </div>
              <div className="min-w-0">
                <ElementPassportQuantitiesPanel
                  passport={selectedPassport}
                  selectedExpressId={selectedExpressId}
                  className="min-w-0 w-full"
                />
              </div>
            </div>
          </>
        ) : (
          <div
            className={`flex min-h-[6rem] w-full flex-col items-center justify-center px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400 ${DETAIL_CARD}`}
          >
            {loading
              ? "Loading workspace…"
              : kbMissing
                ? "No KB — list empty."
                : "No passport rows."}
          </div>
        )}
      </section>
    </div>
  );
}
