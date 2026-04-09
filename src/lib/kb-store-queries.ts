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

type KbGraphMaterialComposition = {
  ifcMaterialType?: string;
  layerSetName?: string;
  schemaNameRaw?: string;
  standardNameKb?: string;
  /**
   * Layers from Phase 1: IfcMaterialList names joined with ` | `, or a single `schema:name`.
   * Use for “how this passport material is composed” vs element occurrences.
   */
  compositionLayerLabels?: string[];
};

function kbGraphMaterialComposition(
  store: $rdf.Store,
  materialId: number
): KbGraphMaterialComposition {
  const p = readMaterialLabelPartsFromStore(store, materialId);
  const raw = (p.schemaName ?? "").trim();
  const compositionLayerLabels = raw
    ? raw.split("|").map((s) => s.trim()).filter(Boolean)
    : undefined;
  return {
    ifcMaterialType: p.ifcType ?? undefined,
    layerSetName: p.layerSetName ?? undefined,
    schemaNameRaw: p.schemaName ?? undefined,
    standardNameKb: p.standardName ?? undefined,
    compositionLayerLabels:
      compositionLayerLabels && compositionLayerLabels.length > 0
        ? compositionLayerLabels
        : undefined,
  };
}
import type { UnmatchedMaterialRowKind } from "@/lib/material-unmatched-diagnostics";
import { unmatchedMaterialDiagnostics } from "@/lib/material-unmatched-diagnostics";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA_URI = "http://schema.org/";
const DCT_URI = "http://purl.org/dc/terms/";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const RDF = $rdf.Namespace(RDF_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const DCT = $rdf.Namespace(DCT_URI);

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

/** One consolidated read of `bim:epd-{slug}` — same literals as element passports in `/api/kb/status`. */
function kbGraphEpdSnapshot(
  store: $rdf.Store,
  epdSlug: string,
  epdName: string
): KBGraph["epds"][number] {
  const ep = BIM(`epd-${epdSlug}`) as $rdf.NamedNode;
  const gwpPerUnit = safeNum(getLitValue(store, ep, ONT("gwpPerUnit")));
  const declaredUnit = getLitValue(store, ep, ONT("declaredUnit")) || undefined;
  const densityKgPerM3 = safeNum(getLitValue(store, ep, ONT("density")));
  const epdDataProvenance = getLitValue(store, ep, ONT("epdDataProvenance")) || undefined;
  const epdSource = getLitValue(store, ep, ONT("source")) || undefined;
  const sourceProductUri = getLitValue(store, ep, ONT("sourceProductUri")) || undefined;
  const sourceFileName = getLitValue(store, ep, ONT("sourceFileName")) || undefined;
  const producer = getLitValue(store, ep, ONT("producer")) || undefined;
  const productionLocation = getLitValue(store, ep, ONT("productionLocation")) || undefined;
  const issueDate = getLitValue(store, ep, ONT("issueDate")) || undefined;
  const validUntil = getLitValue(store, ep, ONT("validUntil")) || undefined;
  const epdIdentifier = getLitValue(store, ep, DCT("identifier")) || undefined;
  const lcaReady =
    calculationBlockedReason({
      gwpPerUnit,
      epdDataProvenance,
    }) === null;

  return {
    epdSlug,
    epdName,
    epdDataProvenance,
    epdSource,
    hasGwp: gwpPerUnit != null,
    lcaReady,
    gwpPerUnit,
    declaredUnit,
    densityKgPerM3,
    sourceProductUri,
    sourceFileName,
    producer,
    productionLocation,
    issueDate,
    validUntil,
    epdIdentifier,
  };
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
    /** `ont:source` on the material (e.g. dictionary-routed, kbob-source). */
    materialSource?: string;
    ifcMaterialType?: string;
    layerSetName?: string;
    schemaNameRaw?: string;
    standardNameKb?: string;
    compositionLayerLabels?: string[];
  }>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
    epdDataProvenance?: string;
    /** `ont:source` on the EPD — dataset id aligned with Sources imports (e.g. b-epd-be, kbob). */
    epdSource?: string;
    hasGwp: boolean;
    lcaReady: boolean;
    gwpPerUnit?: number;
    declaredUnit?: string;
    densityKgPerM3?: number;
    sourceProductUri?: string;
    sourceFileName?: string;
    producer?: string;
    productionLocation?: string;
    issueDate?: string;
    validUntil?: string;
    epdIdentifier?: string;
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
  /** Architect spec vocabulary (`ont:ArchitectSpecCategory` / `bim:archcat-*`). */
  architectSpecCategories?: Array<{ categoryId: string; label: string }>;
  materialToArchitectCategoryLinks?: Array<{
    materialId: number;
    categoryId: string;
  }>;
  epdToArchitectCategoryLinks?: Array<{ epdSlug: string; categoryId: string }>;
};

