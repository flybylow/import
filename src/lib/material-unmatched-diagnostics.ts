import type { MaterialLabelParts } from "@/lib/material-label";
import { isDerivedMaterialIdLabel } from "@/lib/material-label";
import { combinedNormalizedMaterialLabel } from "@/lib/material-norm";
import { isCadHatchOrFillLabel } from "@/lib/ifc-material-resolve";

/** Why this row is still unmatched — drives a short UI label (not an EPD taxonomy). */
export type UnmatchedMaterialRowKind =
  | "hatch_annotation"
  | "material_list_no_name"
  | "placeholder_ifc"
  | "no_source_match";

export type UnmatchedFlowDiagnostics = {
  normalizedForMatch: string;
  flowHint: string;
  /** Best single line to send to an external “best match” API (e.g. 2050 `input_items`). */
  suggestedApiQuery: string;
  rowKind: UnmatchedMaterialRowKind;
  /** Short label for tables (e.g. “Hatch / annotation”). */
  rowKindLabel: string;
};

/**
 * Explains why Phase 2 left a material without `ont:hasEPD` and suggests text for API lookup.
 * Mirrors the skip / placeholder rules in `layer2-translate.ts` (keep in sync).
 */
export function unmatchedMaterialDiagnostics(
  materialId: number,
  parts: MaterialLabelParts
): UnmatchedFlowDiagnostics {
  const schema = (parts.schemaName ?? "").trim();
  const layer = (parts.layerSetName ?? "").trim();
  const standard = (parts.standardName ?? "").trim();
  const ifc = (parts.ifcType ?? "").trim();

  const normalizedForMatch = combinedNormalizedMaterialLabel({
    schemaName: parts.schemaName ?? undefined,
    layerSetName: parts.layerSetName ?? undefined,
  });

  const hatchLike =
    isCadHatchOrFillLabel(normalizedForMatch) ||
    (schema ? isCadHatchOrFillLabel(schema) : false);

  if (ifc === "IfcMaterialList" && !schema) {
    return {
      normalizedForMatch,
      flowHint:
        "Phase 2 skips auto-link: IfcMaterialList with no schema:name — nothing to score against dictionary/sources.",
      suggestedApiQuery:
        [layer, standard].filter(Boolean).join(" ") || `material-${materialId}`,
      rowKind: "material_list_no_name",
      rowKindLabel: "Material list · no name",
    };
  }

  if (hatchLike) {
    return {
      normalizedForMatch,
      flowHint:
        "Phase 2 skips auto-link: hatch / fill / arcering (CAD annotation, not a physical material).",
      suggestedApiQuery: layer || schema || `material-${materialId}`,
      rowKind: "hatch_annotation",
      rowKindLabel: "Hatch / annotation",
    };
  }

  if (
    normalizedForMatch.trim().length < 6 ||
    /^material \d+$/.test(normalizedForMatch) ||
    (isDerivedMaterialIdLabel(schema, materialId) && !layer && !standard)
  ) {
    return {
      normalizedForMatch,
      flowHint:
        "No match: IFC only exposes placeholder name material-<id> (or too little text). Enrich the model, extend material-dictionary.json, or add rows under data/sources/ (see Sources page).",
      suggestedApiQuery:
        [layer, standard]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        (schema && !isDerivedMaterialIdLabel(schema, materialId) ? schema : normalizedForMatch) ||
        `material-${materialId}`,
      rowKind: "placeholder_ifc",
      rowKindLabel: "Placeholder / thin IFC",
    };
  }

  return {
    normalizedForMatch,
    flowHint:
      "No dictionary hit and no source overlap above MIN_SOURCE_SCORE (KBOB / ICE / epd-hub in config order). Expand snapshots, tune material-norm / dictionary, or hand-pick EPD.",
    suggestedApiQuery:
      [layer, schema, standard].filter(Boolean).join(" — ") || normalizedForMatch,
    rowKind: "no_source_match",
    rowKindLabel: "No auto-match",
  };
}
