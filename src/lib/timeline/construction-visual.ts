/**
 * Heuristics for construction-schedule style timeline messages:
 * "Task name: Slab (IFC_…). N element(s) affected."
 */

export const IFC_CATEGORY_HEX: Record<string, string> = {
  Slab: "#0ea5e9",
  Wall: "#a855f7",
  Beam: "#ea580c",
  Column: "#ca8a04",
  Covering: "#16a34a",
  Door: "#db2777",
  Stair: "#4f46e5",
  Window: "#06b6d4",
  Railing: "#8b5cf6",
  Member: "#78716c",
  Plate: "#059669",
  Roof: "#14b8a6",
  Other: "#64748b",
};

export function extractIfcCategoryFromTitle(title: string): string {
  const t = title.trim();
  const m = t.match(/:\s*([A-Za-z]+)\s*\(/);
  return m?.[1] ?? "Other";
}

export function ifcCategoryColor(category: string): string {
  return IFC_CATEGORY_HEX[category] ?? IFC_CATEGORY_HEX.Other;
}

export function utcMonthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function formatUtcMonthRail(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(d);
}
