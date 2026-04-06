/**
 * IFC types that are usually **not** bestek material line items. Used only to **hide rows** in
 * Deliveries bestek forms — phase-0 JSON on disk keeps **all** types for downstream use.
 */

/** Spatial / zone / shell — keep in data; optional hide in UI. */
export const BESTEK_EXCLUDE_SPATIAL_TYPES: readonly string[] = [
  "IfcSpace",
  "IfcBuilding",
  "IfcBuildingStorey",
  "IfcSite",
  "IfcZone",
  "IfcSpatialZone",
];

/** Proxy / part breakdown — keep in data; optional hide in UI. */
export const BESTEK_EXCLUDE_META_TYPES: readonly string[] = [
  "IfcBuildingElementProxy",
  "IfcBuildingElementPart",
];

const SPATIAL_SET = new Set(
  BESTEK_EXCLUDE_SPATIAL_TYPES.map((t) => t.toLowerCase())
);
const META_SET = new Set(BESTEK_EXCLUDE_META_TYPES.map((t) => t.toLowerCase()));

export type BestekFormIfcVisibility = {
  /** When true, hide spatial/zone IFC rows in bindings / match UI (default on). */
  hideSpatial: boolean;
  /** When true, hide proxy/part IFC rows (default on). */
  hideMeta: boolean;
};

export function isHiddenBestekFormIfcType(
  ifcType: string,
  opts: BestekFormIfcVisibility
): boolean {
  const t = ifcType.trim().toLowerCase();
  if (opts.hideSpatial && SPATIAL_SET.has(t)) return true;
  if (opts.hideMeta && META_SET.has(t)) return true;
  return false;
}

/** Filter element-group rows for display only — does not change stored JSON. */
export function filterBestekFormGroupsByIfcType<T extends { ifc_type: string }>(
  rows: T[],
  opts: BestekFormIfcVisibility
): T[] {
  return rows.filter((g) => !isHiddenBestekFormIfcType(g.ifc_type, opts));
}