export function buildFullKBGraph(
  store: $rdf.Store,
  materialIdsTotal: Set<number>
): KBGraph {
  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const epdMap = new Map<string, KBGraph["epds"][number]>();
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
        ...kbGraphMaterialComposition(store, id),
      });
      continue;
    }

    const epdSlugMatch = /epd-(.+)$/.exec(epdTerm.value);
    if (!epdSlugMatch) {
      materials.push({
        materialId: id,
        materialName: getMaterialName(id),
        hasEPD: false,
        ...kbGraphMaterialComposition(store, id),
      });
      continue;
    }

    const epdSlug = epdSlugMatch[1];
    const epd = epdNode(epdSlug);
    const epdName = getLitValue(store, epd, SCHEMA("name")) || epdSlug;
    if (!epdMap.has(epdSlug)) {
      epdMap.set(epdSlug, kbGraphEpdSnapshot(store, epdSlug, epdName));
    }

    const materialSource = getLitValue(store, mat, ONT("source")) as string | undefined;

    materials.push({
      materialId: id,
      materialName: getMaterialName(id),
      hasEPD: true,
      epdSlug,
      matchType,
      matchConfidence,
      materialSource,
      ...kbGraphMaterialComposition(store, id),
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

  const archCategoryById = new Map<string, string>();
  const archTypeStmts = store.statementsMatching(
    null as any,
    RDF("type"),
    ONT("ArchitectSpecCategory")
  );
  for (const st of archTypeStmts) {
    const subj = st.subject as $rdf.NamedNode;
    const m = /archcat-(.+)$/.exec(subj.value);
    if (!m) continue;
    const categoryId = m[1];
    const label = getLitValue(store, subj, SCHEMA("name")) || categoryId;
    archCategoryById.set(categoryId, label);
  }

  const materialToArchitectCategoryLinks: NonNullable<
    KBGraph["materialToArchitectCategoryLinks"]
  > = [];
  const epdToArchitectCategoryLinks: NonNullable<
    KBGraph["epdToArchitectCategoryLinks"]
  > = [];

  const archRel = store.statementsMatching(
    null as any,
    ONT("architectSpecCategory"),
    null as any
  );
  for (const st of archRel) {
    const obj = st.object as $rdf.NamedNode;
    const cm = /archcat-(.+)$/.exec(obj.value);
    if (!cm) continue;
    const categoryId = cm[1];
    const sm = /material-(\d+)$/.exec(st.subject.value);
    if (sm) {
      const materialId = Number(sm[1]);
      if (Number.isFinite(materialId)) {
        materialToArchitectCategoryLinks.push({ materialId, categoryId });
      }
    }
    const se = /epd-(.+)$/.exec(st.subject.value);
    if (se) {
      epdToArchitectCategoryLinks.push({ epdSlug: se[1], categoryId });
    }
  }

  const architectSpecCategories = Array.from(archCategoryById.entries())
    .map(([categoryId, label]) => ({ categoryId, label }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId));

  return {
    materials,
    epds,
    links,
    elements,
    elementMaterialLinks,
    architectSpecCategories:
      architectSpecCategories.length > 0 ? architectSpecCategories : undefined,
    materialToArchitectCategoryLinks:
      materialToArchitectCategoryLinks.length > 0
        ? materialToArchitectCategoryLinks
        : undefined,
    epdToArchitectCategoryLinks:
      epdToArchitectCategoryLinks.length > 0
        ? epdToArchitectCategoryLinks
        : undefined,
  };
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

/** One IFC material row linked to an EPD in the KB (full project, not preview-capped). */
export type EpdLinkedMaterialRow = {
  materialId: number;
  materialName: string;
  matchType?: string;
  matchConfidence?: number;
};

/** EPD product with all `ont:hasEPD` material layers pointing at it in this KB. */
export type EpdLinkedGroup = {
  epdSlug: string;
  epdName: string;
  materials: EpdLinkedMaterialRow[];
};

/**
 * Group every material that has `ont:hasEPD` by target `bim:epd-{slug}` — for “what EPDs are in use
 * and how they’re linked” UIs. Uses the same labels as matching preview.
 */
export function buildEpdLinkedGroupsFromStore(store: $rdf.Store): EpdLinkedGroup[] {
  const matchedMaterialIds = extractMaterialIdsWithHasEpdFromStore(store);
  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);
  const map = new Map<string, EpdLinkedGroup>();

  for (const id of matchedMaterialIds) {
    const mat = materialNode(id);
    const epdTerm = store.any(mat, ONT("hasEPD"), null);
    if (!epdTerm?.value) continue;
    const epdSlugMatch = /epd-(.+)$/.exec(epdTerm.value);
    if (!epdSlugMatch) continue;
    const epdSlug = epdSlugMatch[1];
    const epd = epdNode(epdSlug);
    const epdName =
      (getLitValue(store, epd, SCHEMA("name")) as string) || epdSlug;
    let g = map.get(epdSlug);
    if (!g) {
      g = { epdSlug, epdName, materials: [] };
      map.set(epdSlug, g);
    }
    const matchType = getLitValue(store, mat, ONT("matchType")) ?? undefined;
    g.materials.push({
      materialId: id,
      materialName: materialDisplayNameFromStore(store, id),
      matchType: matchType || undefined,
      matchConfidence: safeNum(getLitValue(store, mat, ONT("matchConfidence"))),
    });
  }

  const groups = [...map.values()].map((group) => ({
    ...group,
    materials: [...group.materials].sort((a, b) => a.materialId - b.materialId),
  }));
  groups.sort((a, b) => a.epdSlug.localeCompare(b.epdSlug));
  return groups;
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
