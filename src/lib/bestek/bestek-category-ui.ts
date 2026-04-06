/**
 * Display labels + chip accents for material-dictionary categories in Deliveries → Bestek.
 */

/** NL-friendly optgroup labels (canonical `category` in JSON stays English). */
export function bestekCategoryDisplayLabel(category: string): string {
  const c = category.trim();
  if (c === "Metals") return "Staal";
  return c;
}

const STEEL_CATEGORY_KEYS = new Set(["metals", "staal", "steel"]);

/** Tailwind classes for “Herleid uit tekst” category tokens. */
export function bestekCategoryChipClass(label: string): string {
  if (STEEL_CATEGORY_KEYS.has(label.trim().toLowerCase())) {
    return [
      "rounded border border-sky-600/55 bg-sky-100 px-1 py-0.5 font-medium text-sky-950",
      "dark:border-sky-400/45 dark:bg-sky-950/85 dark:text-sky-100",
    ].join(" ");
  }
  return "rounded bg-zinc-100 px-1 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}
