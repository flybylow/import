/**
 * Pre-fill material dictionary slug by IFC type for the architect matching UI.
 * Slugs must exist in `src/data/material-dictionary.json`.
 */
export const IFC_TYPE_MATERIAL_DEFAULT_SLUG: Record<string, string | null> = {
  IfcBeam: "concrete_general",
  IfcColumn: "concrete_general",
  IfcSlab: "concrete_general",
  IfcStair: "concrete_general",

  IfcWall: "masonry_brick",
  IfcWallStandardCase: "masonry_brick",
  IfcBuildingElementPart: "masonry_brick",
  IfcBuildingElementProxy: "masonry_brick",

  IfcDoor: "timber",
  IfcWindow: "aluminium_window_frame",

  IfcCovering: "ceramic_tile",

  IfcRailing: "steel",
  IfcFlowSegment: "steel",
  IfcMember: "steel",
  IfcDistributionElement: "steel",

  IfcBuildingStorey: "concrete_general",
  IfcBuilding: "concrete_general",

  /** Spatial — no material row */
  IfcSpace: null,
};

export function defaultMaterialSlugForIfcType(ifcType: string): string {
  const t = ifcType?.trim() ?? "";
  const v = IFC_TYPE_MATERIAL_DEFAULT_SLUG[t];
  if (v === null) return "";
  if (typeof v === "string") return v;
  return "";
}
