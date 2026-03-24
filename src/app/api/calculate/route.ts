import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import {
  buildEpdLookupFromStore,
  calculationBlockedReason,
  parseKbStore,
  readLayerThicknessMetersFromKbStore,
  type EpdFromKb,
} from "@/lib/kb-read-epd";
import {
  materialDisplayNameFromStore,
  parseMaterialExpressIdFromSelectionRow,
} from "@/lib/material-label";

export const runtime = "nodejs";

type CalculateSelectionRow = {
  key: string;
  materialLabel: string;
  epd: string;
  /** Required for KB GWP lookup; fallback: parse from `epd` label. */
  epdSlug?: string;
  /** Present when UI groups rows; first id is used for IFC label resolution. */
  materialIds?: number[];
  elementCount: number;
  quantityRecordCount: number;
  compactQuantities: string;
};

type CalculateRequest = {
  projectId?: string;
  selection?: CalculateSelectionRow[];
};

function calcLog(message: string, data?: unknown) {
  const tag = `[bimimport][CalculateAPI] ${new Date().toISOString()}`;
  if (data !== undefined) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}

function toSafeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeTurtleString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Parse `Label: 12.34` style fields from `compactQuantities` trace strings. */
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

/**
 * Prefer net volume when positive; otherwise gross when net is zero/missing.
 * Avoids `NetVolume: 0` winning over `GrossVolume: 0.48` (exporter quirks).
 * Accepts UI abbreviations: `NetV`, `GV` (see calculate page compact string).
 */
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

/**
 * Same net-first idea for area: first positive among net/gross/side variants.
 * Accepts abbreviations: `NA`, `GA`, `NSA`, `GSA`, … and `NA 123` (no colon).
 */
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

