/**
 * Group Phase 3 calculate `byMaterial` rows by human label + EPD slug so duplicate
 * IFC material expressIds with the same display name collapse for summary views.
 */

export type MaterialCalcLine = {
  materialLabel: string;
  kgCO2e: number;
  epdSlug: string;
  ifcMaterialExpressId?: number;
  elementCount?: number;
  compactQuantities?: string;
  calculationNote?: string | null;
  /**
   * Quantity magnitude used for conversion in Phase 3 calculate.
   * Comes from API rows as `activityMetric` (preferred) or `quantityValue` (fallback).
   */
  activityMetric?: number;
};

export type MaterialCalcGroup = {
  groupKey: string;
  humanLabel: string;
  epdSlug: string;
  totalKgCO2e: number;
  ifcMaterialCount: number;
  lines: MaterialCalcLine[];
  /** For Step 4 ordering: largest quantity magnitude first. */
  maxActivityMetric: number;
};

/** Remove trailing ` (IFC expressId 123)` from API material labels. */
export function stripIfcExpressIdSuffix(label: string): string {
  return String(label ?? "")
    .replace(/\s*\(IFC expressId\s+\d+\)\s*$/i, "")
    .trim();
}

export function groupMaterialCalcRows(rows: unknown[] | undefined): MaterialCalcGroup[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const map = new Map<
    string,
    { humanLabel: string; epdSlug: string; lines: MaterialCalcLine[] }
  >();

  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const humanLabel = stripIfcExpressIdSuffix(String(row.materialLabel ?? ""));
    const epdSlug = String(row.epdSlug ?? "—").trim() || "—";
    const key = JSON.stringify({ humanLabel, epdSlug });

    const line: MaterialCalcLine = {
      materialLabel: String(row.materialLabel ?? ""),
      kgCO2e: Number(row.kgCO2e ?? 0),
      epdSlug,
      ifcMaterialExpressId:
        row.ifcMaterialExpressId != null && Number.isFinite(Number(row.ifcMaterialExpressId))
          ? Number(row.ifcMaterialExpressId)
          : undefined,
      elementCount:
        typeof row.elementCount === "number" && Number.isFinite(row.elementCount)
          ? row.elementCount
          : undefined,
      compactQuantities:
        typeof row.compactQuantities === "string" ? row.compactQuantities : undefined,
      calculationNote:
        row.calculationNote == null ? null : String(row.calculationNote),
      activityMetric:
        (typeof (row as any).activityMetric === "number" &&
        Number.isFinite((row as any).activityMetric)
          ? (row as any).activityMetric
          : typeof (row as any).quantityValue === "number" &&
              Number.isFinite((row as any).quantityValue)
            ? (row as any).quantityValue
            : undefined),
    };

    const existing = map.get(key);
    if (existing) {
      existing.lines.push(line);
    } else {
      map.set(key, { humanLabel, epdSlug, lines: [line] });
    }
  }

  const groups: MaterialCalcGroup[] = [];
  for (const { humanLabel, epdSlug, lines } of map.values()) {
    const totalKgCO2e = Number(
      lines.reduce((s, l) => s + (Number.isFinite(l.kgCO2e) ? l.kgCO2e : 0), 0).toFixed(6)
    );

    const maxActivityMetric = lines.reduce((m, l) => {
      const v = l.activityMetric;
      if (v == null || !Number.isFinite(v)) return m;
      return Math.max(m, v);
    }, 0);

    lines.sort((a, b) => {
      const dq = (b.activityMetric ?? 0) - (a.activityMetric ?? 0);
      if (dq !== 0) return dq;
      const d = b.kgCO2e - a.kgCO2e;
      if (d !== 0) return d;
      return (a.ifcMaterialExpressId ?? 0) - (b.ifcMaterialExpressId ?? 0);
    });
    groups.push({
      groupKey: JSON.stringify({ humanLabel, epdSlug }),
      humanLabel,
      epdSlug,
      totalKgCO2e,
      ifcMaterialCount: lines.length,
      lines,
      maxActivityMetric,
    });
  }

  // Step 4: order by biggest quantities first (quantity magnitude),
  // tie-break by biggest carbon.
  return groups.sort((a, b) => {
    const dq = b.maxActivityMetric - a.maxActivityMetric;
    if (dq !== 0) return dq;
    const dc = b.totalKgCO2e - a.totalKgCO2e;
    if (dc !== 0) return dc;
    return a.humanLabel.localeCompare(b.humanLabel);
  });
}
