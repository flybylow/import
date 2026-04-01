import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import $rdf from 'rdflib';
import { escapeTurtleString, toSafeSlug } from '../lib/utilities';

export type CalculateRequest = {
  projectId?: string;
  selection: Array<{
    key: string;
    epd: string;
    materialLabel: string;
    compactQuantities: string;
  }>;
};

export type CalculateResultRow = {
  key: string;
  materialLabel: string;
  ifcMaterialExpressId: number | null;
  epdSlug: string;
  quantityKind: string;
  quantityValue: number;
  activityMetric: number;
  layerThicknessMetersFromKb: number | null;
  layerThicknessMetersInferred: number | null;
  activityKg: number;
  gwpPerUnitFromKb: number | null;
  declaredUnitFromKb: string | null;
  densityKgPerM3FromKb: number | null;
  factorKgCO2ePerUnit: number | null;
  calculationNote: string | null;
  kgCO2e: number;
};

export type CalculationResult = {
  projectId: string;
  calculationId: string;
  cached: boolean;
  totalKgCO2e: number;
  selectedCount: number;
  byMaterial: Array<CalculateResultRow>;
  byEpd: Array<{ epdSlug: string; epdName: string; kgCO2e: number; count: number }>;
  dataGaps: Array<{ key: string; reason: string }>;
  meta: {
    methodology: string;
    calculatedAt: string;
    apiVersion: number;
    kbPathUsed: string;
  };
};

export type EpdLookup = {
  getBySlug: (epdSlug: string) => { gwpPerUnit?: number; declaredUnit?: string; densityKgPerM3?: number } | null;
};

export async function parseRequestJson(request: Request): Promise<CalculateRequest> {
  let body: CalculateRequest;
  try {
    body = (await request.json()) as CalculateRequest;
  } catch {
    throw new Error("Invalid JSON body");
  }
  return body;
}

export function validateProjectId(projectId: string | undefined): string {
  if (!projectId) throw new Error("Missing `projectId`");
  if (!isSafeProjectId(projectId)) throw new Error("Invalid `projectId` (use letters, numbers, - and _ only)");
  return projectId.trim();
}

function isSafeProjectId(projectId: string): boolean {
  return /^[a-zA-Z0-9-_]+$/.test(projectId);
}

export function loadKbFile(projectId: string): string {
  const dataDir = path.join(process.cwd(), "data");
  const kbPath = path.join(dataDir, `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) throw new Error(`No KB at ${kbPath}`);
  return fs.readFileSync(kbPath, "utf-8");
}

export function buildEpdLookupFromStore(kbStore: $rdf.Store): EpdLookup {
  const epdLookup: EpdLookup = {
    getBySlug: (epdSlug) => {
      const epdNode = kbStore.sym(`http://example.org/${epdSlug}`);
      if (!kbStore.holds(epdNode, RDF("type"), ONT("EPD"))) return null;
      const gwpPerUnit = kbStore.any(epdNode, ONT("gwpPerUnit"))?.value;
      const declaredUnit = kbStore.any(epdNode, ONT("declaredUnit"))?.value;
      const densityKgPerM3 = kbStore.any(epdNode, ONT("density"))?.value;
      return { gwpPerUnit, declaredUnit, densityKgPerM3 };
    },
  };
  return epdLookup;
}

export function checkBlockedEpds(selection: Array<{ key: string; epd: string }>, epdLookup: EpdLookup): Array<{ key: string; epdSlug: string; reason: string }> {
  const blocked: Array<{ key: string; epdSlug: string; reason: string }> = [];
  for (const row of selection) {
    const slug = getEpdSlug(row.epd);
    if (!slug) {
      blocked.push({ key: row.key, epdSlug: "—", reason: "missing_epd_slug" });
      continue;
    }
    const epd = epdLookup.getBySlug(slug);
    const block = calculationBlockedReason(epd);
    if (block) {
      blocked.push({ key: row.key, epdSlug: slug, reason: block });
    }
  }
  return blocked;
}

export function handleBlockedEpds(blocked: Array<{ key: string; epdSlug: string; reason: string }>): NextResponse {
  calcLog("blocked by Phase A gate", { blockedCount: blocked.length, blockedSample: blocked.slice(0, 5) });
  return NextResponse.json(
    {
      error:
        "Calculation blocked (Phase A): selection includes EPD rows without verifiable LCA data in the KB (placeholder dictionary routing or missing GWP). Remove them or hydrate EPDs from a source / manual data.",
      blocked,
    },
    { status: 422 }
  );
}

export function calculateKgCO2e(selection: Array<{ key: string; epd: string }>, kbStore: $rdf.Store, epdLookup: EpdLookup): Array<CalculateResultRow> {
  return selection.map((row) => {
    const slug = getEpdSlug(row.epd);
    const epd = slug ? epdLookup.getBySlug(slug) : {};

    const expressId = parseMaterialExpressIdFromSelectionRow(row);
    const humanName = materialDisplayNameFromStore(kbStore, expressId ?? 0);
    const layerThicknessMeters = readLayerThicknessMetersFromKbStore(kbStore, expressId ?? 0);

    const { value: quantityValue, kind: quantityKind } = parsePrimaryQuantity(row.compactQuantities);

    const calc = computeKgCO2e({
      quantityKind,
      quantityValue,
      epd,
      layerThicknessMeters,
    });

    return {
      key: row.key,
      materialLabel: humanName,
      ifcMaterialExpressId: expressId,
      epdSlug: slug ?? "—",
      quantityKind,
      quantityValue,
      activityMetric: quantityValue,
      layerThicknessMetersFromKb: layerThicknessMeters,
      layerThicknessMetersInferred: null,
      activityKg: calc.activityKg,
      gwpPerUnitFromKb: epd.gwpPerUnit ?? null,
      declaredUnitFromKb: epd.declaredUnit ?? null,
      densityKgPerM3FromKb: epd.densityKgPerM3 ?? null,
      factorKgCO2ePerUnit: epd.gwpPerUnit ?? null,
      calculationNote: calc.note ?? null,
      kgCO2e: calc.kgCO2e != null ? Number(calc.kgCO2e.toFixed(6)) : 0,
    };
  });
}

