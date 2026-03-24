import * as $rdf from "rdflib";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);

export type MaterialLabelParts = {
  schemaName?: string | null;
  layerSetName?: string | null;
  standardName?: string | null;
  /** IFC entity type for the material usage (e.g. IfcMaterial, IfcMaterialList). */
  ifcType?: string | null;
};

/**
 * IFC / Phase-1 sometimes stores `schema:name` as `material-<expressId>` (non-human).
 * In that case prefer layer set name, standard name, etc.
 */
export function isDerivedMaterialIdLabel(
  name: string | undefined | null,
  materialId: number
): boolean {
  if (name == null) return true;
  const t = String(name).trim();
  if (!t) return true;
  if (/^material-\d+$/i.test(t)) return true;
  const m = /^material-(\d+)$/i.exec(t);
  if (m && Number(m[1]) === materialId) return true;
  return false;
}

export function resolveIfcMaterialDisplayName(
  materialId: number,
  parts: MaterialLabelParts
): string {
  const schema = parts.schemaName?.trim() || "";
  const layer = parts.layerSetName?.trim() || "";
  const standard = parts.standardName?.trim() || "";

  if (schema && !isDerivedMaterialIdLabel(schema, materialId)) {
    return schema;
  }
  if (layer) return layer;
  if (standard) return standard;
  if (schema) return schema;
  return `material-${materialId}`;
}

export function readMaterialLabelPartsFromStore(
  store: $rdf.Store,
  materialId: number
): MaterialLabelParts {
  const mat = BIM(`material-${materialId}`);
  const schemaName = store.any(mat, SCHEMA("name"), null)?.value ?? null;
  const layerSetName =
    store.any(mat, BIM("layerSetName"), null)?.value ??
    store.any(mat, ONT("layerSetName"), null)?.value ??
    null;
  const standardName = store.any(mat, ONT("standardName"), null)?.value ?? null;
  const ifcType = store.any(mat, ONT("ifcType"), null)?.value ?? null;
  return { schemaName, layerSetName, standardName, ifcType };
}

export function materialDisplayNameFromStore(
  store: $rdf.Store,
  materialId: number
): string {
  const parts = readMaterialLabelPartsFromStore(store, materialId);
  return resolveIfcMaterialDisplayName(materialId, parts);
}

/** Parse `mat-<expressId>` from calculable row keys. */
export function parseMaterialExpressIdFromKey(key: string): number | null {
  const m = /^mat-(\d+)$/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseMaterialExpressIdFromMaterialLabel(label: string): number | null {
  const t = String(label ?? "").trim();
  const m1 = /^(\d+)\s*:/.exec(t);
  if (m1) {
    const n = Number(m1[1]);
    return Number.isFinite(n) ? n : null;
  }
  const m2 = /^material-(\d+)$/i.exec(t);
  if (m2) {
    const n = Number(m2[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseMaterialExpressIdFromSelectionRow(row: {
  key: string;
  materialLabel: string;
}): number | null {
  return (
    parseMaterialExpressIdFromKey(row.key) ??
    parseMaterialExpressIdFromMaterialLabel(row.materialLabel)
  );
}
