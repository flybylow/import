"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PassportBatchOverview from "@/components/PassportBatchOverview";
import PassportIfcMiniPreview from "@/features/bim-viewer/components/PassportIfcMiniPreview";
import ElementPassportPanel from "@/components/ElementPassportPanel";
import ElementPassportQuantitiesPanel from "@/components/ElementPassportQuantitiesPanel";
import PassportElementFinder from "@/components/PassportElementFinder";
import {
  passportTypeGroupKeyFromRow,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";

type ViewerItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  /** Finder column + `?group=` when subdividing coarse IFC types (e.g. `IfcCovering · betontegels`). */
  typeGroupKey: string;
  globalId?: string;
  heightHint?: number;
};

export type PassportNavigatePatch = {
  expressId?: number | null;
  groupKey?: string | null;
};

type Props = {
  projectId: string;
  loading: boolean;
  kbMissing: boolean;
  selectedExpressId: number | null;
  /** `?group=` from the URL (IFC type key); used when there is no `expressId`. */
  passportGroupFromUrl?: string;
  onPassportNavigate: (patch: PassportNavigatePatch) => void;
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
    passportGroupFromUrl = "",
    onPassportNavigate,
    passportByExpressId,
    passportsOrdered,
    passportTotal,
    loadedElementCountInKb,
    className = "",
  } = props;

  /** IFC type-column group: all filtered expressIds → `BuildingIfcViewer` `focusExpressIds`. */
  const [typeGroupExpressIds, setTypeGroupExpressIds] = useState<number[] | null>(null);

  const viewerItems = useMemo<ViewerItem[]>(() => {
    const rows: ViewerItem[] = [];
    for (const p of passportsOrdered) {
      const ex = p.expressId ?? p.elementId;
      if (!Number.isFinite(ex)) continue;
      rows.push({
        expressId: Number(ex),
        label: p.elementName ?? `element-${p.elementId}`,
        ifcType: p.ifcType,
        typeGroupKey: passportTypeGroupKeyFromRow(p),
        globalId: p.globalId,
        heightHint: p.ifcQuantities.find((q) => q.quantityName === "Height")?.value,
      });
    }
    return rows;
  }, [passportsOrdered]);

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
      if (id == null) {
        onPassportNavigate({ expressId: null });
        return;
      }
      const row = viewerItems.find((i) => i.expressId === id);
      onPassportNavigate({
        expressId: id,
        groupKey: row ? row.typeGroupKey : null,
      });
    },
    [onPassportNavigate, viewerItems]
  );

  const handleCommitGroupToUrl = useCallback(
    (groupKey: string) => {
      onPassportNavigate({ expressId: null, groupKey });
    },
    [onPassportNavigate]
  );

  useEffect(() => {
    if (selectedExpressId != null) {
      setTypeGroupExpressIds(null);
    }
  }, [selectedExpressId]);

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

  /** Skip empty bordered strip when the row has no materials and no quantities (amber “no row” still shows). */
  const showPassportBottomStrip =
    selectedExpressId != null &&
    (selectedPassport == null ||
      selectedPassport.materials.length > 0 ||
      selectedPassport.ifcQuantities.length > 0);

  /**
   * Selection: URL ↔ `selectedExpressId` → IFC preview, finder, materials/quantities sidebar; fire snapshot → separate page.
   */

  return (
    <div
      className={`flex min-h-0 w-full flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-stretch lg:gap-6 ${className}`.trim()}
    >
      {/* Left: folded batch stats + IFC preview */}
      <section
        className="flex w-full min-w-0 shrink-0 flex-col gap-2 lg:max-w-md lg:min-h-0 xl:max-w-lg"
        aria-label="Passport overview, IFC preview, and element takeoff"
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

        <div className={`flex w-full shrink-0 flex-col overflow-hidden ${DETAIL_CARD}`}>
          {viewerItems.length ? (
            <>
              <div className="flex h-[min(48dvh,26rem)] min-h-[14rem] w-full shrink-0 flex-col overflow-hidden sm:min-h-[16rem]">
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
              </div>
              {showPassportBottomStrip ? (
                <div className="max-h-[min(48dvh,30rem)] min-h-0 shrink-0 overflow-y-auto overflow-x-hidden border-t border-zinc-200/80 dark:border-zinc-800">
                  {selectedPassport ? (
                    <div className="border-b border-zinc-200/80 px-2 py-2 dark:border-zinc-800 sm:px-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Metadata
                      </p>
                      <dl className="mt-1 grid min-w-0 grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-zinc-800 dark:text-zinc-200">
                        <dt className="text-zinc-500 dark:text-zinc-400">expressId</dt>
                        <dd className="font-mono tabular-nums">{selectedExpressId}</dd>
                        <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
                        <dd className="min-w-0 break-words">
                          {selectedPassport.elementName?.trim() || "—"}
                        </dd>
                        <dt className="text-zinc-500 dark:text-zinc-400">IFC type</dt>
                        <dd className="min-w-0 break-words font-mono text-[10px]">
                          {selectedPassport.ifcType?.trim() || "—"}
                        </dd>
                        <dt className="text-zinc-500 dark:text-zinc-400">GlobalId</dt>
                        <dd className="min-w-0 break-all font-mono text-[10px]">
                          {selectedPassport.globalId?.trim() || "—"}
                        </dd>
                        {selectedPassport.ifcFireRating?.trim() ? (
                          <>
                            <dt className="text-zinc-500 dark:text-zinc-400">Fire</dt>
                            <dd className="min-w-0 break-words">{selectedPassport.ifcFireRating.trim()}</dd>
                          </>
                        ) : null}
                        {selectedPassport.ifcManufacturer?.trim() ? (
                          <>
                            <dt className="text-zinc-500 dark:text-zinc-400">Manufacturer</dt>
                            <dd className="min-w-0 break-words">{selectedPassport.ifcManufacturer.trim()}</dd>
                          </>
                        ) : null}
                        {selectedPassport.ifcModelLabel?.trim() ? (
                          <>
                            <dt className="text-zinc-500 dark:text-zinc-400">Model</dt>
                            <dd className="min-w-0 break-words">{selectedPassport.ifcModelLabel.trim()}</dd>
                          </>
                        ) : null}
                        {selectedPassport.ifcModelReference?.trim() ? (
                          <>
                            <dt className="text-zinc-500 dark:text-zinc-400">Model ref</dt>
                            <dd className="min-w-0 break-words font-mono text-[10px]">
                              {selectedPassport.ifcModelReference.trim()}
                            </dd>
                          </>
                        ) : null}
                        {selectedPassport.sameNameElementCount != null &&
                        selectedPassport.sameNameElementCount > 1 ? (
                          <>
                            <dt className="text-zinc-500 dark:text-zinc-400">Same name</dt>
                            <dd className="tabular-nums">
                              ×{selectedPassport.sameNameElementCount} in loaded batch
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}
                  <ElementPassportQuantitiesPanel
                    passport={selectedPassport}
                    selectedExpressId={selectedExpressId}
                    embedded
                    className="!min-w-0 !w-full !border-t-0 px-2 py-1 sm:px-3"
                  />
                  <ElementPassportPanel
                    projectId={projectId}
                    passport={selectedPassport}
                    selectedExpressId={selectedExpressId}
                    onClearSelection={() => handleSelectExpressId(null)}
                    showIdentity={false}
                    embedded
                    className="!min-w-0 !w-full !border-t-0 px-2 py-1 sm:px-3"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-[min(48dvh,26rem)] min-h-[14rem] flex-1 items-center justify-center px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400 sm:min-h-[16rem]">
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
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 lg:min-h-0 lg:min-w-0 lg:flex-[2]"
        aria-label="Passport element workspace"
      >
        {viewerItems.length ? (
          <div
            className={`flex h-full min-h-[min(48dvh,26rem)] w-full min-w-0 flex-1 flex-col overflow-hidden ${DETAIL_CARD}`}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden overscroll-y-contain">
              <PassportElementFinder
                projectId={projectId}
                items={viewerItems}
                selectedExpressId={selectedExpressId}
                onSelectExpressId={handleSelectExpressId}
                onSelectTypeGroup={handleSelectTypeGroup}
                onCommitGroupToUrl={handleCommitGroupToUrl}
                urlGroupKey={passportGroupFromUrl}
                disabled={loading}
                passportByExpressId={passportByExpressId}
                className="flex h-full min-h-0 w-full max-h-full flex-1 rounded-none border-0 bg-transparent dark:bg-transparent"
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