export function sumKgCO2e(byMaterial: Array<CalculateResultRow>): number {
  return byMaterial.reduce((sum, row) => sum + row.kgCO2e, 0);
}

export function summarizeByEpd(byMaterial: Array<CalculateResultRow>): Array<{ epdSlug: string; epdName: string; kgCO2e: number; count: number }> {
  const byEpdMap = new Map<string, { epdSlug: string; epdName: string; kgCO2e: number; count: number }>();
  for (const row of byMaterial) {
    const slug = getEpdSlug(row.epd);
    if (!slug) continue;

    const prev = byEpdMap.get(slug) ?? { epdSlug: slug, epdName: "", kgCO2e: 0, count: 0 };
    prev.kgCO2e += row.kgCO2e;
    prev.count += 1;
    byEpdMap.set(slug, prev);
  }
  return Array.from(byEpdMap.values()).map((v) => ({
    epd: `${v.epdSlug} (${v.epdName})`,
    ...v,
    kgCO2e: Number(v.kgCO2e.toFixed(6)),
  }));
}

export function createCalculationResult(projectId: string, byMaterial: Array<CalculateResultRow>, byEpd: Array<{ epdSlug: string; epdName: string; kgCO2e: number; count: number }>, totalKgCO2e: number): CalculationResult {
  const calculatedAt = new Date().toISOString();
  const calculationId = calculatedAt;

  return {
    projectId,
    calculationId,
    cached: false,
    totalKgCO2e,
    selectedCount: byMaterial.length,
    byMaterial,
    byEpd,
    dataGaps: [],
    meta: {
      methodology:
        "IFC quantity totals (from enriched graph) × GWP/density from Phase 2 KB TTL (`ont:gwpPerUnit`, `ont:density`, `ont:declaredUnit`). Phase A gate: EPD must not be `ont:epdDataProvenance` placeholder routing-only and must have `ont:gwpPerUnit`.",
      calculatedAt,
      apiVersion: 2,
      kbPathUsed: `data/${projectId}-kb.ttl`,
    },
  };
}

export function saveArtifacts(result: CalculationResult) {
  const latestPath = path.join(process.cwd(), "data", `${result.projectId}-calc-latest.json`);
  const ttlPath = path.join(process.cwd(), "data", `${result.projectId}-calc.ttl`);

  fs.mkdirSync(path.dirname(ttlPath), { recursive: true });

  fs.writeFileSync(latestPath, JSON.stringify(result, null, 2), "utf-8");

  const calcNodeId = `calc-${toSafeSlug(result.projectId)}`;
  const materialTriples = result.byMaterial.map((row) => createMaterialTriple(row, calcNodeId));
  const epdTriples = result.byEpd.map((row) => createEpdTriple(row, calcNodeId));

  const calcTtl = [
    `@prefix dct: <http://purl.org/dc/terms/>.`,
    `@prefix schema: <http://schema.org/>.`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.`,
    `@prefix bim: <https://tabulas.eu/bim/>.`,
    `@prefix ont: <https://tabulas.eu/ontology/>.`,
    ``,
    `bim:${calcNodeId}`,
    `    a ont:CalculationRun;`,
    `    ont:projectId "${escapeTurtleString(result.projectId)}";`,
    `    dct:created "${calculatedAt}"^^xsd:dateTime;`,
    `    ont:methodology "${escapeTurtleString(result.meta.methodology)}";`,
    `    ont:selectedCount "${result.selectedCount}"^^xsd:integer;`,
    `    ont:totalKgCO2e "${result.totalKgCO2e}"^^xsd:decimal;`,
    `    ont:kbSource "${escapeTurtleString(result.meta.kbPathUsed)}" .`,
    ``,
    ...materialTriples,
    ...epdTriples,
  ].join("\n");

  fs.writeFileSync(ttlPath, calcTtl, "utf-8");
}

export function createMaterialTriple(row: CalculateResultRow, calcNodeId: string): string {
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
}

export function createEpdTriple(row: { epdSlug: string; epdName: string; kgCO2e: number; count: number }, calcNodeId: string): string {
  const node = `calc-epd-${toSafeSlug(row.epdSlug)}`;
  return [
    `bim:${node}`,
    `    a ont:CalculationEPDSummary;`,
    `    schema:name "${escapeTurtleString(row.epdName)}";`,
    `    ont:epdSlug "${escapeTurtleString(row.epdSlug)}";`,
    `    ont:kgCO2e "${row.kgCO2e}"^^xsd:decimal;`,
    `    ont:itemCount "${row.count}"^^xsd:integer;`,
    `    ont:partOfCalculation bim:${calcNodeId} .`,
    ``,
  ].join("\n");
}

function getEpdSlug(epd: string): string | null {
  const slug = epd.trim();
  return slug === "" ? null : slug;
}
