import type { EpdFromKb } from "@/lib/kb-read-epd";

/**
 * Shared Phase 3 carbon conversion helpers.
 *
 * Intentionally mirrors the logic in `src/app/api/calculate/route.ts` so we can compute
 * CO2 for a different grouping granularity (e.g. signature-level) without drifting.
 */

function parseQuantityField(compact: string, re: RegExp): number | null {
  const m = re.exec(compact);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function pickFirstNumber(compact: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const v = parseQuantityField(compact, re);
    if (v != null) return v;
  }
  return null;
}

function pickVolumeM3(compact: string): number | null {
  const net = pickFirstNumber(compact, [
    /NetVolume:\s*([0-9eE+.-]+)/i,
    /NetV:\s*([0-9eE+.-]+)/i,
  ]);
  const gross = pickFirstNumber(compact, [
    /GrossVolume:\s*([0-9eE+.-]+)/i,
    /GV:\s*([0-9eE+.-]+)/i,
  ]);
  if (net == null && gross == null) return null;
  const n = net ?? 0;
  const g = gross ?? 0;
  if (n > 0) return n;
  if (g > 0) return g;
  if (net != null || gross != null) return n || g;
  return null;
}

function pickAreaM2(compact: string): number | null {
  const fields = [
    pickFirstNumber(compact, [/NetArea:\s*([0-9eE+.-]+)/i, /\bNA:\s*([0-9eE+.-]+)/i, /\bNA\s+([0-9eE+.-]+)/i]),
    pickFirstNumber(compact, [/GrossArea:\s*([0-9eE+.-]+)/i, /\bGA:\s*([0-9eE+.-]+)/i]),
    pickFirstNumber(compact, [/NetSideArea:\s*([0-9eE+.-]+)/i, /\bNSA:\s*([0-9eE+.-]+)/i]),
    pickFirstNumber(compact, [/GrossSideArea:\s*([0-9eE+.-]+)/i, /\bGSA:\s*([0-9eE+.-]+)/i]),
    pickFirstNumber(compact, [/NetFootprintArea:\s*([0-9eE+.-]+)/i, /\bNFPA:\s*([0-9eE+.-]+)/i]),
    pickFirstNumber(compact, [/GrossFootprintArea:\s*([0-9eE+.-]+)/i, /\bGFPA:\s*([0-9eE+.-]+)/i]),
  ];
  const hasAny = fields.some((v) => v != null);
  if (!hasAny) return null;
  for (const v of fields) {
    if (v != null && v > 0) return v;
  }
  for (const v of fields) {
    if (v != null) return v;
  }
  return null;
}

function pickLengthM(compact: string): number | null {
  const fields = [
    parseQuantityField(compact, /Length:\s*([0-9eE+.-]+)/i),
    parseQuantityField(compact, /Width:\s*([0-9eE+.-]+)/i),
    parseQuantityField(compact, /Height:\s*([0-9eE+.-]+)/i),
  ];
  const hasAny = fields.some((v) => v != null);
  if (!hasAny) return null;
  for (const v of fields) {
    if (v != null && v > 0) return v;
  }
  for (const v of fields) {
    if (v != null) return v;
  }
  return null;
}

export function parsePrimaryQuantity(compact: string): {
  value: number;
  kind: "mass" | "volume" | "area" | "length" | "none";
} {
  const mass = parseQuantityField(compact, /Mass:\s*([0-9eE+.-]+)/i);
  if (mass != null && mass > 0) {
    return { value: mass, kind: "mass" };
  }

  const vol = pickVolumeM3(compact);
  if (vol != null && vol > 0) {
    return { value: vol, kind: "volume" };
  }

  const area = pickAreaM2(compact);
  if (area != null && area > 0) {
    return { value: area, kind: "area" };
  }

  const len = pickLengthM(compact);
  if (len != null && len > 0) {
    return { value: len, kind: "length" };
  }

  if (vol != null) {
    return { value: vol, kind: "volume" };
  }
  if (area != null) {
    return { value: area, kind: "area" };
  }
  if (len != null) {
    return { value: len, kind: "length" };
  }
  if (mass != null) {
    return { value: mass, kind: "mass" };
  }
  return { value: 0, kind: "none" };
}

