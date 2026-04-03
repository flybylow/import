"use client";

import { useMemo, useState } from "react";

type ListItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  globalId?: string;
};

type Props = {
  items: ListItem[];
  selectedExpressId: number | null;
  onSelectExpressId: (id: number) => void;
  disabled?: boolean;
  /** Legacy: when positive, show a note that abstract boxes were capped (viewer removed). */
  viewerBoxCap?: number;
  className?: string;
};

export default function PassportElementList(props: Props) {
  const {
    items,
    selectedExpressId,
    onSelectExpressId,
    disabled,
    viewerBoxCap = 0,
    className = "",
  } = props;

  const [filterQ, setFilterQ] = useState("");

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

  const capped = viewerBoxCap > 0 && items.length > viewerBoxCap;

  return (
    <nav
      aria-label="IFC elements in passport list"
      className={`flex min-h-0 min-w-0 flex-col rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 ${className}`.trim()}
    >
      <div className="shrink-0 space-y-1 border-b border-zinc-200 px-1.5 py-1.5 dark:border-zinc-800">
        <h3 className="text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-200">
          Elements ({items.length})
        </h3>
        <p className="text-[9px] leading-snug text-zinc-500 dark:text-zinc-400">
          Scroll the list. Filter still matches expressId in the KB.
          {capped ? (
            <>
              {" "}
              (Legacy: first <code className="font-mono">{viewerBoxCap}</code>{" "}
              rows were used for a box preview.)
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <label
            htmlFor="passport-element-filter"
            className="sr-only"
          >
            Filter elements
          </label>
          <input
            id="passport-element-filter"
            type="search"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            disabled={disabled}
            placeholder="Filter name, type, id…"
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
      <ul
        className="min-h-0 min-w-0 flex-1 divide-y divide-zinc-200 overflow-y-auto overscroll-contain p-0.5 dark:divide-zinc-800"
        aria-label="Element passports in this batch"
      >
        {items.length === 0 ? (
          <li className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            No rows in this batch.
          </li>
        ) : filteredItems.length === 0 ? (
          <li className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            No elements match “{filterQ.trim()}”. Clear the filter or try
            another substring.
          </li>
        ) : (
          filteredItems.map((item) => {
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
                    {item.ifcType ? (
                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                        {" "}
                        - {item.ifcType}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
}
