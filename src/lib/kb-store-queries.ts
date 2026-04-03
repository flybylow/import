/**
 * Shared RDF helpers for KB Turtle: one parse per request, reuse the same Store
 * for coverage, previews, catalog, and graph (avoids triple-parse in /api/kb).
 */
import * as $rdf from "rdflib";

import { calculationBlockedReason } from "@/lib/kb-read-epd";
import {
  materialDisplayNameFromStore,
  readMaterialLabelPartsFromStore,
} from "@/lib/material-label";
import type { UnmatchedMaterialRowKind } from "@/lib/material-unmatched-diagnostics";
import { unmatchedMaterialDiagnostics } from "@/lib/material-unmatched-diagnostics";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA_URI = "http://schema.org/";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const RDF = $rdf.Namespace(RDF_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);

export function parseKbTtlToStore(kbTtl: string): $rdf.Store {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");
  return store;
}

export function extractMaterialExpressIdsFromTtl(ttl: string): Set<number> {
  const ids = new Set<number>();
  const re = /bim:material-(\d+)/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(ttl))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

export function extractElementExpressIdsFromTtl(ttl: string): Set<number> {
  const ids = new Set<number>();
  const re = /bim:element-(\d+)/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(ttl))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

export function extractMaterialIdsWithHasEpdFromStore(
  store: $rdf.Store
): number[] {
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

function getLitValue(store: $rdf.Store, subject: any, predicate: any) {
  const term = store.any(subject, predicate, null);
  return term?.value;
}

function safeNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export type MatchingPreview = {
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
    schemaName?: string;
    layerSetName?: string;
    standardName?: string;
    ifcType?: string;
    normalizedForMatch: string;
    flowHint: string;
    suggestedApiQuery: string;
    rowKind: UnmatchedMaterialRowKind;
    rowKindLabel: string;
  }>;
};

export type KBGraph = {
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
    epdDataProvenance?: string;
    hasGwp: boolean;
    lcaReady: boolean;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
  /** IFC elements (bim:element-*) that have `ont:madeOf` in the KB. */
  elements?: Array<{
    expressId: number;
    elementName?: string;
    ifcType?: string;
  }>;
  /** Per-element material links: IFC element express id → material id (`mat-{id}` in the graph). */
  elementMaterialLinks?: Array<{ expressId: number; materialId: number }>;
};

export function buildFullKBGraph(
  store: $rdf.Store,
  materialIdsTotal: Set<number>
): KBGraph {
  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const epdMap = new Map<
    string,
    {
      epdSlug: string;
      epdName: string;
      epdDataProvenance?: string;
      hasGwp: boolean;
      lcaReady: boolean;
    }
  >();
  const materials: KBGraph["materials"] = [];
  const links: KBGraph["links"] = [];

  const getMaterialName = (id: number) =>
    materialDisplayNameFromStore(store, id);

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
    const gwp = safeNum(getLitValue(store, epd, ONT("gwpPerUnit")));
    const prov = getLitValue(store, epd, ONT("epdDataProvenance")) as
      | string
      | undefined;
    const lcaReady =
      calculationBlockedReason({
        gwpPerUnit: gwp,
        epdDataProvenance: prov,
      }) === null;

    if (!epdMap.has(epdSlug)) {
      epdMap.set(epdSlug, {
        epdSlug,
        epdName,
        epdDataProvenance: prov,
        hasGwp: gwp != null,
        lcaReady,
      });
    }

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

  const elementMap = new Map<
    number,
    { expressId: number; elementName?: string; ifcType?: string }
  >();
  const elementMaterialLinks: KBGraph["elementMaterialLinks"] = [];
  const seenElementMaterial = new Set<string>();

  const madeOfStmts = store.statementsMatching(
    null as any,
    ONT("madeOf"),
    null as any
  );
  for (const st of madeOfStmts) {
    const em = /element-(\d+)$/.exec(st.subject.value);
    const mm = /material-(\d+)$/.exec(st.object.value);
    if (!em || !mm) continue;
    const expressId = Number(em[1]);
    const materialId = Number(mm[1]);
    if (!Number.isFinite(expressId) || !Number.isFinite(materialId)) continue;
    const pairKey = `${expressId}\0${materialId}`;
    if (seenElementMaterial.has(pairKey)) continue;
    seenElementMaterial.add(pairKey);
    elementMaterialLinks.push({ expressId, materialId });

    if (!elementMap.has(expressId)) {
      const elementName =
        getLitValue(store, st.subject, SCHEMA("name")) || undefined;
      const ifcType =
        getLitValue(store, st.subject, ONT("ifcType")) || undefined;
      elementMap.set(expressId, { expressId, elementName, ifcType });
    }
  }

  const elements = Array.from(elementMap.values()).sort(
    (a, b) => a.expressId - b.expressId
  );

  return { materials, epds, links, elements, elementMaterialLinks };
}

export function buildMatchingPreview(
  store: $rdf.Store,
  args: {
    matchedIds: number[];
    unmatchedIds: number[];
    limitMatched: number;
    limitUnmatched: number;
  }
): MatchingPreview {
  const { matchedIds, unmatchedIds, limitMatched, limitUnmatched } = args;

  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const getMaterialName = (id: number) =>
    materialDisplayNameFromStore(store, id);

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
    const parts = readMaterialLabelPartsFromStore(store, id);
    const diag = unmatchedMaterialDiagnostics(id, parts);
    unmatched.push({
      materialId: id,
      materialName: getMaterialName(id),
      schemaName: parts.schemaName ?? undefined,
      layerSetName: parts.layerSetName ?? undefined,
      standardName: parts.standardName ?? undefined,
      ifcType: parts.ifcType ?? undefined,
      normalizedForMatch: diag.normalizedForMatch,
      flowHint: diag.flowHint,
      suggestedApiQuery: diag.suggestedApiQuery,
      rowKind: diag.rowKind,
      rowKindLabel: diag.rowKindLabel,
    });
  }

  return { matched, unmatched };
}

export type EpdCatalogEntry = { epdSlug: string; epdName: string };

export function extractEpdCatalogFromStore(
  store: $rdf.Store
): EpdCatalogEntry[] {
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
    const epd = BIM(`epd-${epdSlug}`);
    const nameLit = store.any(epd, SCHEMA("name"), null);
    catalog.push({
      epdSlug,
      epdName: (nameLit?.value as string) || epdSlug,
    });
  }

  catalog.sort((a, b) => a.epdSlug.localeCompare(b.epdSlug));
  return catalog;
}
