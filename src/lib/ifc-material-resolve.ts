/**
 * Single place to resolve IFC material *lines* into human-usable labels for Phase 1 TTL
 * and Phase 1 enrich. Covers IfcMaterialList (constituent names), layer sets, and plain
 * IfcMaterial — the same cases as the former `extractMaterialLayerInfo` in layer1-enrich.
 */
import type * as WebIFC from "web-ifc";

export function readIfcString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) {
    const vv = (v as { value?: unknown }).value;
    if (vv == null) return undefined;
    return typeof vv === "string" ? vv : String(vv);
  }
  return undefined;
}

/**
 * True when the label names a CAD hatch / fill / density pattern, not a physical material.
 * Common in NL Revit exports (IfcMaterialList mixes real layers with pattern names).
 */
export function isCadHatchOrFillLabel(s: string): boolean {
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return true;
  // AutoCAD / Revit fill names
  if (/\bhatching\d*\b/i.test(s)) return true;
  // Dutch: empty / dense / "leeg" hatching
  if (/\b(lege|dichte|leeg)\s+arcering\b/i.test(s)) return true;
  if (/\bddichte\s+arcering\b/i.test(t)) return true; // typo seen in exports ("Ddichte")
  // Density-only tokens like "000 50 %"
  if (/^\d+\s+\d+\s*%$/.test(t)) return true;
  if (/^\d{3}\s+\d{2}\s*%/.test(t)) return true;
  // Leading code + hatch-only remainder, e.g. "000 lege arcering (02)"
  if (/\b000\s+.*arcering/i.test(s)) return true;
  return false;
}

export type MaterialLineResolution = {
  ifcType: string;
  materialName?: string;
  layerSetName?: string;
  layerThicknessMeters?: number;
};

export function resolveMaterialLineFromIfc(
  ifcApi: WebIFC.IfcAPI,
  modelId: number,
  materialExpressId: number
): MaterialLineResolution {
  const line = ifcApi.GetLine(modelId, materialExpressId);
  const typeCode = ifcApi.GetLineType(modelId, materialExpressId);
  const typeName = typeCode ? ifcApi.GetNameFromTypeCode(typeCode) : "";
  const ifcType = typeName || "IfcMaterial";

  if (typeName.includes("MaterialList")) {
    const materials = line?.Materials;
    const names: string[] = [];
    if (Array.isArray(materials)) {
      for (const ref of materials) {
        const mid = Number((ref as { value?: number }).value ?? ref);
        if (!Number.isFinite(mid)) continue;
        const matLine = ifcApi.GetLine(modelId, mid);
        const n = readIfcString(matLine?.Name);
        if (n?.trim()) names.push(n.trim());
      }
    }
    const unique = [...new Set(names)];
    const withoutHatch = unique.filter((n) => !isCadHatchOrFillLabel(n));
    const joined = withoutHatch.length ? withoutHatch.join(" | ") : undefined;
    return {
      ifcType,
      materialName: joined,
      layerSetName: undefined,
      layerThicknessMeters: undefined,
    };
  }

  const layerSetToThickness = (layerSetLine: any): number | undefined => {
    const mLayers = layerSetLine?.MaterialLayers;
    if (!Array.isArray(mLayers)) return undefined;
    let sumMm = 0;
    let saw = false;
    for (const layerRef of mLayers) {
      const layerId = layerRef?.value ?? layerRef;
      const layer = ifcApi.GetLine(modelId, Number(layerId));
      const tMm = layer?.LayerThickness?.value ?? layer?.LayerThickness;
      const tNum = Number(tMm);
      if (Number.isFinite(tNum)) {
        sumMm += tNum;
        saw = true;
      }
    }
    if (!saw) return undefined;
    return sumMm / 1000;
  };

  const materialName = readIfcString(line?.Name);
  const forLayerSet = line?.ForLayerSet?.value ?? line?.ForLayerSet;

  let layerSetLine: any = undefined;
  if (typeName.includes("LayerSetUsage") && forLayerSet) {
    layerSetLine = ifcApi.GetLine(modelId, Number(forLayerSet));
  } else if (typeName.includes("LayerSet")) {
    layerSetLine = line;
  }

  const layerSetNameRaw = layerSetLine?.LayerSetName?.value ?? layerSetLine?.LayerSetName;
  const layerSetName =
    typeof layerSetNameRaw === "string" ? layerSetNameRaw : undefined;
  const layerThicknessMeters = layerSetToThickness(layerSetLine);

  const resolvedMaterialName =
    materialName ?? (typeof layerSetName === "string" ? layerSetName : undefined);

  return {
    ifcType,
    materialName: resolvedMaterialName,
    layerSetName,
    layerThicknessMeters,
  };
}

/** Best single `schema:name` for Phase 1 triple emission (parse + dedupe). */
export function primaryMaterialLabelFromResolution(r: MaterialLineResolution): string | undefined {
  return r.materialName ?? r.layerSetName;
}
