import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import $rdf from 'rdflib';
import { escapeTurtleString, toSafeSlug } from '../lib/utilities';
import { calculateKgCO2e, checkBlockedEpds, createCalculationResult, loadKbFile, parseRequestJson, summarizeByEpd, validateProjectId } from './calculate-utils';

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const body = await parseRequestJson(request);
    const projectId = validateProjectId(body.projectId);

    const kbTtl = loadKbFile(projectId);
    const kbStore = $rdf.graph();
    $rdf.parse(kbTtl, kbStore, 'http://example.org', 'text/turtle');
    const epdLookup = buildEpdLookupFromStore(kbStore);

    const blocked = checkBlockedEpds(selection, epdLookup);
    if (blocked.length > 0) {
      return handleBlockedEpds(blocked);
    }

    const byMaterial = calculateKgCO2e(selection, kbStore, epdLookup);
    const totalKgCO2e = sumKgCO2e(byMaterial);

    const byEpd = summarizeByEpd(byMaterial);
    const result = createCalculationResult(projectId, byMaterial, byEpd, totalKgCO2e);

    saveArtifacts(result);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    calcLog("error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    const elapsedMs = Math.round(performance.now() - startedAt);
    calcLog("done", { projectId, elapsedMs });
  }
}

function buildEpdLookupFromStore(kbStore: $rdf.Store): EpdLookup {
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

function handleBlockedEpds(blocked: Array<{ key: string; epdSlug: string; reason: string }>): NextResponse {
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

function saveArtifacts(result: CalculationResult) {
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

function createMaterialTriple(row: CalculateResultRow, calcNodeId: string): string {
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

function createEpdTriple(row: { epdSlug: string; epdName: string; kgCO2e: number; count: number }, calcNodeId: string): string {
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
