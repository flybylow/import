"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PassportEpdRecordBlock } from "@/components/PassportEpdRecordBlock";
import { formatPassportMaterialGwpLine } from "@/lib/format-passport-material-gwp";
import {
  bimBuildingElementHref,
  bimPassportsElementHref,
  kbFocusMaterialHref,
  kbGraphElementHref,
  passportMaterialEpdLinks,
} from "@/lib/passport-navigation-links";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

/** Full detail per material in the narrow preview; overflow defers to sidebar. */
const PREVIEW_MATERIALS_MAX = 8;

export type FinderListItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  globalId?: string;
};

function typeKey(ifcType?: string) {
  const t = ifcType?.trim();
  return t && t.length > 0 ? t : "—";
}

const EMPTY_FINDER_COLUMN: FinderListItem[] = [];

type Props = {
  /** For “View fire snapshot” link to `/bim/passport-snapshot`. */
  projectId?: string;
  items: FinderListItem[];
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
  /**
   * IFC type column only: focus all filtered instances in the 3D preview (`focusExpressIds`).
   * Parent should clear this when a single element is selected or URL sets `expressId`.
   */
  onSelectTypeGroup?: (expressIds: number[]) => void;
  disabled?: boolean;
  /** Optional: richer preview (materials count, fire rating). */
  passportByExpressId?: Record<number, Phase4ElementPassport>;
  className?: string;
};

/**
 * Miller-column navigator: IFC type → instances → compact preview.
 * Filter applies to all columns (subset of elements before grouping).
 */
