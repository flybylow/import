"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { passportFinderTypeKey } from "@/lib/ifc-passport-type-group";

/** Full detail per material in the narrow preview; overflow defers to sidebar. */
const PREVIEW_MATERIALS_MAX = 8;

function formatIfcQuantityValue(value: number, unit?: string) {
  const s = String(value);
  return unit ? `${s} ${unit}` : s;
}

export type FinderListItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  /** Passport / URL `?group=` bucket (may be `IfcCovering · betontegels`). */
  typeGroupKey: string;
  globalId?: string;
};

export { passportFinderTypeKey } from "@/lib/ifc-passport-type-group";

/**
 * Scroll only inside `container` so ancestors (e.g. `main` with overflow-y-auto) do not jump.
 * `Element.scrollIntoView` walks the full ancestor chain and often scrolls the whole BIM page.
 */
function scrollChildIntoViewInContainer(
  container: HTMLElement | null,
  child: HTMLElement | null
) {
  if (!container || !child || !container.contains(child)) return;
  const c = container.getBoundingClientRect();
  const e = child.getBoundingClientRect();
  let delta = 0;
  if (e.top < c.top) delta = e.top - c.top;
  else if (e.bottom > c.bottom) delta = e.bottom - c.bottom;
  if (delta !== 0) {
    container.scrollTop += delta;
  }
}

const EMPTY_FINDER_COLUMN: FinderListItem[] = [];

/** Single muted line under column border; omit `text` for a blank cap (column 3). */
function FinderColCap(props: { text?: string }) {
  const { text } = props;
  return (
    <div className="shrink-0 border-b border-zinc-200 px-2 py-1 dark:border-zinc-800">
      {text ? (
        <p className="text-[9px] leading-snug text-zinc-500 dark:text-zinc-400">{text}</p>
      ) : null}
    </div>
  );
}

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
  /**
   * Passports URL: selecting a group updates `?group=` and clears `expressId`.
   * Prefer this over `onSelectExpressId(null)` on type clicks so the group is shareable.
   */
  onCommitGroupToUrl?: (groupKey: string) => void;
  /** Deep link `?group=` when there is no `expressId` (must match a key in the current batch). */
  urlGroupKey?: string;
  /** Override col 1 caption (e.g. inspect mode: no live 3D group highlight). */
  typeGroupColumnCaption?: string;
  /** Override col 2 caption. */
  instancesColumnCaption?: string;
  disabled?: boolean;
  /** Optional: richer preview (materials count, fire rating). */
  passportByExpressId?: Record<number, Phase4ElementPassport>;
  className?: string;
};

