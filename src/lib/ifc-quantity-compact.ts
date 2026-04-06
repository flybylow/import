/**
 * Build the small `Name: value | …` string fed into `parsePrimaryQuantity` for LCA.
 *
 * IFC BaseQuantities often include zeros (e.g. NetVolume: 0). Taking the first three
 * names in schema order used to hide the first positive area/volume — then only
 * Length/Width/Height remained in the compact string and carbon mapping failed.
 */

export const IFC_BASE_QTY_PREFERRED_ORDER = [
  "NetVolume",
  "GrossVolume",
  "NetArea",
  "Mass",
  "GrossArea",
  "NetSideArea",
  "GrossSideArea",
  "NetFootprintArea",
  "GrossFootprintArea",
  "Length",
  "Width",
  "Height",
] as const;

/**
 * Split IFC quantity rows into names we map for carbon (`IFC_BASE_QTY_PREFERRED_ORDER`)
 * vs everything else (e.g. `GrossFloorArea`, BOMA, perimeter — ignored today).
 */
export function partitionIfcQuantitiesByLcaMapper<
  T extends { quantityName: string },
>(ifcQuantities: T[]): { recognized: T[]; other: T[] } {
  const byName = new Map(ifcQuantities.map((q) => [q.quantityName, q]));
  const recognized: T[] = [];
  for (const name of IFC_BASE_QTY_PREFERRED_ORDER) {
    const q = byName.get(name);
    if (q) recognized.push(q);
  }
  const recognizedNames = new Set(recognized.map((q) => q.quantityName));
  const other = ifcQuantities.filter((q) => !recognizedNames.has(q.quantityName));
  return { recognized, other };
}

function qtyMagnitude(q: { value?: number; total?: number }): number {
  if (q.value != null && Number.isFinite(q.value)) return q.value;
  if (q.total != null && Number.isFinite(q.total)) return q.total;
  return 0;
}

/**
 * Pick up to `maxParts` IFC quantities for a compact trace string: preferred IFC name
 * order, but **positive magnitudes first** so zeros do not crowd out usable area/volume.
 */
export function pickIfcQuantitiesForLcaCompact<
  T extends { quantityName: string; unit?: string; value?: number; total?: number },
>(ifcQuantities: T[], maxParts = 3): T[] {
  const byName = new Map(ifcQuantities.map((q) => [q.quantityName, q]));
  const ordered: T[] = [];
  for (const name of IFC_BASE_QTY_PREFERRED_ORDER) {
    const q = byName.get(name);
    if (q) ordered.push(q);
  }
  const positive = ordered.filter((q) => qtyMagnitude(q) > 0);
  const nonPositive = ordered.filter((q) => qtyMagnitude(q) <= 0);
  const merged = [...positive, ...nonPositive];
  if (merged.length > 0) return merged.slice(0, maxParts);
  return ifcQuantities.length ? [ifcQuantities[0]] : [];
}
