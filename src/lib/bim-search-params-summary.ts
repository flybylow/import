/**
 * Turn a BIM page query string into sorted, labeled rows for UI (e.g. URL debug strip).
 */

export type BimSearchParamRow = {
  key: string;
  /** Human-readable label for known keys; falls back to the key name. */
  label: string;
  rawValue: string;
  /** Optional prettier display (e.g. view code → title). */
  displayValue: string;
};

const PARAM_LABELS: Record<string, string> = {
  projectId: "Project",
  view: "View",
  expressId: "Express id",
};

const VIEW_DISPLAY: Record<string, string> = {
  building: "Building",
  passports: "Passports",
  inspect: "Inspect",
  /** Legacy; normalized to Building in the BIM page. */
  "3dtest": "Building",
};

function displayValueForParam(key: string, raw: string): string {
  if (key === "view") return VIEW_DISPLAY[raw] ?? raw;
  return raw;
}

/**
 * All entries, sorted by key (stable, easy to scan). Skips empty keys/values.
 */
export function bimSearchParamsSummary(
  params: Pick<URLSearchParams, "forEach">
): BimSearchParamRow[] {
  const rows: BimSearchParamRow[] = [];
  params.forEach((rawValue, key) => {
    const k = key.trim();
    const v = rawValue.trim();
    if (!k || !v) return;
    rows.push({
      key: k,
      label: PARAM_LABELS[k] ?? k,
      rawValue: v,
      displayValue: displayValueForParam(k, v),
    });
  });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}
