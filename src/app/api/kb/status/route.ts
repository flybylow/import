import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

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

function getLitValue(store: any, subject: any, predicate: any) {
  const term = store.any(subject, predicate, null);
  return term?.value;
}

function safeNum(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
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

type KBGraph = {
  materials: Array<{
    materialId: number;
    materialName: string;
    hasEPD: boolean;
    epdSlug?: string;
    matchType?: string;
    matchConfidence?: number;
  }>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
};

function buildFullKBGraph(kbTtl: string, materialIdsTotal: Set<number>): KBGraph {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const SCHEMA_URI = "http://schema.org/";
  const SCHEMA = $rdf.Namespace(SCHEMA_URI);

  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const epdMap = new Map<string, { epdSlug: string; epdName: string }>();
  const materials: KBGraph["materials"] = [];
  const links: KBGraph["links"] = [];

  const getMaterialName = (id: number) => {
    const mat = materialNode(id);
    return (
      getLitValue(store, mat, SCHEMA("name")) ||
      getLitValue(store, mat, BIM("layerSetName")) ||
      getLitValue(store, mat, ONT("layerSetName")) ||
      getLitValue(store, mat, ONT("standardName")) ||
      `material-${id}`
    );
  };

  for (const id of Array.from(materialIdsTotal.values()).sort((a, b) => a - b)) {
    const mat = materialNode(id);
    const epdTerm = store.any(mat, ONT("hasEPD"), null);

    const matchType = getLitValue(store, mat, ONT("matchType"));
    const matchConfidence = safeNum(getLitValue(store, mat, ONT("matchConfidence")));

    if (!epdTerm?.value) {
      materials.push({
        materialId: id,
        materialName: getMaterialName(id),
        hasEPD: false,
      });
      continue;
    }

    const epdSlugMatch = /epd-(.+)$/.exec(epdTerm.value);
    if (!epdSlugMatch) {
      materials.push({
        materialId: id,
        materialName: getMaterialName(id),
        hasEPD: false,
      });
      continue;
    }

    const epdSlug = epdSlugMatch[1];
    const epd = epdNode(epdSlug);
    const epdName = getLitValue(store, epd, SCHEMA("name")) || epdSlug;

    if (!epdMap.has(epdSlug)) epdMap.set(epdSlug, { epdSlug, epdName });

    materials.push({
      materialId: id,
      materialName: getMaterialName(id),
      hasEPD: true,
      epdSlug,
      matchType,
      matchConfidence,
    });
    links.push({ materialId: id, epdSlug });
  }

  const epds = Array.from(epdMap.values()).sort((a, b) =>
    a.epdSlug.localeCompare(b.epdSlug)
  );

  return { materials, epds, links };
}

function buildMatchingPreview(kbTtl: string, args: {
  matchedIds: number[];
  unmatchedIds: number[];
  limitMatched: number;
  limitUnmatched: number;
}): MatchingPreview {
  const { matchedIds, unmatchedIds, limitMatched, limitUnmatched } = args;

  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const SCHEMA_URI = "http://schema.org/";
  const SCHEMA = $rdf.Namespace(SCHEMA_URI);

  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const getMaterialName = (id: number) => {
    const mat = materialNode(id);
    return (
      getLitValue(store, mat, SCHEMA("name")) ||
      getLitValue(store, mat, BIM("layerSetName")) ||
      getLitValue(store, mat, ONT("layerSetName")) ||
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
    const epdName = getLitValue(store, epd, SCHEMA("name")) || epdSlug;
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;

  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const kbPathOnDisk = path.join(dataDir, `${projectId}-kb.ttl`);

  if (!fs.existsSync(kbPathOnDisk)) {
    return NextResponse.json(
      { error: `KB not found: data/${projectId}-kb.ttl` },
      { status: 404 }
    );
  }

  const kbTtl = fs.readFileSync(kbPathOnDisk, "utf-8");

  const elementCount = extractElementExpressIds(kbTtl).size;
  const materialIdsTotal = extractMaterialExpressIds(kbTtl);
  const epdMatchedMaterialIds = extractMaterialIdsWithHasEpd(kbTtl);
  const matchedSet = new Set(epdMatchedMaterialIds);
  const epdUnmatchedMaterialIds = Array.from(materialIdsTotal)
    .filter((id) => !matchedSet.has(id))
    .sort((a, b) => a - b);

  const matchingPreview = buildMatchingPreview(kbTtl, {
    matchedIds: epdMatchedMaterialIds,
    unmatchedIds: epdUnmatchedMaterialIds,
    limitMatched: 20,
    limitUnmatched: 10,
  });

  const kbGraph = buildFullKBGraph(kbTtl, materialIdsTotal);

  return NextResponse.json({
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    elementCount,
    epdCoverage: {
      materialsTotal: materialIdsTotal.size,
      materialsWithEPD: epdMatchedMaterialIds.length,
      materialsWithoutEPD: epdUnmatchedMaterialIds.length,
    },
    matchingPreview,
    kbGraph,
  });
}

