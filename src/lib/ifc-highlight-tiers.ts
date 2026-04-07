/**
 * Highlight / opacity tiers for `BuildingIfcViewer` (see docs/building-ifc-viewer-opacity-highlighting.md §10).
 */

export const IFC_HIGHLIGHT_TIER_A_MAX = 32;
export const IFC_HIGHLIGHT_TIER_B_MAX = 256;
/** Max express ids passed to `highlightByID` in tier C. */
export const IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP = 64;

export type IfcHighlightTier = "A" | "B" | "C";

/** @returns `null` when there is no focus (clear selection). */
export function ifcHighlightTierFromFocusCount(n: number): IfcHighlightTier | null {
  if (n <= 0) return null;
  if (n <= IFC_HIGHLIGHT_TIER_A_MAX) return "A";
  if (n <= IFC_HIGHLIGHT_TIER_B_MAX) return "B";
  return "C";
}

/**
 * Baseline uniform dim (`setOpacity(undefined, ghost)`) policy:
 * - Default: tier A respects `requested`; tier B/C turn dim off (large focus sets — worker cost).
 * - **`relaxThroughTierB`**: tier A and B respect `requested`; tier C still off (very large sets).
 *   Use for small-surface UIs (e.g. passports mini preview) where B-tier groups should still ghost.
 */
export function effectiveUniformGhostForTier(
  requested: boolean,
  tier: IfcHighlightTier | null,
  relaxThroughTierB = false
): boolean {
  if (tier == null) return requested;
  if (tier === "C") return false;
  if (tier === "A") return requested;
  if (relaxThroughTierB) return requested;
  return false;
}

export type IfcHighlightCapResult = {
  capped: number[];
  total: number;
  truncated: boolean;
};

/**
 * @param sortedUniqueIds — ascending unique express ids
 */
export function capExpressIdsForHighlighter(
  sortedUniqueIds: number[],
  tier: IfcHighlightTier | null
): IfcHighlightCapResult {
  const total = sortedUniqueIds.length;
  if (tier == null || tier === "A" || tier === "B") {
    return { capped: sortedUniqueIds, total, truncated: false };
  }
  const cap = IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP;
  const truncated = total > cap;
  return {
    capped: sortedUniqueIds.slice(0, cap),
    total,
    truncated,
  };
}
