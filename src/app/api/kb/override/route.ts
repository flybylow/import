import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

import { computeTripleDiff } from "@/lib/diff-triples";
import { extractMatchedSourceBreakdownFromStore } from "@/lib/kb-epd-stats";
import { getAvailableEpdsCatalog } from "@/lib/available-epds";
import { ensureFillerNoEpdStub } from "@/lib/kb-epd-stubs";
import {
  buildMatchingPreview,
  extractMaterialExpressIdsFromTtl,
  extractMaterialIdsWithHasEpdFromStore,
} from "@/lib/kb-store-queries";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const XSD = $rdf.Namespace(XSD_URI);

function isoNow() {
  return new Date().toISOString();
}

function toLitDecimal(n: number) {
  return $rdf.lit(n.toString(), undefined, XSD("decimal"));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = (body as { projectId?: string })?.projectId;
  const overrides = (body as {
    overrides?: Array<{ materialId: number; epdSlug: string }>;
  })?.overrides;

  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return NextResponse.json(
      { error: "Missing `overrides` array" },
      { status: 400 }
    );
  }

  const dataDir = path.join(process.cwd(), "data");
  const enrichedPath = path.join(dataDir, `${projectId}-enriched.ttl`);
  const kbPath = path.join(dataDir, `${projectId}-kb.ttl`);

  if (!fs.existsSync(kbPath)) {
    return NextResponse.json(
      { error: `KB not found: data/${projectId}-kb.ttl` },
      { status: 404 }
    );
  }
  if (!fs.existsSync(enrichedPath)) {
    return NextResponse.json(
      { error: `Enriched not found: data/${projectId}-enriched.ttl` },
      { status: 404 }
    );
  }

  const oldTtl = fs.readFileSync(kbPath, "utf-8");
  const enrichedTtl = fs.readFileSync(enrichedPath, "utf-8");

  const store = $rdf.graph();
  $rdf.parse(oldTtl, store, BIM_URI, "text/turtle");

  for (const o of overrides) {
    const materialId = o.materialId;
    const epdSlug = o.epdSlug;
    if (!Number.isFinite(materialId) || !epdSlug) continue;

    const matNode = BIM(`material-${materialId}`);
    const epdNode = BIM(`epd-${epdSlug}`);

    const oldEpdStmts = store.statementsMatching(matNode, ONT("hasEPD"), null);
    for (const st of oldEpdStmts) store.removeStatement(st);

    store.add(matNode, ONT("hasEPD"), epdNode);

    for (const st of store.statementsMatching(matNode, ONT("matchType"), null)) {
      store.removeStatement(st);
    }
    for (const st of store.statementsMatching(matNode, ONT("matchConfidence"), null)) {
      store.removeStatement(st);
    }
    for (const st of store.statementsMatching(matNode, ONT("source"), null)) {
      store.removeStatement(st);
    }
    for (const st of store.statementsMatching(matNode, ONT("resolvedAt"), null)) {
      store.removeStatement(st);
    }

    store.add(matNode, ONT("matchType"), $rdf.lit("manual"));
    store.add(matNode, ONT("matchConfidence"), toLitDecimal(0.5));
    store.add(matNode, ONT("source"), $rdf.lit("manual-override"));
    store.add(matNode, ONT("resolvedAt"), $rdf.lit(isoNow(), undefined, XSD("dateTime")));
  }

  ensureFillerNoEpdStub(store);

  const newTtl = $rdf.serialize(null as any, store, null as any, "text/turtle") as string;
  fs.writeFileSync(kbPath, newTtl, "utf-8");

  const diff = computeTripleDiff({ oldTtl, newTtl, previewMax: 80 });

  const materialIdsTotal = extractMaterialExpressIdsFromTtl(enrichedTtl);
  const epdMatchedMaterialIds = extractMaterialIdsWithHasEpdFromStore(store);
  const epdMatchedSet = new Set(epdMatchedMaterialIds);
  const epdUnmatchedMaterialIds = Array.from(materialIdsTotal)
    .filter((id) => !epdMatchedSet.has(id))
    .sort((a, b) => a - b);

  const matchingPreview = buildMatchingPreview(store, {
    matchedIds: epdMatchedMaterialIds,
    unmatchedIds: epdUnmatchedMaterialIds,
    limitMatched: 20,
    limitUnmatched: Math.max(epdUnmatchedMaterialIds.length, 1),
  });

  const epdCatalog = getAvailableEpdsCatalog();
  const sourceBreakdown = extractMatchedSourceBreakdownFromStore(store);

  return NextResponse.json({
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    ttl: newTtl,
    diff,
    epdCoverage: {
      materialsTotal: materialIdsTotal.size,
      materialsWithEPD: epdMatchedMaterialIds.length,
      materialsWithoutEPD: epdUnmatchedMaterialIds.length,
      sourceBreakdown,
      matchedPreview: epdMatchedMaterialIds.slice(0, 60),
      unmatchedPreview: epdUnmatchedMaterialIds.slice(0, 60),
    },
    matchingPreview,
    epdCatalog,
  });
}