/**
 * Infer `layerThicknessMeters` from a label containing `...115mm` / `18 mm`.
 * Matches exactly the existing heuristic in `src/app/api/calculate/route.ts`.
 */
export function inferLayerThicknessMetersFromLabel(label: string): number | undefined {
  const m = /\b(\d+(?:[.,]\d+)?)\s*mm\b/i.exec(label);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n / 1000;
}

function declaredUnitIsPerKg(declaredUnit: string): boolean {
  const u = declaredUnit.toLowerCase();
  return u === "kg" || u.startsWith("kg ") || u.includes("per kg") || u.includes("kilogram");
}

function declaredUnitIsPerM3(declaredUnit: string): boolean {
  const u = declaredUnit.toLowerCase().replace(/\s/g, "");
  return u.includes("m3") || u.includes("m³") || u.includes("m^3");
}

/**
 * KBOB / some datasets use `m2` GWP (e.g. window frames).
 */
function declaredUnitIsPerM2(declaredUnit: string): boolean {
  const u = declaredUnit.toLowerCase().replace(/\s/g, "");
  if (u.includes("m3") || u.includes("m³") || u.includes("kg")) return false;
  return u.includes("m2") || u.includes("m²");
}

export function computeKgCO2e(args: {
  quantityKind: string;
  quantityValue: number;
  epd: EpdFromKb;
  /** Optional: m — from KB `ont:layerThickness` or inferred from `…115mm` in label. */
  layerThicknessMeters?: number;
}): {
  kgCO2e: number | null;
  activityKg?: number;
  note?: string;
} {
  const gwp = args.epd.gwpPerUnit;
  if (gwp == null || !Number.isFinite(gwp)) {
    return { kgCO2e: null, note: "missing_gwp_in_kb" };
  }

  const du = args.epd.declaredUnit ?? "";

  if (declaredUnitIsPerM3(du) && args.quantityKind === "volume") {
    return { kgCO2e: args.quantityValue * gwp };
  }

  if (declaredUnitIsPerM2(du) && args.quantityKind === "area") {
    if (args.quantityValue <= 0) {
      return { kgCO2e: null, note: "zero_area_quantity" };
    }
    return {
      kgCO2e: args.quantityValue * gwp,
      note: "per_m2_gwp_times_area",
    };
  }

  if (declaredUnitIsPerKg(du) || du.length === 0) {
    if (args.quantityKind === "mass") {
      const kg = args.quantityValue;
      return { kgCO2e: kg * gwp, activityKg: kg };
    }

    if (args.quantityKind === "volume" && args.epd.densityKgPerM3 != null) {
      const kg = args.quantityValue * args.epd.densityKgPerM3;
      return { kgCO2e: kg * gwp, activityKg: kg };
    }

    if (args.quantityKind === "volume") {
      return { kgCO2e: null, note: "volume_need_density_for_per_kg_gwp" };
    }

    if (
      args.quantityKind === "area" &&
      args.epd.densityKgPerM3 != null &&
      args.layerThicknessMeters != null &&
      args.layerThicknessMeters > 0
    ) {
      const volM3 = args.quantityValue * args.layerThicknessMeters;
      const kg = volM3 * args.epd.densityKgPerM3;
      return {
        kgCO2e: kg * gwp,
        activityKg: kg,
        note: "assumed_per_kg_via_area_layer_thickness_density",
      };
    }

    return { kgCO2e: null, note: `quantity_${args.quantityKind}_unsupported_for_per_kg` };
  }

  if (args.quantityKind === "mass") {
    return {
      kgCO2e: args.quantityValue * gwp,
      activityKg: args.quantityValue,
      note: "assumed_per_kg_gwp",
    };
  }

  if (args.quantityKind === "volume" && args.epd.densityKgPerM3 != null) {
    const kg = args.quantityValue * args.epd.densityKgPerM3;
    return {
      kgCO2e: kg * gwp,
      activityKg: kg,
      note: "assumed_per_kg_gwp_via_density",
    };
  }

  return { kgCO2e: null, note: "cannot_map_quantity_to_gwp" };
}

