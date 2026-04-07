import { shouldPartitionIfcType } from "@/lib/ifc-passport-type-group";

/**
 * Pre-fill material dictionary slug by IFC type for the architect matching UI.
 * Slugs must exist in `src/data/material-dictionary.json`.
 *
 * **Bestek linking (this module)** maps phase-0 **partition** labels (e.g. `IfcCovering · dakisolatie`)
 * and IFC enum strings to dictionary **EPD slugs** — not the RDF KB graph (that is Phase 2 `/kb`).
 * `IfcCovering` has **no** coarse default so unknown partitions are not forced to ceramic tile.
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

  /** Partition rules + user pick; avoid blanket ceramic for all coverings. */
  IfcCovering: null,

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

/**
 * Ordered rules: first match on partition / predefined-type label wins.
 * Used by Bestek **Auto-match** (`computeBestekAutofillDraft`) so `IfcCovering · …` rows do not all map to `ceramic_tile`.
 */
const PARTITION_MATERIAL_RULES: ReadonlyArray<{ re: RegExp; slug: string }> = [
  {
    re: /dakisolatie|dak\s*isolatie|roof\s*insulation|gevelisolatie|isolatie|insulation|glaswol|glas.?wol|steenwol|mineraalwol|mineral.?wool|pir\b|eps\b|xps\b/i,
    slug: "insulation_generic",
  },
  { re: /gips|plafond|promatect|brandwer|scheidingswand|verlaagd/i, slug: "gypsum_plaster" },
  { re: /dakpan|dakpannen|pannen\b|koramic|roofing.*tile/i, slug: "ceramic_tile" },
  { re: /dakschroot|schindel|shingle/i, slug: "timber" },
  { re: /leien|leis|leisteen|slate|ardesia/i, slug: "natural_stone" },
  { re: /dakopstand|opstand|randprofiel|flashing|deklijst|nok|vorst/i, slug: "zinc_work" },
  { re: /betontegel|beton.*tegel|wandtegel|vloertegel|keramisch|porcelain|tegel\b/i, slug: "ceramic_tile" },
  { re: /breedplaat|kanaalplaat/i, slug: "precast_breedplaat" },
  { re: /epdm|dakfolie|folie|membraan/i, slug: "plastic_sheet" },
  { re: /\bmembrane\b/i, slug: "plastic_sheet" },
  { re: /\binsulation\b/i, slug: "insulation_generic" },
  { re: /\bceiling\b/i, slug: "gypsum_plaster" },
  /** IFC `FLOORING` / `ROOFING` enums cover many materials — do not map wholesale to ceramic. */
  { re: /\bcladding\b/i, slug: "masonry_brick" },
  { re: /\bbeton\b|concrete/i, slug: "concrete_general" },
  { re: /zink|zinc/i, slug: "zinc_work" },
  { re: /staal|steel|metaal/i, slug: "steel" },
  { re: /hout|timber|houten/i, slug: "timber" },
];

/**
 * Bestek tab / auto-match: suggest slug from IFC type + phase-0 partition (e.g. `IfcCovering · gipsplafond`).
 * Non-partitioned types use {@link defaultMaterialSlugForIfcType} only.
 */
export function suggestedMaterialSlugForBestekGroup(
  ifcType: string,
  partition?: string | null
): string {
  const base = defaultMaterialSlugForIfcType(ifcType);
  const t = (ifcType ?? "").trim();
  if (!shouldPartitionIfcType(t)) return base;
  const raw = (partition ?? "").trim();
  if (!raw) return base;
  const hay = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  for (const { re, slug } of PARTITION_MATERIAL_RULES) {
    if (re.test(hay)) return slug;
  }
  return base;
}
