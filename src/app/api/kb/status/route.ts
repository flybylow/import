import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

import { getAvailableEpdsCatalog } from "@/lib/available-epds";
import { calculationBlockedReason } from "@/lib/kb-read-epd";
import { extractMatchedSourceBreakdownFromStore } from "@/lib/kb-epd-stats";
import { materialDisplayNameFromStore } from "@/lib/material-label";
import {
  buildFullKBGraph,
  buildMatchingPreview,
  extractElementExpressIdsFromTtl,
  extractMaterialExpressIdsFromTtl,
  extractMaterialIdsWithHasEpdFromStore,
  parseKbTtlToStore,
} from "@/lib/kb-store-queries";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA_URI = "http://schema.org/";
const BOT_URI = "https://w3id.org/bot#";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const RDF = $rdf.Namespace(RDF_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const BOT = $rdf.Namespace(BOT_URI);

function getLitValue(store: any, subject: any, predicate: any) {
  const term = store.any(subject, predicate, null);
  return term?.value;
}

function safeNum(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

type MaterialQuantityTrace = {
  materialId: number;
  materialName: string;
  epdSlug: string;
  epdName: string;
  elementCount: number;
  quantityRecordCount: number;
  quantityTotals: Array<{
    quantityName: string;
    unit?: string;
    total: number;
    count: number;
  }>;
};

function buildMaterialQuantityTrace(
  store: $rdf.Store,
  matchedMaterialIds: number[]
): MaterialQuantityTrace[] {
  const SCHEMA_URI = "http://schema.org/";
  const SCHEMA = $rdf.Namespace(SCHEMA_URI);

  const materialNode = (id: number) => BIM(`material-${id}`);
  const epdNode = (slug: string) => BIM(`epd-${slug}`);

  const getMaterialName = (id: number) => materialDisplayNameFromStore(store, id);

  const traces: MaterialQuantityTrace[] = [];
  for (const materialId of matchedMaterialIds) {
    const mat = materialNode(materialId);
    const epdTerm = store.any(mat, ONT("hasEPD"), null);
    if (!epdTerm?.value) continue;
    const epdSlugMatch = /epd-(.+)$/.exec(epdTerm.value);
    if (!epdSlugMatch) continue;
    const epdSlug = epdSlugMatch[1];
    const epdName = getLitValue(store, epdNode(epdSlug), SCHEMA("name")) || epdSlug;

    const elementStmts = store.statementsMatching(null as any, ONT("madeOf"), mat);
    const elementValues = Array.from(new Set(elementStmts.map((s) => s.subject.value)));
    const elementNodes = elementValues.map((v) => $rdf.sym(v));

    const totals = new Map<
      string,
      { quantityName: string; unit?: string; total: number; count: number }
    >();
    let quantityRecordCount = 0;

    for (const element of elementNodes) {
      const qtyStmts = store.statementsMatching(element, ONT("hasIfcQuantity"), null as any);
      for (const st of qtyStmts) {
        const qtyNode = st.object;
        const quantityName = getLitValue(store, qtyNode, ONT("ifcQuantityName")) || "unknown";
        const unit = getLitValue(store, qtyNode, ONT("ifcQuantityUnit")) || undefined;
        const value = safeNum(getLitValue(store, qtyNode, ONT("ifcQuantityValue")));
        if (value == null) continue;

        const key = `${quantityName}||${unit ?? ""}`;
        const prev = totals.get(key) ?? {
          quantityName,
          unit,
          total: 0,
          count: 0,
        };
        prev.total += value;
        prev.count += 1;
        totals.set(key, prev);
        quantityRecordCount += 1;
      }
    }

    const quantityTotals = Array.from(totals.values())
      .map((q) => ({
        ...q,
        total: Number(q.total.toFixed(6)),
      }))
      .sort((a, b) => {
        const n = a.quantityName.localeCompare(b.quantityName);
        if (n !== 0) return n;
        return (a.unit ?? "").localeCompare(b.unit ?? "");
      });

    traces.push({
      materialId,
      materialName: getMaterialName(materialId),
      epdSlug,
      epdName,
      elementCount: elementNodes.length,
      quantityRecordCount,
      quantityTotals,
    });
  }

  return traces.sort((a, b) => a.materialId - b.materialId);
}

export type ElementPassportMaterial = {
  materialId: number;
  materialName: string;
  hasEPD: boolean;
  epdSlug?: string;
  epdName?: string;
  matchType?: string;
  matchConfidence?: number;
  lcaReady?: boolean;
  declaredUnit?: string;
  gwpPerUnit?: number;
  densityKgPerM3?: number;
};

export type ElementPassport = {
  elementId: number;
  elementName?: string;
  ifcType?: string;
  globalId?: string;
  expressId?: number;
  /** When deduping by name: how many `bim:element-*` share this name key (same trimmed `schema:name`). */
  sameNameElementCount?: number;
  materials: ElementPassportMaterial[];
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
};

function getMaterialDisplayName(store: $rdf.Store, materialId: number): string {
  return materialDisplayNameFromStore(store, materialId);
}

/** Stable key for passport dedupe: same `schema:name` (trimmed, case-insensitive) → one card; unnamed → per-id. */
function elementPassportNameKey(store: $rdf.Store, elementId: number): string {
  const el = BIM(`element-${elementId}`);
  const elementName = getLitValue(store, el, SCHEMA("name")) || undefined;
  const trimmed = elementName?.trim();
  if (trimmed) return trimmed.toLowerCase();
  return `__unnamed__:${elementId}`;
}

function buildOneElementPassport(
  store: $rdf.Store,
  id: number
): ElementPassport {
  const el = BIM(`element-${id}`);
  const elementName = getLitValue(store, el, SCHEMA("name")) || undefined;
  const ifcType = getLitValue(store, el, ONT("ifcType")) || undefined;
  const globalId = getLitValue(store, el, ONT("globalId")) || undefined;
  const expressId = safeNum(getLitValue(store, el, ONT("expressId")));

  const ifcQuantities: ElementPassport["ifcQuantities"] = [];
  const qtyStmts = store.statementsMatching(el, ONT("hasIfcQuantity"), null as any);
  for (const st of qtyStmts) {
    const qtyNode = st.object;
    const quantityName =
      getLitValue(store, qtyNode, ONT("ifcQuantityName")) || "unknown";
    const unit = getLitValue(store, qtyNode, ONT("ifcQuantityUnit")) || undefined;
    const value = safeNum(getLitValue(store, qtyNode, ONT("ifcQuantityValue")));
    if (value == null) continue;
    ifcQuantities.push({
      quantityName,
      unit,
      value: Number(value.toFixed(8)),
    });
  }
  ifcQuantities.sort((a, b) => a.quantityName.localeCompare(b.quantityName));

  const materials: ElementPassportMaterial[] = [];
  const madeStmts = store.statementsMatching(el, ONT("madeOf"), null as any);
  for (const st of madeStmts) {
    const obj = st.object;
    const mm = /material-(\d+)$/.exec(String(obj.value));
    if (!mm) continue;
    const mid = Number(mm[1]);
    const mat = BIM(`material-${mid}`);
    const epdTerm = store.any(mat, ONT("hasEPD"), null);
    let epdSlug: string | undefined;
    let epdName: string | undefined;
    let hasEPD = false;
    if (epdTerm?.value) {
      const sm = /epd-(.+)$/.exec(epdTerm.value);
      if (sm) {
        hasEPD = true;
        epdSlug = sm[1];
        const epn = BIM(`epd-${epdSlug}`);
        epdName = getLitValue(store, epn, SCHEMA("name")) || epdSlug;
      }
    }
    const matchType = getLitValue(store, mat, ONT("matchType")) || undefined;
    const matchConfidence = safeNum(getLitValue(store, mat, ONT("matchConfidence")));

    let lcaReady: boolean | undefined;
    let declaredUnit: string | undefined;
    let gwpPerUnit: number | undefined;
    let densityKgPerM3: number | undefined;

    if (epdSlug) {
      const ep = BIM(`epd-${epdSlug}`);
      gwpPerUnit = safeNum(getLitValue(store, ep, ONT("gwpPerUnit")));
      declaredUnit = getLitValue(store, ep, ONT("declaredUnit")) || undefined;
      densityKgPerM3 = safeNum(getLitValue(store, ep, ONT("density")));
      const prov = getLitValue(store, ep, ONT("epdDataProvenance")) as
        | string
        | undefined;
      lcaReady =
        calculationBlockedReason({
          gwpPerUnit: gwpPerUnit,
          epdDataProvenance: prov,
        }) === null;
    }

    materials.push({
      materialId: mid,
      materialName: getMaterialDisplayName(store, mid),
      hasEPD,
      epdSlug,
      epdName,
      matchType,
      matchConfidence,
      lcaReady,
      declaredUnit,
      gwpPerUnit,
      densityKgPerM3,
    });
  }

  return {
    elementId: id,
    elementName,
    ifcType,
    globalId,
    expressId: expressId ?? id,
    materials,
    ifcQuantities,
  };
}

function buildElementPassports(
  store: $rdf.Store,
  limit: number,
  options: { uniqueByElementName: boolean }
): {
  rows: ElementPassport[];
  total: number;
  totalElements: number;
} {
  const stmts = store.statementsMatching(null as any, RDF("type"), BOT("Element"));
  const elementIds = new Set<number>();
  for (const st of stmts) {
    const m = /element-(\d+)$/.exec(String(st.subject.value));
    if (m) {
      const id = Number(m[1]);
      if (Number.isFinite(id)) elementIds.add(id);
    }
  }

  const sorted = Array.from(elementIds.values()).sort((a, b) => a - b);
  const totalElements = sorted.length;

  const uniqueKeys = new Set<string>();
  for (const id of sorted) {
    uniqueKeys.add(elementPassportNameKey(store, id));
  }
  const totalUniqueNames = uniqueKeys.size;

  if (limit <= 0) {
    return {
      rows: [],
      total: options.uniqueByElementName ? totalUniqueNames : totalElements,
      totalElements,
    };
  }

  if (!options.uniqueByElementName) {
    const rows = sorted
      .slice(0, limit)
      .map((id) => buildOneElementPassport(store, id));
    return { rows, total: totalElements, totalElements };
  }

  const nameKeyCounts = new Map<string, number>();
  for (const id of sorted) {
    const k = elementPassportNameKey(store, id);
    nameKeyCounts.set(k, (nameKeyCounts.get(k) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const rows: ElementPassport[] = [];
  for (const id of sorted) {
    const key = elementPassportNameKey(store, id);
    if (seen.has(key)) continue;
    seen.add(key);
    const row = buildOneElementPassport(store, id);
    const cnt = nameKeyCounts.get(key) ?? 1;
    rows.push({
      ...row,
      sameNameElementCount: cnt > 1 ? cnt : undefined,
    });
    if (rows.length >= limit) break;
  }

  return { rows, total: totalUniqueNames, totalElements };
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

  const rawPassportLimit = url.searchParams.get("elementPassportsLimit");
  const parsedPassportLimit =
    rawPassportLimit != null ? Number(rawPassportLimit) : 80;
  const elementPassportsLimit = Math.min(
    300,
    Math.max(0, Number.isFinite(parsedPassportLimit) ? parsedPassportLimit : 80)
  );

  const uniqueByElementName =
    url.searchParams.get("elementPassportsUniqueName") !== "false";

  /** When false, skip per-element passport rows (still one KB parse). Faster Calculate dashboard first paint. */
  const includeElementPassports =
    url.searchParams.get("includeElementPassports") !== "false";

  const rawMatchedLimit = url.searchParams.get("matchedLimit");
  const parsedMatched =
    rawMatchedLimit != null ? Number(rawMatchedLimit) : 20;
  const matchedLimit = Math.min(
    500,
    Math.max(0, Number.isFinite(parsedMatched) ? parsedMatched : 20)
  );

  const rawUnmatchedLimit = url.searchParams.get("unmatchedLimit");
  const parsedUnmatched =
    rawUnmatchedLimit != null ? Number(rawUnmatchedLimit) : 10;
  const unmatchedLimit = Math.min(
    5000,
    Math.max(0, Number.isFinite(parsedUnmatched) ? parsedUnmatched : 10)
  );

  const store = parseKbTtlToStore(kbTtl);

  const elementCount = extractElementExpressIdsFromTtl(kbTtl).size;
  const materialIdsTotal = extractMaterialExpressIdsFromTtl(kbTtl);
  const epdMatchedMaterialIds = extractMaterialIdsWithHasEpdFromStore(store);
  const matchedSet = new Set(epdMatchedMaterialIds);
  const epdUnmatchedMaterialIds = Array.from(materialIdsTotal)
    .filter((id) => !matchedSet.has(id))
    .sort((a, b) => a - b);

  const elementPassportBundle = includeElementPassports
    ? buildElementPassports(store, elementPassportsLimit, {
        uniqueByElementName,
      })
    : {
        rows: [] as ElementPassport[],
        total: elementCount,
        totalElements: elementCount,
      };

  const matchingPreview = buildMatchingPreview(store, {
    matchedIds: epdMatchedMaterialIds,
    unmatchedIds: epdUnmatchedMaterialIds,
    limitMatched: matchedLimit,
    limitUnmatched: unmatchedLimit,
  });

  const sourceBreakdown = extractMatchedSourceBreakdownFromStore(store);

  const kbGraph = buildFullKBGraph(store, materialIdsTotal);
  const materialQuantityTrace = buildMaterialQuantityTrace(
    store,
    epdMatchedMaterialIds
  );

  const epdCatalog = getAvailableEpdsCatalog();

  return NextResponse.json({
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    elementCount,
    epdCoverage: {
      materialsTotal: materialIdsTotal.size,
      materialsWithEPD: epdMatchedMaterialIds.length,
      materialsWithoutEPD: epdUnmatchedMaterialIds.length,
      sourceBreakdown,
    },
    matchingPreview,
    epdCatalog,
    kbGraph,
    materialQuantityTrace,
    elementPassports: elementPassportBundle.rows,
    elementPassportTotal: elementPassportBundle.total,
    /** Same as counting `bot:Element` subjects in the KB (may match `elementCount`). */
    elementPassportElementsTotal: elementPassportBundle.totalElements,
    elementPassportsUniqueName: uniqueByElementName,
    elementPassportsLimit: includeElementPassports ? elementPassportsLimit : 0,
  });
}

