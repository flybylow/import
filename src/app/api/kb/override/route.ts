import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

import { computeTripleDiff } from "@/lib/diff-triples";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA_URI = "http://schema.org/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";
const DCTERMS_URI = "http://purl.org/dc/terms/";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const RDF = $rdf.Namespace(RDF_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const XSD = $rdf.Namespace(XSD_URI);
const DCTERMS = $rdf.Namespace(DCTERMS_URI);

function isoNow() {
  return new Date().toISOString();
}

function toLitDecimal(n: number) {
  return $rdf.lit(n.toString(), undefined, XSD("decimal"));
}

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

function extractMaterialIdsWithHasEpd(kbTtl: string): number[] {
  const store = $rdf.graph();
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

function safeNum(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function getLitValue(store: any, subject: any, predicate: any) {
  const term = store.any(subject, predicate, null);
  return term?.value;
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

function buildMatchingPreview(kbTtl: string, args: {
  matchedIds: number[];
  unmatchedIds: number[];
  limitMatched: number;
  limitUnmatched: number;
}): MatchingPreview {
  const { matchedIds, unmatchedIds, limitMatched, limitUnmatched } = args;
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const SCHEMA = $rdf.Namespace(SCHEMA_URI);
  const ONT = $rdf.Namespace(ONT_URI);

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
      (getLitValue(store, epd, SCHEMA("name")) as string) || epdSlug;
    return { epdSlug, epdName };
  };

  const matched: MatchingPreview["matched"] = [];
  for (const id of matchedIds.slice(0, limitMatched)) {
    const info = getEpdInfo(id);
    if (!info) continue;
    matched.push({
      materialId: id,
      materialName: getMaterialName(id),
      epdSlug: info.epdSlug,
      epdName: info.epdName,
      matchType: getLitValue(store, materialNode(id), ONT("matchType")),
      matchConfidence: safeNum(
        getLitValue(store, materialNode(id), ONT("matchConfidence"))
      ),
    });
  }

  const unmatched: MatchingPreview["unmatched"] = [];
  for (const id of unmatchedIds.slice(0, limitUnmatched)) {
    unmatched.push({ materialId: id, materialName: getMaterialName(id) });
  }

  return { matched, unmatched };
}

type EpdCatalogEntry = { epdSlug: string; epdName: string };

function extractEpdCatalog(kbTtl: string): EpdCatalogEntry[] {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const SCHEMA = $rdf.Namespace(SCHEMA_URI);
  const epdTerms = store.statementsMatching(null as any, RDF("type"), ONT("EPD"));

  const seen = new Set<string>();
  const out: EpdCatalogEntry[] = [];
  for (const st of epdTerms) {
    const subj = st.subject;
    const m = /epd-(.+)$/.exec(subj.value);
    if (!m) continue;
    const epdSlug = m[1];
    if (seen.has(epdSlug)) continue;
    seen.add(epdSlug);

    const epdNode = BIM(`epd-${epdSlug}`);
    const nameLit = store.any(epdNode, SCHEMA("name"), null);
    out.push({ epdSlug, epdName: (nameLit?.value as string) || epdSlug });
  }

  out.sort((a, b) => a.epdSlug.localeCompare(b.epdSlug));
  return out;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body?.projectId as string | undefined;
  const overrides = body?.overrides as
    | Array<{ materialId: number; epdSlug: string }>
    | undefined;

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

    // Remove previous EPD links so we don't keep duplicates.
    const oldEpdStmts = store.statementsMatching(matNode, ONT("hasEPD"), null);
    for (const st of oldEpdStmts) store.removeStatement(st);

    store.add(matNode, ONT("hasEPD"), epdNode);

    // Provenance / provenance metadata.
    // If the material was previously matched by dictionary, this overwrites matchType/confidence.
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

  const newTtl = $rdf.serialize(null as any, store, null as any, "text/turtle") as string;
  fs.writeFileSync(kbPath, newTtl, "utf-8");

  const diff = computeTripleDiff({ oldTtl, newTtl, previewMax: 80 });

  const elementIdsTotal = extractMaterialExpressIds(enrichedTtl);
  const epdMatchedMaterialIds = extractMaterialIdsWithHasEpd(newTtl);
  const epdMatchedSet = new Set(epdMatchedMaterialIds);
  const epdUnmatchedMaterialIds = Array.from(elementIdsTotal)
    .filter((id) => !epdMatchedSet.has(id))
    .sort((a, b) => a - b);

  const matchingPreview = buildMatchingPreview(newTtl, {
    matchedIds: epdMatchedMaterialIds,
    unmatchedIds: epdUnmatchedMaterialIds,
    limitMatched: 20,
    limitUnmatched: 10,
  });

  const epdCatalog = extractEpdCatalog(newTtl);

  return NextResponse.json({
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    ttl: newTtl,
    diff,
    epdCoverage: {
      materialsTotal: elementIdsTotal.size,
      materialsWithEPD: epdMatchedMaterialIds.length,
      materialsWithoutEPD: epdUnmatchedMaterialIds.length,
      matchedPreview: epdMatchedMaterialIds.slice(0, 60),
      unmatchedPreview: epdUnmatchedMaterialIds.slice(0, 60),
    },
    matchingPreview,
    epdCatalog,
  });
}

