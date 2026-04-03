"use client";

import { useEffect, useMemo, useState } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

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

type Props = {
  items: FinderListItem[];
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
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
    items,
    selectedExpressId,
    onSelectExpressId,
    disabled,
    passportByExpressId,
    className = "",
  } = props;

  const [filterQ, setFilterQ] = useState("");
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);

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

  const columnItems =
    selectedTypeKey != null ? (byType.get(selectedTypeKey) ?? []) : [];

  const previewItem =
    selectedExpressId != null
      ? items.find((i) => i.expressId === selectedExpressId)
      : null;
  const previewPassport =
    selectedExpressId != null && passportByExpressId
      ? (passportByExpressId[selectedExpressId] ?? null)
      : null;

  const colClass =
    "flex min-h-0 min-w-0 flex-1 flex-col border-r border-zinc-200 bg-zinc-50 last:border-r-0 dark:border-zinc-800 dark:bg-zinc-950/40";

  return (
    <div
      className={`@container flex min-h-0 min-w-0 flex-1 flex-col rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 ${className}`.trim()}
    >
      <div className="shrink-0 space-y-1 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
            Finder ({items.length} elements)
          </h3>
          <details className="group text-[9px] text-zinc-500 dark:text-zinc-400">
            <summary className="cursor-pointer list-none text-violet-700 underline dark:text-violet-300 [&::-webkit-details-marker]:hidden">
              How columns work
            </summary>
            <p className="mt-1 leading-snug">
              Column 1: IFC type · Column 2: instances · Column 3: preview. The
              filter narrows all three.
            </p>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="passport-finder-filter" className="sr-only">
            Filter elements
          </label>
          <input
            id="passport-finder-filter"
            type="search"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            disabled={disabled}
            placeholder="Filter name, type, expressId, globalId…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <span className="shrink-0 text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400">
            {filterQ.trim()
              ? `${filteredItems.length} / ${items.length}`
              : `${items.length}`}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-zinc-200 overflow-hidden @min-[28rem]:grid-cols-3 @min-[28rem]:divide-x @min-[28rem]:divide-y-0 dark:divide-zinc-800">
        {/* Col 1 — IFC type */}
        <div className={colClass}>
          <div className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            IFC type
          </div>
          <ul
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5"
            aria-label="IFC types"
          >
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
                      type="button"
                      disabled={disabled}
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setSelectedTypeKey(key);
                        const nextList = byType.get(key) ?? [];
                        const keep =
                          selectedExpressId != null &&
                          nextList.some((i) => i.expressId === selectedExpressId);
                        if (keep) return;
                        const first = nextList[0];
                        if (first) onSelectExpressId(first.expressId);
                        else onSelectExpressId(null);
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
          <ul
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5"
            aria-label="Elements for selected IFC type"
          >
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 text-[10px] text-zinc-700 dark:text-zinc-200">
            {!previewItem ? (
              <p className="text-zinc-500 dark:text-zinc-400">
                Select an element in the middle column. Full passport and
                quantities stay in the panels on the right.
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
                    <dt className="text-zinc-500">materials</dt>
                    <dd>{previewPassport.materials.length}</dd>
                  </>
                ) : null}
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