export default function PassportElementFinder(props: Props) {
  const {
    projectId = "",
    items,
    selectedExpressId,
    onSelectExpressId,
    onSelectTypeGroup,
    disabled,
    passportByExpressId,
    className = "",
  } = props;

  const [filterQ, setFilterQ] = useState("");
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);

  const activeTypeButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeElementButtonRef = useRef<HTMLButtonElement | null>(null);

  const filteredItems = useMemo(() => {
    const t = filterQ.trim().toLowerCase();
    if (!t) return items;
    return items.filter((item) => {
      const hay = [
        String(item.expressId),
        item.label,
        item.ifcType ?? "",
        item.globalId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
  }, [items, filterQ]);

  const { byType, sortedTypeKeys } = useMemo(() => {
    const m = new Map<string, FinderListItem[]>();
    for (const it of filteredItems) {
      const k = typeKey(it.ifcType);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.expressId - b.expressId);
    }
    const keys = [...m.keys()];
    keys.sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return a.localeCompare(b);
    });
    return { byType: m, sortedTypeKeys: keys };
  }, [filteredItems]);

  /** Keep type column aligned with URL / parent selection. */
  useEffect(() => {
    if (selectedExpressId == null) return;
    const row = items.find((i) => i.expressId === selectedExpressId);
    if (!row) return;
    const k = typeKey(row.ifcType);
    setSelectedTypeKey(k);
  }, [selectedExpressId, items]);

  /** If filter removes the selected type bucket, clear type or pick first remaining. */
  useEffect(() => {
    if (selectedTypeKey != null && !byType.has(selectedTypeKey)) {
      setSelectedTypeKey(sortedTypeKeys[0] ?? null);
    }
  }, [byType, selectedTypeKey, sortedTypeKeys]);

  const columnItems = useMemo(() => {
    if (selectedTypeKey == null) return EMPTY_FINDER_COLUMN;
    return byType.get(selectedTypeKey) ?? EMPTY_FINDER_COLUMN;
  }, [byType, selectedTypeKey]);

  /** Type-only selection: keep 3D group in sync when the filter narrows the instance list. */
  useEffect(() => {
    if (selectedExpressId != null) return;
    if (selectedTypeKey == null || !onSelectTypeGroup) return;
    onSelectTypeGroup(columnItems.map((i) => i.expressId));
  }, [
    selectedExpressId,
    selectedTypeKey,
    columnItems,
    onSelectTypeGroup,
  ]);

  const typeKeysSig = sortedTypeKeys.join("\0");

  /** Keep the selected IFC type and element row scrolled into view (URL sync, filter, long lists). */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (selectedTypeKey != null) {
        activeTypeButtonRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      }
      if (
        selectedExpressId != null &&
        columnItems.some((i) => i.expressId === selectedExpressId)
      ) {
        activeElementButtonRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [
    selectedExpressId,
    selectedTypeKey,
    filterQ,
    columnItems,
    typeKeysSig,
  ]);

  const previewItem =
    selectedExpressId != null
      ? items.find((i) => i.expressId === selectedExpressId)
      : null;
  const previewPassport =
    selectedExpressId != null && passportByExpressId
      ? (passportByExpressId[selectedExpressId] ?? null)
      : null;

  const colClass =
    "flex min-h-0 min-w-0 flex-col border-r border-zinc-200 bg-zinc-50 last:border-r-0 dark:border-zinc-800 dark:bg-zinc-950/40 @min-[28rem]:h-full @min-[28rem]:max-h-full";

  const listClass =
    "min-h-0 flex-1 overflow-y-auto p-0.5 max-h-[min(28vh,14rem)] @min-[28rem]:max-h-none";

  const finderTitle =
    "IFC type alone highlights every filtered instance in the 3D preview; pick an element for detail. Three columns: types, elements, preview. Filter narrows all columns. URL follows single-element selection.";

  return (
    <div
      className={`@container flex h-full min-h-0 w-full min-w-0 flex-col rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 ${className}`.trim()}
      aria-label="Elements: browse by IFC type and instance"
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-2 py-1 dark:border-zinc-800"
        title={finderTitle}
      >
        <span className="shrink-0 cursor-help text-xs font-semibold text-zinc-900 dark:text-zinc-50">
          Elements
        </span>
        <span className="hidden min-w-0 shrink truncate text-[10px] font-normal text-zinc-500 sm:inline dark:text-zinc-400">
          — type = group in 3D; element = detail
        </span>
        <label htmlFor="passport-finder-filter" className="sr-only">
          Filter by name, expressId, IFC type, or globalId
        </label>
        <input
          id="passport-finder-filter"
          type="search"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          disabled={disabled}
          placeholder="Filter…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <span
          className="shrink-0 text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400"
          aria-live="polite"
        >
          {filterQ.trim()
            ? `${filteredItems.length}/${items.length}`
            : items.length}
        </span>
      </div>

      <div className="grid min-h-0 w-full flex-1 grid-cols-1 divide-y divide-zinc-200 overflow-y-auto @min-[28rem]:grid-cols-3 @min-[28rem]:items-stretch @min-[28rem]:divide-x @min-[28rem]:divide-y-0 @min-[28rem]:overflow-hidden dark:divide-zinc-800">
        {/* Col 1 — IFC type */}
        <div className={colClass}>
          <div className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            IFC type
          </div>
          <ul className={listClass} aria-label="IFC types">
            {sortedTypeKeys.length === 0 ? (
              <li className="px-2 py-2 text-[10px] text-zinc-500">
                No types match the filter.
              </li>
            ) : (
              sortedTypeKeys.map((key) => {
                const count = byType.get(key)?.length ?? 0;
                const active = selectedTypeKey === key;
                return (
                  <li key={key}>
                    <button
                      ref={active ? activeTypeButtonRef : undefined}
                      type="button"
                      disabled={disabled}
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setSelectedTypeKey(key);
                        const nextList = byType.get(key) ?? [];
                        onSelectTypeGroup?.(nextList.map((i) => i.expressId));
                        onSelectExpressId(null);
                      }}
                      className={[
                        "flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[10px] transition-colors",
                        active
                          ? "bg-violet-50 font-medium text-violet-900 ring-1 ring-violet-500 dark:bg-violet-950/40 dark:text-violet-100 dark:ring-violet-400"
                          : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900",
                        disabled ? "pointer-events-none opacity-50" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="min-w-0 truncate font-mono">{key}</span>
                      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {count}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Col 2 — instances */}
        <div className={colClass}>
          <div className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            Elements
          </div>
          <ul className={listClass} aria-label="Elements for selected IFC type">
            {selectedTypeKey == null ? (
              <li className="px-2 py-2 text-[10px] text-zinc-500">
                Select an IFC type in the first column.
              </li>
            ) : columnItems.length === 0 ? (
              <li className="px-2 py-2 text-[10px] text-zinc-500">
                No elements in this type for the current filter.
              </li>
            ) : (
              columnItems.map((item) => {
                const active = selectedExpressId === item.expressId;
                return (
                  <li key={item.expressId}>
                    <button
                      ref={active ? activeElementButtonRef : undefined}
                      type="button"
                      disabled={disabled}
                      aria-current={active ? "true" : undefined}
                      aria-label={
                        item.ifcType
                          ? `${item.label} - ${item.ifcType}, expressId ${item.expressId}`
                          : `${item.label}, expressId ${item.expressId}`
                      }
                      title={`expressId ${item.expressId}${item.globalId ? ` · ${item.globalId}` : ""}`}
                      onClick={() => onSelectExpressId(item.expressId)}
                      className={[
                        "flex w-full max-w-full items-center rounded px-1.5 py-1 text-left text-[10px] leading-snug transition-colors",
                        active
                          ? "bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/35 dark:ring-violet-400"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-900",
                        disabled ? "pointer-events-none opacity-50" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {item.label}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Col 3 — preview */}
        <div className={`${colClass} border-r-0`}>
          <div className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            Preview
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-[10px] text-zinc-700 dark:text-zinc-200 max-h-[min(28vh,14rem)] @min-[28rem]:max-h-none">
            {!previewItem &&
            selectedExpressId == null &&
            selectedTypeKey != null &&
            columnItems.length > 0 ? (
              <div className="space-y-1 text-zinc-600 dark:text-zinc-300">
                <p className="font-medium text-zinc-800 dark:text-zinc-100">
                  IFC type group
                </p>
                <p>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{selectedTypeKey}</span>
                  {" · "}
                  <span className="tabular-nums">{columnItems.length}</span> instance
                  {columnItems.length === 1 ? "" : "s"} in this filter
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  Highlighted together in the IFC preview. Pick one in the middle column for passport
                  detail and links.
                </p>
              </div>
            ) : !previewItem ? (
              <p className="text-zinc-500 dark:text-zinc-400">
                Choose an IFC type (group in 3D) or an element for detail.
              </p>
            ) : (
              <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                <dt className="text-zinc-500">expressId</dt>
                <dd className="min-w-0 break-words font-mono text-zinc-900 dark:text-zinc-100">
                  {previewItem.expressId}
                </dd>
                <dt className="text-zinc-500">name</dt>
                <dd className="min-w-0 break-words">{previewItem.label}</dd>
                <dt className="text-zinc-500">ifcType</dt>
                <dd className="min-w-0 break-words font-mono">{previewItem.ifcType ?? "—"}</dd>
                <dt className="text-zinc-500">globalId</dt>
                <dd className="break-all font-mono">
                  {previewItem.globalId ?? "—"}
                </dd>
                {previewPassport ? (
                  <>
                    <dt className="text-zinc-500">IFC fire</dt>
                    <dd className="min-w-0 break-words">{previewPassport.ifcFireRating ?? "—"}</dd>
                  </>
                ) : null}
              </dl>
            )}
            {previewItem && projectId.trim() && selectedExpressId != null ? (
              <nav
                className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"
                aria-label="Open element elsewhere"
              >
                <Link
                  href={`/bim/passport-snapshot?projectId=${encodeURIComponent(projectId.trim())}&expressId=${encodeURIComponent(String(selectedExpressId))}`}
                  className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                >
                  Fire snapshot
                </Link>
                <Link
                  href={bimPassportsElementHref(projectId.trim(), selectedExpressId)}
                  className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                >
                  Passports
                </Link>
                <Link
                  href={bimBuildingElementHref(projectId.trim(), selectedExpressId)}
                  className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                >
                  3D
                </Link>
                <Link
                  href={kbGraphElementHref(projectId.trim(), selectedExpressId)}
                  className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                >
                  KB graph
                </Link>
              </nav>
            ) : null}
            {previewItem && previewPassport ? (
              <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  GWP (A1–A3, EPD unit)
                </p>
                {previewPassport.materials.length === 0 ? (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">No material links.</p>
                ) : (
                  <ul className="space-y-2">
                    {previewPassport.materials.slice(0, PREVIEW_MATERIALS_MAX).map((m) => {
                      const gwpLine = formatPassportMaterialGwpLine(m);
                      const epdLinks = passportMaterialEpdLinks(m);
                      const pid = projectId.trim();
                      return (
                        <li
                          key={m.materialId}
                          className="rounded border border-zinc-200/90 bg-white/90 px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50"
                        >
                          <div className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">
                            {m.materialName}
                          </div>
                          {m.hasEPD ? (
                            <div className="mt-0.5 min-w-0 break-words font-mono text-[9px] text-zinc-600 dark:text-zinc-400">
                              {m.epdSlug ?? "EPD"}
                              {m.epdName ? (
                                <span className="font-sans text-zinc-500"> · {m.epdName}</span>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                              No EPD linked
                            </p>
                          )}
                          {gwpLine ? (
                            <div className="mt-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
                              <span className="text-emerald-700 dark:text-emerald-300">GWP</span>{" "}
                              <span className="font-mono tabular-nums">{gwpLine}</span>
                            </div>
                          ) : m.hasEPD ? (
                            <p className="mt-1 text-[9px] text-zinc-500 dark:text-zinc-400">
                              No GWP in KB for this EPD link.
                            </p>
                          ) : null}
                          {pid ? (
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-zinc-200/80 pt-1 dark:border-zinc-700">
                              <Link
                                href={kbFocusMaterialHref(pid, m.materialId)}
                                className="text-[9px] font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                              >
                                KB · material
                              </Link>
                              {epdLinks.map((L) => (
                                <a
                                  key={L.href}
                                  href={L.href}
                                  className="text-[9px] font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {L.label}
                                </a>
                              ))}
                              {m.hasEPD && epdLinks.length === 0 ? (
                                <span
                                  className="text-[9px] text-zinc-500 dark:text-zinc-400"
                                  title="No http(s) URI on this passport row"
                                >
                                  No EPD URI
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {m.densityKgPerM3 != null && Number.isFinite(m.densityKgPerM3) ? (
                            <p className="mt-1 text-[9px] text-zinc-600 dark:text-zinc-400">
                              Density{" "}
                              <span className="font-mono tabular-nums">{m.densityKgPerM3}</span> kg/m³
                            </p>
                          ) : null}
                          {m.matchType?.trim() || m.matchConfidence != null ? (
                            <p className="mt-1 text-[9px] text-zinc-500 dark:text-zinc-400">
                              Match
                              {m.matchType?.trim() ? (
                                <>
                                  : <span className="font-mono">{m.matchType.trim()}</span>
                                </>
                              ) : null}
                              {m.matchConfidence != null && Number.isFinite(m.matchConfidence) ? (
                                <span className="ml-0.5 tabular-nums">
                                  ({(m.matchConfidence * 100).toFixed(0)}%)
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                          {m.lcaReady === false ? (
                            <p className="mt-1 text-[9px] font-medium text-amber-700 dark:text-amber-300">
                              LCA not ready
                            </p>
                          ) : null}
                          {m.epdDataProvenance?.trim() ? (
                            <p
                              className="mt-1 text-[9px] text-zinc-500 dark:text-zinc-400"
                              title={m.epdDataProvenance}
                            >
                              Provenance:{" "}
                              {m.epdDataProvenance.length > 64
                                ? `${m.epdDataProvenance.slice(0, 62)}…`
                                : m.epdDataProvenance}
                            </p>
                          ) : null}
                          {m.sourceFileName?.trim() ? (
                            <p
                              className="mt-1 text-[9px] text-zinc-500 dark:text-zinc-400"
                              title={m.sourceFileName}
                            >
                              Source file:{" "}
                              <span className="break-all font-mono">
                                {m.sourceFileName.length > 56
                                  ? `${m.sourceFileName.trim().slice(0, 54)}…`
                                  : m.sourceFileName.trim()}
                              </span>
                            </p>
                          ) : null}
                          {m.sourceProductUri?.trim() ? (
                            <p className="mt-1 min-w-0 text-[9px]">
                              <a
                                href={m.sourceProductUri.trim()}
                                className="text-violet-700 underline hover:no-underline dark:text-violet-300"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Product URI
                              </a>
                            </p>
                          ) : null}
                          <PassportEpdRecordBlock m={m} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {previewPassport.materials.length > PREVIEW_MATERIALS_MAX ? (
                  <p className="mt-1.5 text-[9px] text-zinc-500 dark:text-zinc-400">
                    +{previewPassport.materials.length - PREVIEW_MATERIALS_MAX} more in the sidebar below
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
