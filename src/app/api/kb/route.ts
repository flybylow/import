import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

import { translateLayer2FromEnrichedTtl } from "@/lib/layer2-translate";
import { computeTripleDiff } from "@/lib/diff-triples";

export const runtime = "nodejs";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const RDF = $rdf.Namespace(RDF_URI);

function extractMaterialExpressIds(ttl: string): Set<number> {
  const ids = new Set<number>();
  const re = /bim:material-(\d+)/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(ttl))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

function extractElementExpressIds(ttl: string): Set<number> {
  const ids = new Set<number>();
  const re = /bim:element-(\d+)/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(ttl))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

function extractMaterialIdsWithHasEpd(kbTtl: string): number[] {
  const store = $rdf.graph();
  // Use the project BIM namespace as base IRI so parsing works consistently.
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const matched = new Set<number>();
  const stmts = store.statementsMatching(null as any, ONT("hasEPD"), null);
  for (const st of stmts) {
    const subj = st.subject;
    const m = /material-(\d+)$/.exec(subj.value);
    if (m) {
      const id = Number(m[1]);
      if (Number.isFinite(id)) matched.add(id);
    }
  }

  return Array.from(matched.values()).sort((a, b) => a - b);
}

type MatchingPreview = {
  matched: Array<{
    materialId: number;
    materialName: string;
    matchType?: string;
    matchConfidence?: number;
    epdSlug: string;
    epdName: string;
  }>;
  unmatched: Array<{
    materialId: number;
    materialName: string;
  }>;
};

function getLitValue(store: any, subject: any, predicate: any) {
  const term = store.any(subject, predicate, null);
  return term?.value;
}

function safeNum(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildMatchingPreview(kbTtl: string, args: { matchedIds: number[]; unmatchedIds: number[]; limitMatched: number; limitUnmatched: number }): MatchingPreview {
  const { matchedIds, unmatchedIds, limitMatched, limitUnmatched } = args;

  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const SCHEMA_URI = "http://schema.org/";
  const ONT = $rdf.Namespace(ONT_URI);
  const SCHEMA = $rdf.Namespace(SCHEMA_URI);

  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const getMaterialName = (id: number) => {
    const mat = materialNode(id);
    return (
      (getLitValue(store, mat, SCHEMA("name")) as string) ||
      (getLitValue(store, mat, ONT("layerSetName")) as string) ||
      (getLitValue(store, mat, ONT("standardName")) as string) ||
      `material-${id}`
    );
  };

  const getEpdInfo = (id: number) => {
    const mat = materialNode(id);
    const epdTerm = store.any(mat, ONT("hasEPD"), null);
    if (!epdTerm?.value) return null;
    const epdSlugMatch = /epd-(.+)$/.exec(epdTerm.value);
    if (!epdSlugMatch) return null;
    const epdSlug = epdSlugMatch[1];
    const epd = epdNode(epdSlug);
    const epdName =
      (getLitValue(store, epd, SCHEMA("name")) as string) ||
      epdSlug;
    return { epdSlug, epdName };
  };

  const matched: MatchingPreview["matched"] = [];
  for (const id of matchedIds.slice(0, limitMatched)) {
    const info = getEpdInfo(id);
    if (!info) continue;
    const mat = materialNode(id);
    matched.push({
      materialId: id,
      materialName: getMaterialName(id),
      epdSlug: info.epdSlug,
      epdName: info.epdName,
      matchType: getLitValue(store, mat, ONT("matchType")),
      matchConfidence: safeNum(getLitValue(store, mat, ONT("matchConfidence"))),
    });
  }

  const unmatched: MatchingPreview["unmatched"] = [];
  for (const id of unmatchedIds.slice(0, limitUnmatched)) {
    unmatched.push({
      materialId: id,
      materialName: getMaterialName(id),
    });
  }

  return { matched, unmatched };
}

type EpdCatalogEntry = {
  epdSlug: string;
  epdName: string;
};

function extractEpdCatalog(kbTtl: string): EpdCatalogEntry[] {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const SCHEMA_URI = "http://schema.org/";
  const SCHEMA = $rdf.Namespace(SCHEMA_URI);

  const epdTerms = store.statementsMatching(
    null as any,
    RDF("type"),
    ONT("EPD")
  );

  const seen = new Set<string>();
  const catalog: EpdCatalogEntry[] = [];

  for (const st of epdTerms) {
    const subj = st.subject;
    const m = /epd-(.+)$/.exec(subj.value);
    if (!m) continue;
    const epdSlug = m[1];
    if (seen.has(epdSlug)) continue;
    seen.add(epdSlug);
    const epdNode = BIM(`epd-${epdSlug}`);
    const nameLit = store.any(epdNode, SCHEMA("name"), null);
    catalog.push({
      epdSlug,
      epdName: (nameLit?.value as string) || epdSlug,
    });
  }

  catalog.sort((a, b) => a.epdSlug.localeCompare(b.epdSlug));
  return catalog;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body?.projectId as string | undefined;
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const inputTtlPath = path.join(dataDir, `${projectId}-enriched.ttl`);
  const kbTtlPath = path.join(dataDir, `${projectId}-kb.ttl`);

  if (!fs.existsSync(inputTtlPath)) {
    return NextResponse.json(
      { error: `Input TTL not found: data/${projectId}-enriched.ttl` },
      { status: 404 }
    );
  }

  const enrichedTtl = fs.readFileSync(inputTtlPath, "utf-8");

  await translateLayer2FromEnrichedTtl({
    projectId,
    inputTtlPath,
    outputTtlPath: kbTtlPath,
  });

  const kbTtl = fs.readFileSync(kbTtlPath, "utf-8");

  const diff = computeTripleDiff({ oldTtl: enrichedTtl, newTtl: kbTtl, previewMax: 80 });

  const elementIdsTotal = extractElementExpressIds(enrichedTtl);
  const materialIdsTotal = extractMaterialExpressIds(enrichedTtl);
  const epdMatchedMaterialIds = extractMaterialIdsWithHasEpd(kbTtl);
  const epdMatchedSet = new Set(epdMatchedMaterialIds);
  const epdUnmatchedMaterialIds = Array.from(materialIdsTotal)
    .filter((id) => !epdMatchedSet.has(id))
    .sort((a, b) => a - b);

  const matchingPreview = buildMatchingPreview(kbTtl, {
    matchedIds: epdMatchedMaterialIds,
    unmatchedIds: epdUnmatchedMaterialIds,
    limitMatched: 20,
    limitUnmatched: 10,
  });

  const epdCatalog = extractEpdCatalog(kbTtl);

  return NextResponse.json({
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    ttl: kbTtl,
    diff,
    elementCount: elementIdsTotal.size,
    epdCoverage: {
      materialsTotal: materialIdsTotal.size,
      materialsWithEPD: epdMatchedMaterialIds.length,
      materialsWithoutEPD: epdUnmatchedMaterialIds.length,
      // Provide some IDs for the UI; the full list can be added later.
      matchedPreview: epdMatchedMaterialIds.slice(0, 60),
      unmatchedPreview: epdUnmatchedMaterialIds.slice(0, 60),
    },
    matchingPreview,
    epdCatalog,
  });
}

