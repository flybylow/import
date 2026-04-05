"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PassportBatchOverview from "@/components/PassportBatchOverview";
import PassportIfcMiniPreview from "@/features/bim-viewer/components/PassportIfcMiniPreview";
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

  /** IFC type-column group: all filtered expressIds → `BuildingIfcViewer` `focusExpressIds`. */
  const [typeGroupExpressIds, setTypeGroupExpressIds] = useState<number[] | null>(null);

  const handleSelectTypeGroup = useCallback((ids: number[]) => {
    setTypeGroupExpressIds((prev) => {
      if (ids.length === 0) return prev === null ? prev : null;
      if (
        prev !== null &&
        prev.length === ids.length &&
        prev.every((v, i) => v === ids[i])
      ) {
        return prev;
      }
      return [...ids];
    });
  }, []);

  const handleSelectExpressId = useCallback(
    (id: number | null) => {
      setTypeGroupExpressIds(null);
      onSelectExpressId(id);
    },
    [onSelectExpressId]
  );

  useEffect(() => {
    if (selectedExpressId != null) {
      setTypeGroupExpressIds(null);
    }
  }, [selectedExpressId]);

  const viewerItems = useMemo<ViewerItem[]>(() => {
    const rows: ViewerItem[] = [];
    for (const p of passportsOrdered) {
      const ex = p.expressId ?? p.elementId;
      if (!Number.isFinite(ex)) continue;
      rows.push({
        expressId: Number(ex),
        label: p.elementName ?? `element-${p.elementId}`,
        ifcType: p.ifcType,
        globalId: p.globalId,
        heightHint: p.ifcQuantities.find((q) => q.quantityName === "Height")?.value,
      });
    }
    return rows;
  }, [passportsOrdered]);

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
   * Selection: URL ↔ `selectedExpressId` → IFC preview, finder, materials/quantities sidebar; fire snapshot → separate page.
   */

  return (
    <div
      className={`flex w-full flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-6 ${className}`.trim()}
    >
      {/* Left: folded batch stats + IFC preview */}
      <section
        className="flex w-full min-w-0 shrink-0 flex-col gap-2 lg:max-w-md xl:max-w-lg"
        aria-label="Passport overview and IFC preview"
      >
        {selectedMissingFromPassportBatch ? (
          <div className="shrink-0 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <code className="font-mono">{selectedExpressId}</code> is outside this
            loaded passport slice (API cap / order). IFC preview may still show geometry.{" "}
            <Link
              href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
              className="font-medium underline"
            >
              Building
            </Link>
            {" · "}
            <code className="font-mono">elementPassportsLimit</code>
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
          className={`flex h-[min(48dvh,26rem)] min-h-[14rem] w-full shrink-0 flex-col overflow-hidden sm:min-h-[16rem] ${DETAIL_CARD}`}
        >
          <header className="shrink-0 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
              IFC preview
            </h2>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              URL / element row = one focus; IFC type column = all instances in this batch (group). Click
              mesh to pick one.{" "}
              <Link
                href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
                className="font-medium text-violet-700 underline dark:text-violet-300"
              >
                Building
              </Link>{" "}
              for full view.
            </p>
          </header>
          {viewerItems.length ? (
            <PassportIfcMiniPreview
              projectId={projectId}
              focusExpressId={selectedExpressId}
              focusExpressIds={
                typeGroupExpressIds != null && typeGroupExpressIds.length > 0
                  ? typeGroupExpressIds
                  : null
              }
              onSelectExpressId={handleSelectExpressId}
              className="min-h-[12rem] flex-1 border-t-0"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {loading
                ? "Loading…"
                : kbMissing
                  ? "No KB — nothing to show."
                  : "No rows in this passport batch."}
            </div>
          )}
        </div>
      </section>

      {/* Right: finder, snapshot, detail panels */}
      <section
        className="flex w-full min-w-0 flex-1 flex-col gap-3 lg:min-w-0 lg:flex-[2]"
        aria-label="Passport element workspace"
      >
        {viewerItems.length ? (
          <div
            className={`flex min-h-[min(72dvh,40rem)] w-full min-w-0 flex-col overflow-hidden ${DETAIL_CARD}`}
          >
            <div className="min-h-[min(28vh,17rem)] max-h-[min(58vh,36rem)] min-w-0 flex-1 shrink-0 overflow-hidden">
              <PassportElementFinder
                projectId={projectId}
                items={viewerItems}
                selectedExpressId={selectedExpressId}
                onSelectExpressId={handleSelectExpressId}
                onSelectTypeGroup={handleSelectTypeGroup}
                disabled={loading}
                passportByExpressId={passportByExpressId}
                className="h-full min-h-0 w-full max-h-full rounded-none border-0 bg-transparent dark:bg-transparent"
              />
            </div>
            <div className="max-h-[min(38dvh,22rem)] min-h-0 shrink-0 overflow-y-auto overflow-x-hidden border-t border-zinc-200/80 dark:border-zinc-800">
              <ElementPassportPanel
                projectId={projectId}
                passport={selectedPassport}
                selectedExpressId={selectedExpressId}
                onClearSelection={() => handleSelectExpressId(null)}
                showIdentity={false}
                embedded
                className="min-w-0 w-full"
              />
              <ElementPassportQuantitiesPanel
                passport={selectedPassport}
                selectedExpressId={selectedExpressId}
                embedded
                className="min-w-0 w-full"
              />
            </div>
          </div>
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
