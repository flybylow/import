/**
 * Builds a "select all calculable materials" payload for `POST /api/calculate`,
 * matching the Phase 3 UI’s per-material row shape and compact quantity strings.
 */

import { pickIfcQuantitiesForLcaCompact } from "@/lib/ifc-quantity-compact";

const QTY_COMPACT_LABEL: Record<string, string> = {
  Mass: "Mass",
  NetVolume: "NetV",
  GrossVolume: "GV",
  NetArea: "NA",
  GrossArea: "GA",
  NetSideArea: "NSA",
  GrossSideArea: "GSA",
  NetFootprintArea: "NFPA",
  GrossFootprintArea: "GFPA",
  Length: "Len",
  Width: "W",
  Height: "H",
};

export type CalculateApiSelectionRow = {
  key: string;
  materialLabel: string;
  materialIds: number[];
  epd: string;
  epdSlug: string;
  elementCount: number;
  quantityRecordCount: number;
  compactQuantities: string;
};

type QuantityTotal = {
  quantityName: string;
  unit?: string;
  total: number;
  count: number;
};

type TraceRow = {
  materialId: number;
  materialName: string;
  epdSlug: string;
  epdName: string;
  elementCount: number;
  quantityRecordCount: number;
  quantityTotals: QuantityTotal[];
};

export type KbStatusLike = {
  materialQuantityTrace?: TraceRow[];
  kbGraph?: {
    epds: Array<{ epdSlug: string; lcaReady: boolean }>;
  };
};

function compactQuantitiesFromTrace(row: TraceRow): string {
  const preferred = pickIfcQuantitiesForLcaCompact(row.quantityTotals, 3);
  if (preferred.length) {
    return preferred
      .map((q) => {
        const unit = q.unit ? ` ${q.unit}` : "";
        const label = QTY_COMPACT_LABEL[q.quantityName] ?? q.quantityName;
        return `${label}: ${q.total}${unit}`;
      })
      .join(" | ");
  }
  const first = row.quantityTotals[0];
  if (!first) return "—";
  const unit = first.unit ? ` ${first.unit}` : "";
  const label = QTY_COMPACT_LABEL[first.quantityName] ?? first.quantityName;
  return `${label}: ${first.total}${unit}`;
}

/**
 * Every material row that has quantities and an LCA-ready EPD — same default as Phase 3
 * when all calculable rows are selected.
 */
export function buildFullCalculateSelectionFromKbStatus(
  status: KbStatusLike
): CalculateApiSelectionRow[] {
  const lcaReadyBySlug = new Map<string, boolean>();
  for (const e of status.kbGraph?.epds ?? []) {
    lcaReadyBySlug.set(e.epdSlug, e.lcaReady);
  }

  const rows = status.materialQuantityTrace ?? [];
  return rows
    .filter(
      (r) =>
        r.quantityRecordCount > 0 && (lcaReadyBySlug.get(r.epdSlug) ?? false)
    )
    .map((row) => ({
      key: `mat-${row.materialId}`,
      materialLabel: `${row.materialId}: ${row.materialName}`,
      materialIds: [row.materialId],
      epd: `${row.epdSlug} (${row.epdName})`,
      epdSlug: row.epdSlug,
      elementCount: row.elementCount,
      quantityRecordCount: row.quantityRecordCount,
      compactQuantities: compactQuantitiesFromTrace(row),
    }));
}