/** Miller columns: IFC type → instances → detail. Filter narrows all columns. */
export default function PassportElementFinder(props: Props) {
  const {
    projectId = "",
    items,
    selectedExpressId,
    onSelectExpressId,
    onSelectTypeGroup,
    onCommitGroupToUrl,
    urlGroupKey = "",
    typeGroupColumnCaption,
    instancesColumnCaption,
    disabled,
    passportByExpressId,
    className = "",
  } = props;

  const [filterQ, setFilterQ] = useState("");
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);

  const activeTypeButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeElementButtonRef = useRef<HTMLButtonElement | null>(null);
  const typeListUlRef = useRef<HTMLUListElement | null>(null);
  const elementListUlRef = useRef<HTMLUListElement | null>(null);

  const filteredItems = useMemo(() => {
    const t = filterQ.trim().toLowerCase();
    if (!t) return items;
    return items.filter((item) => {
      const hay = [
        String(item.expressId),
        item.label,
        item.ifcType ?? "",
        item.typeGroupKey ?? "",
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
      const k = it.typeGroupKey;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }

    const coveringLegacyKey = passportFinderTypeKey("IfcCovering");
    const coveringItems = filteredItems.filter((it) =>
      /^ifccovering$/i.test(it.ifcType?.trim() ?? "")
    );
    if (coveringItems.length > 0) {
      m.set(coveringLegacyKey, [...coveringItems].sort((a, b) => a.expressId - b.expressId));
    }

    for (const arr of m.values()) {
      arr.sort((a, b) => a.expressId - b.expressId);
    }
    const keys = [...m.keys()];
    keys.sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      const la = a === coveringLegacyKey;
      const lb = b === coveringLegacyKey;
      if (la && !lb) return 1;
      if (lb && !la) return -1;
      return a.localeCompare(b);
    });
    return { byType: m, sortedTypeKeys: keys };
  }, [filteredItems]);

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

  /**
   * URL `group=` selects the finder bucket. With `expressId`, still honor `group` when that element
   * appears in that bucket (deep links from workflow / KB); otherwise fall back to the row’s type.
   */
  useEffect(() => {
    const g = urlGroupKey.trim();
    const hasGroup = g.length > 0 && sortedTypeKeys.includes(g);

    if (selectedExpressId != null) {
      if (hasGroup) {
        const inGroup = byType.get(g)?.some((i) => i.expressId === selectedExpressId) === true;
        if (inGroup) {
          setSelectedTypeKey(g);
          return;
        }
      }
      const row = items.find((i) => i.expressId === selectedExpressId);
      if (row) {
        setSelectedTypeKey(row.typeGroupKey);
      }
      return;
    }

    if (hasGroup) {
      setSelectedTypeKey(g);
    }
  }, [urlGroupKey, selectedExpressId, items, sortedTypeKeys, typeKeysSig, byType]);

  /** Keep the selected IFC type and element row visible inside their columns only (no page scroll). */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (selectedTypeKey != null) {
        scrollChildIntoViewInContainer(typeListUlRef.current, activeTypeButtonRef.current);
      }
      if (
        selectedExpressId != null &&
        columnItems.some((i) => i.expressId === selectedExpressId)
      ) {
        scrollChildIntoViewInContainer(
          elementListUlRef.current,
          activeElementButtonRef.current
        );
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
    "min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-0.5 max-h-[min(48dvh,22rem)] @min-[28rem]:max-h-none";

  return (
    <div
      className={`@container flex h-full min-h-0 w-full min-w-0 flex-1 flex-col rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 ${className}`.trim()}
      aria-label="Passport finder"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-2 py-1 dark:border-zinc-800">
        <label htmlFor="passport-finder-filter" className="sr-only">
          Filter
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

      <nav
        className="shrink-0 border-b border-zinc-200 bg-zinc-100/80 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900/50"
        aria-label="Selection path"
      >
        <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
          {selectedTypeKey != null ? (
            <li className="min-w-0 truncate font-mono text-zinc-800 dark:text-zinc-100" title={selectedTypeKey}>
              {selectedTypeKey}
            </li>
          ) : (
            <li className="text-zinc-400 dark:text-zinc-500">—</li>
          )}
          {previewItem != null ? (
            <>
              <li aria-hidden className="text-zinc-400 dark:text-zinc-500">
                /
              </li>
              <li className="min-w-0 max-w-[min(100%,12rem)] truncate text-zinc-900 dark:text-zinc-50">
                {previewItem.label}
              </li>
              <li className="shrink-0 font-mono text-zinc-500 dark:text-zinc-400">
                ({previewItem.expressId})
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div
        role="region"
        aria-label="Three columns: groups, elements, detail"
        className="grid min-h-0 w-full flex-1 grid-cols-1 divide-y divide-zinc-200 overflow-y-auto overscroll-y-contain @min-[28rem]:grid-cols-3 @min-[28rem]:items-stretch @min-[28rem]:divide-x @min-[28rem]:divide-y-0 @min-[28rem]:overflow-hidden dark:divide-zinc-800"
      >
        {/* Col 1 — groups (IFC type) */}
        <div className={colClass}>
          <FinderColCap
            text={
              typeGroupColumnCaption ??
              "IFC group · subdivided types (e.g. IfcCovering) · click = all instances in 3D"
            }
          />
          <ul ref={typeListUlRef} className={listClass} aria-label="IFC type groups">
            {sortedTypeKeys.length === 0 ? (
              <li className="px-2 py-2 text-[10px] text-zinc-500">—</li>
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
                        if (onCommitGroupToUrl) {
                          onCommitGroupToUrl(key);
                        } else {
                          onSelectExpressId(null);
                        }
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

        {/* Col 2 — elements (leaf instances) */}
        <div className={colClass}>
          <FinderColCap
            text={
              instancesColumnCaption ??
              "Instances in the selected group · leaf level"
            }
          />
          <ul ref={elementListUlRef} className={listClass} aria-label="Elements for selected IFC type">
            {selectedTypeKey == null ? (
              <li className="px-2 py-2 text-[10px] text-zinc-500">—</li>
            ) : columnItems.length === 0 ? (
              <li className="px-2 py-2 text-[10px] text-zinc-500">—</li>
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

        {/* Col 3 — detail */}
        <div className={`${colClass} border-r-0`}>
          <FinderColCap />
          <div className="min-h-0 max-h-[min(48dvh,22rem)] flex-1 overflow-y-auto overscroll-y-contain p-2 text-[10px] text-zinc-700 dark:text-zinc-200 @min-[28rem]:max-h-none">
            {!previewItem &&
            selectedExpressId == null &&
            selectedTypeKey != null &&
            columnItems.length > 0 ? (
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                <span className="font-mono text-zinc-700 dark:text-zinc-200">{selectedTypeKey}</span>
                <span className="tabular-nums"> · {columnItems.length}</span>
              </p>
            ) : !previewItem ? (
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">—</p>
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
            {previewItem && previewPassport && previewPassport.ifcQuantities.length > 0 ? (
              <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                  {previewPassport.ifcQuantities.map((q, idx) => (
                    <Fragment key={`${q.quantityName}-${idx}`}>
                      <dt className="text-zinc-500">{q.quantityName}</dt>
                      <dd className="min-w-0 break-all font-mono text-zinc-900 dark:text-zinc-100">
                        {formatIfcQuantityValue(q.value, q.unit)}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            ) : null}
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
                  <p className="mt-1.5 text-[9px] font-mono text-zinc-500 dark:text-zinc-400">
                    +{previewPassport.materials.length - PREVIEW_MATERIALS_MAX}
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
