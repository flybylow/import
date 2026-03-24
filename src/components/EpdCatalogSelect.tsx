"use client";

import { useId, useMemo } from "react";

export type EpdCatalogItem = {
  epdSlug: string;
  epdName: string;
  /** Optional product family from `available-epds.json` (shown in option `title`). */
  category?: string;
};

type Props = {
  value: string;
  onChange: (slug: string) => void;
  catalog: EpdCatalogItem[];
  /** Larger tap/read targets and spacing */
  size?: "compact" | "comfortable";
  showCaption?: boolean;
  id?: string;
  "aria-label"?: string;
  /**
   * First option with empty value — the usual name is a **placeholder** (or “empty option”).
   * When true, rows start on this until the user picks a real EPD slug.
   */
  showPlaceholderOption?: boolean;
  /** Visible label for the empty option (placeholder text). */
  placeholderLabel?: string;
};

/** Short slug-only lines in the dropdown; full titles in optgroup + caption below. */
function groupCatalog(catalog: EpdCatalogItem[]) {
  const routing: EpdCatalogItem[] = [];
  const ice: EpdCatalogItem[] = [];
  for (const e of catalog) {
    if (e.epdSlug.startsWith("ice-")) ice.push(e);
    else routing.push(e);
  }
  return [
    { label: "Routing / dictionary slugs", items: routing },
    { label: "ICE (Educational)", items: ice },
  ].filter((g) => g.items.length);
}

export function EpdCatalogSelect({
  value,
  onChange,
  catalog,
  size = "comfortable",
  showCaption = true,
  showPlaceholderOption = true,
  placeholderLabel = "Select EPD…",
  id,
  "aria-label": ariaLabel,
}: Props) {
  const reactId = useId();
  const descId = `${reactId}-epd-caption`;
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);

  const resolvedValue = useMemo(() => {
    const valid = catalog.some((e) => e.epdSlug === value);
    if (showPlaceholderOption) {
      if (!value) return "";
      return valid ? value : "";
    }
    if (!value || !valid) return catalog[0]?.epdSlug ?? "";
    return value;
  }, [value, catalog, showPlaceholderOption]);

  const selected = catalog.find((e) => e.epdSlug === resolvedValue);

  const comfy = size === "comfortable";
  const selectClass = [
    "w-full min-w-0 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono",
    resolvedValue === "" && showPlaceholderOption
      ? "text-zinc-500 dark:text-zinc-400"
      : "text-zinc-900 dark:text-zinc-50",
    comfy ? "text-sm py-2.5 px-2 min-h-[2.85rem]" : "text-xs py-1 px-1.5 min-h-0",
  ].join(" ");

  return (
    <div className="min-w-0 space-y-1">
      <select
        id={id}
        className={selectClass}
        value={resolvedValue}
        aria-label={ariaLabel}
        aria-describedby={selected && showCaption ? descId : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {showPlaceholderOption && catalog.length > 0 ? (
          <option value="">{placeholderLabel}</option>
        ) : null}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((epd) => (
              <option
                key={epd.epdSlug}
                value={epd.epdSlug}
                title={
                  epd.category
                    ? `${epd.epdName} (${epd.category})`
                    : epd.epdName
                }
              >
                {epd.epdSlug}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && showCaption ? (
        <p
          id={descId}
          className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400 line-clamp-3 break-words"
          title={selected.epdName}
        >
          {selected.epdName}
        </p>
      ) : null}
    </div>
  );
}
