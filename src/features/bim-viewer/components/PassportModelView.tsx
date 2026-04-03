"use client";

import Link from "next/link";
import { useMemo } from "react";
import BimViewer3D from "@/components/BimViewer3D";
import ElementPassportPanel from "@/components/ElementPassportPanel";
import ElementPassportQuantitiesPanel from "@/components/ElementPassportQuantitiesPanel";
import PassportElementFinder from "@/components/PassportElementFinder";
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
  className?: string;
};

export default function PassportModelView(props: Props) {
  const {
    projectId,
    loading,
    kbMissing,
    selectedExpressId,
    onSelectExpressId,
    passportByExpressId,
    passportsOrdered,
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

  return (
    <div
      className={`grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] xl:grid-rows-[minmax(0,1fr)] ${className}`.trim()}
    >
      {/* Left: Finder (full height) + passport */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-3">
        {viewerItems.length ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden xl:h-full xl:min-h-0 xl:max-h-full">
            {selectedMissingFromPassportBatch ? (
              <div className="shrink-0 rounded border border-amber-300/80 bg-amber-50 px-2 py-2 text-[11px] text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                expressId{" "}
                <code className="font-mono">{selectedExpressId}</code> is not in
                this passport batch (API limit / ordering). Abstract 3D cannot place
                it — open{" "}
                <Link
                  href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
                  className="font-medium underline"
                >
                  Building
                </Link>{" "}
                for the IFC mesh, or raise{" "}
                <code className="font-mono">elementPassportsLimit</code> / filter in
                the API.
              </div>
            ) : null}
            <div className="flex min-h-[min(36dvh,14rem)] shrink-0 flex-col gap-1">
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Abstract 3D (one box per element in the slice below; selection syncs
                with URL and columns).
              </p>
              <BimViewer3D
                items={viewerItemsFor3d}
                selectedExpressId={selectedExpressId}
                onSelectExpressId={(id) => onSelectExpressId(id)}
                className="min-h-0 min-h-[12rem] flex-1"
              />
            </div>
            <PassportElementFinder
              items={viewerItems}
              selectedExpressId={selectedExpressId}
              onSelectExpressId={onSelectExpressId}
              disabled={loading}
              passportByExpressId={passportByExpressId}
              className="min-h-0 flex-1"
            />
          </div>
        ) : (
          <div className="flex max-h-48 min-h-[4rem] flex-col justify-center rounded border border-dashed border-zinc-200 px-2 py-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {loading
              ? "Loading…"
              : kbMissing
                ? "No KB — list empty."
                : "No rows."}
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto xl:h-full xl:min-h-0 xl:max-h-full">
          <details className="group shrink-0 rounded border border-zinc-200 bg-white text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
            <summary className="cursor-pointer list-none px-3 py-2 font-medium text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
              Passports vs 3D (fold)
              <span className="ml-2 font-normal text-[10px] text-zinc-400 group-open:hidden">
                open for note
              </span>
            </summary>
            <div className="border-t border-zinc-200 px-3 pb-2 pt-1 text-[11px] leading-snug dark:border-zinc-800">
              Finder + panels = KB only. The grid above is an abstract preview (not
              IFC mesh). For the real building use{" "}
              <Link
                href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
                className="font-medium text-violet-700 underline dark:text-violet-300"
              >
                Building
              </Link>{" "}
              or{" "}
              <Link
                href={`/bim?projectId=${encodeURIComponent(projectId)}&view=3dtest`}
                className="font-medium text-violet-700 underline dark:text-violet-300"
              >
                3D sample
              </Link>{" "}
              (IFC + That Open).
            </div>
          </details>
          <ElementPassportPanel
            passport={selectedPassport}
            selectedExpressId={selectedExpressId}
            onClearSelection={() => onSelectExpressId(null)}
          />
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto xl:h-full xl:max-h-full">
        <ElementPassportQuantitiesPanel
          passport={selectedPassport}
          selectedExpressId={selectedExpressId}
        />
      </aside>
    </div>
  );
}