function parsePrimaryQuantity(compact: string): {
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
 * If enrich did not set `ont:layerThickness`, infer from labels like `115mm` / `18 mm` (→ m).
 */
function inferLayerThicknessMetersFromLabel(label: string): number | undefined {
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

/** KBOB / some datasets use `m2` GWP (e.g. window frames). */
function declaredUnitIsPerM2(declaredUnit: string): boolean {
  const u = declaredUnit.toLowerCase().replace(/\s/g, "");
  if (u.includes("m3") || u.includes("m³") || u.includes("kg")) return false;
  return u.includes("m2") || u.includes("m²");
}

function epdSlugFromLabel(epd: string): string | null {
  const idx = epd.indexOf(" (");
  if (idx > 0) return epd.slice(0, idx).trim();
  return epd.trim() || null;
}

function computeKgCO2e(args: {
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

export async function POST(request: Request) {
  const startedAt = performance.now();
  let body: CalculateRequest;
  try {
    body = (await request.json()) as CalculateRequest;
  } catch {
    calcLog("invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = String(body?.projectId ?? "").trim();
  const selection = Array.isArray(body?.selection) ? body.selection : [];
  calcLog("request received", {
    projectId: projectId || "(empty)",
    selectionCount: selection.length,
  });
  if (!projectId) {
    calcLog("reject: missing projectId");
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }
  if (!selection.length) {
    calcLog("reject: empty selection", { projectId });
    return NextResponse.json(
      { error: "Missing `selection` (at least one selected row required)" },
      { status: 400 }
    );
  }

  const dataDir = path.join(process.cwd(), "data");
  const kbPath = path.join(dataDir, `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) {
    calcLog("reject: KB missing", { projectId, kbPath: `data/${projectId}-kb.ttl` });
    return NextResponse.json(
      {
        error: `No KB at data/${projectId}-kb.ttl — build Phase 2 KB first.`,
      },
      { status: 400 }
    );
  }
  const kbTtl = fs.readFileSync(kbPath, "utf-8");
  const kbStore = parseKbStore(kbTtl);
  if (!kbStore) {
    calcLog("reject: KB Turtle parse failed", { projectId });
    return NextResponse.json(
      { error: "KB Turtle could not be parsed. Rebuild Phase 2 KB." },
      { status: 500 }
    );
  }
  const epdLookup = buildEpdLookupFromStore(kbStore);
  calcLog("KB loaded", {
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    kbBytes: Buffer.byteLength(kbTtl, "utf-8"),
  });

  /** Phase A: no calculation on placeholder / non-LCA EPD nodes in the KB. */
  const blocked: Array<{ key: string; epdSlug: string; reason: string }> = [];
  for (const row of selection) {
    const slug = row.epdSlug?.trim() || epdSlugFromLabel(row.epd);
    if (!slug) {
      blocked.push({
        key: row.key,
        epdSlug: "—",
        reason: "missing_epd_slug",
      });
      continue;
    }
    const epd = epdLookup.getBySlug(slug);
    const block = calculationBlockedReason(epd);
    if (block) {
      blocked.push({ key: row.key, epdSlug: slug, reason: block });
    }
  }

  if (blocked.length > 0) {
    calcLog("blocked by Phase A gate", {
      projectId,
      blockedCount: blocked.length,
      blockedSample: blocked.slice(0, 5),
    });
    return NextResponse.json(
      {
        error:
          "Calculation blocked (Phase A): selection includes EPD rows without verifiable LCA data in the KB (placeholder dictionary routing or missing GWP). Remove them or hydrate EPDs from a source / manual data.",
        blocked,
      },
      { status: 422 }
    );
  }

  const dataGaps: Array<{ key: string; reason: string }> = [];

  const byMaterial = selection.map((row) => {
    const slug = row.epdSlug?.trim() || epdSlugFromLabel(row.epd);
    const epd = slug ? epdLookup.getBySlug(slug) : {};

    const firstGroupedId =
      Array.isArray(row.materialIds) && row.materialIds.length ? row.materialIds[0] : undefined;
    const expressId =
      firstGroupedId != null && Number.isFinite(Number(firstGroupedId))
        ? Number(firstGroupedId)
        : parseMaterialExpressIdFromSelectionRow(row);
    const humanName =
      expressId != null ? materialDisplayNameFromStore(kbStore, expressId) : row.materialLabel;
    const labelForThickness =
      typeof humanName === "string" && humanName.trim() ? humanName : row.materialLabel;
    const thicknessFromKb =
      expressId != null ? readLayerThicknessMetersFromKbStore(kbStore, expressId) : undefined;
    const thicknessInferred = inferLayerThicknessMetersFromLabel(labelForThickness);
    const layerThicknessMeters = thicknessFromKb ?? thicknessInferred;

    const { value: quantityValue, kind: quantityKind } = parsePrimaryQuantity(
      row.compactQuantities
    );

    const calc = computeKgCO2e({
      quantityKind,
      quantityValue,
      epd,
      layerThicknessMeters,
    });

    if (calc.kgCO2e == null && calc.note) {
      dataGaps.push({ key: row.key, reason: calc.note });
    }

    const kgCO2e =
      calc.kgCO2e != null && Number.isFinite(calc.kgCO2e)
        ? Number(calc.kgCO2e.toFixed(6))
        : 0;

    const materialLabelResolved =
      expressId != null
        ? `${humanName} (IFC expressId ${expressId})`
        : row.materialLabel;

    return {
      ...row,
      materialLabel: materialLabelResolved,
      ifcMaterialExpressId: expressId ?? undefined,
      epdSlug: slug ?? "—",
      quantityKind,
      quantityValue,
      activityMetric: quantityValue,
      layerThicknessMetersFromKb: thicknessFromKb ?? null,
      layerThicknessMetersInferred: thicknessInferred ?? null,
      activityKg: calc.activityKg,
      gwpPerUnitFromKb: epd.gwpPerUnit ?? null,
      declaredUnitFromKb: epd.declaredUnit ?? null,
      densityKgPerM3FromKb: epd.densityKgPerM3 ?? null,
      factorKgCO2ePerUnit: epd.gwpPerUnit ?? null,
      calculationNote: calc.note ?? null,
      kgCO2e,
    };
  });

  const totalKgCO2e = Number(
    byMaterial.reduce((sum, row) => sum + row.kgCO2e, 0).toFixed(6)
  );
  calcLog("row calculation complete", {
    projectId,
    selectedCount: selection.length,
    byMaterialCount: byMaterial.length,
    totalKgCO2e,
    dataGapsCount: dataGaps.length,
    dataGapsSample: dataGaps.slice(0, 5),
  });

  const byEpdMap = new Map<string, { epd: string; kgCO2e: number; count: number }>();
  for (const row of byMaterial) {
    const prev = byEpdMap.get(row.epd) ?? { epd: row.epd, kgCO2e: 0, count: 0 };
    prev.kgCO2e += row.kgCO2e;
    prev.count += 1;
    byEpdMap.set(row.epd, prev);
  }
  const byEpd = Array.from(byEpdMap.values()).map((v) => ({
    ...v,
    kgCO2e: Number(v.kgCO2e.toFixed(6)),
  }));

  const calculatedAt = new Date().toISOString();
  const calculationId = calculatedAt;

  const result = {
    projectId,
    calculationId,
    cached: false,
    totalKgCO2e,
    selectedCount: selection.length,
    byMaterial,
    byEpd,
    dataGaps,
    meta: {
      methodology:
        "IFC quantity totals (from enriched graph) × GWP/density from Phase 2 KB TTL (`ont:gwpPerUnit`, `ont:density`, `ont:declaredUnit`). Phase A gate: EPD must not be `ont:epdDataProvenance` placeholder routing-only and must have `ont:gwpPerUnit`.",
      calculatedAt,
      apiVersion: 2,
      kbPathUsed: `data/${projectId}-kb.ttl`,
    },
  };

  const latestPath = path.join(dataDir, `${projectId}-calc-latest.json`);
  const ttlPath = path.join(dataDir, `${projectId}-calc.ttl`);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(latestPath, JSON.stringify(result, null, 2), "utf-8");

  const calcNodeId = `calc-${toSafeSlug(projectId)}`;
  const materialTriples = byMaterial
    .map((row) => {
      const node = `calc-material-${toSafeSlug(row.key)}`;
      return [
        `bim:${node}`,
        `    a ont:CalculationItem;`,
        `    schema:name "${escapeTurtleString(row.materialLabel)}";`,
        `    ont:epdLabel "${escapeTurtleString(row.epd)}";`,
        `    ont:epdSlug "${escapeTurtleString(String(row.epdSlug))}";`,
        `    ont:activityMetric "${row.activityMetric}"^^xsd:decimal;`,
        `    ont:quantityKind "${escapeTurtleString(row.quantityKind)}";`,
        row.factorKgCO2ePerUnit != null
          ? `    ont:gwpPerUnit "${row.factorKgCO2ePerUnit}"^^xsd:decimal;`
          : `    ont:gwpPerUnit "0"^^xsd:decimal;`,
        `    ont:kgCO2e "${row.kgCO2e}"^^xsd:decimal;`,
        `    ont:partOfCalculation bim:${calcNodeId} .`,
        ``,
      ].join("\n");
    })
    .join("\n");

  const epdTriples = byEpd
    .map((row) => {
      const node = `calc-epd-${toSafeSlug(row.epd)}`;
      return [
        `bim:${node}`,
        `    a ont:CalculationEPDSummary;`,
        `    schema:name "${escapeTurtleString(row.epd)}";`,
        `    ont:kgCO2e "${row.kgCO2e}"^^xsd:decimal;`,
        `    ont:itemCount "${row.count}"^^xsd:integer;`,
        `    ont:partOfCalculation bim:${calcNodeId} .`,
        ``,
      ].join("\n");
    })
    .join("\n");

  const calcTtl = [
    `@prefix dct: <http://purl.org/dc/terms/>.`,
    `@prefix schema: <http://schema.org/>.`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.`,
    `@prefix bim: <https://tabulas.eu/bim/>.`,
    `@prefix ont: <https://tabulas.eu/ontology/>.`,
    ``,
    `bim:${calcNodeId}`,
    `    a ont:CalculationRun;`,
    `    ont:projectId "${escapeTurtleString(projectId)}";`,
    `    dct:created "${calculatedAt}"^^xsd:dateTime;`,
    `    ont:methodology "${escapeTurtleString(result.meta.methodology)}";`,
    `    ont:selectedCount "${selection.length}"^^xsd:integer;`,
    `    ont:totalKgCO2e "${totalKgCO2e}"^^xsd:decimal;`,
    `    ont:kbSource "${escapeTurtleString(result.meta.kbPathUsed)}" .`,
    ``,
    materialTriples,
    epdTriples,
  ].join("\n");

  fs.writeFileSync(ttlPath, calcTtl, "utf-8");
  calcLog("artifacts persisted", {
    projectId,
    latestPath: `data/${projectId}-calc-latest.json`,
    ttlPath: `data/${projectId}-calc.ttl`,
  });
  calcLog("done", {
    projectId,
    elapsedMs: Math.round(performance.now() - startedAt),
  });

  return NextResponse.json(
    {
      ...result,
      latestPath: `data/${projectId}-calc-latest.json`,
      ttlPath: `data/${projectId}-calc.ttl`,
    },
    { status: 200 }
  );
}
