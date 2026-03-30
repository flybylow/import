import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

import { parsePrimaryQuantity } from "@/lib/phase3-carbon-calc";

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
  /** KB literal `ont:epdDataProvenance` (used for compliance-level “placeholder vs real” evidence). */
  epdDataProvenance?: string;
  /** KB literal `ont:sourceProductUri` (external product / fiche URL). */
  sourceProductUri?: string;
  /** KB literal `ont:sourceFileName` (local doc identifier for `/api/file` when present). */
  sourceFileName?: string;
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

export type SignaturePassport = {
  signatureId: string;
  instanceCount: number;
  representativeElement: {
    elementId: number;
    elementName?: string;
    ifcType?: string;
    globalId?: string;
    expressId?: number;
  };
  /** Identical materials across the signature group. */
  materials: ElementPassportMaterial[];
  /** Identical BaseQuantities across the signature group. */
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
};

type SignaturePassportsCacheEntry = {
  kbMtimeMs: number;
  kbSizeBytes: number;
  orderedSignatures: SignaturePassport[];
  total: number;
};

// In-memory cache to avoid re-building + re-sorting all signature groups
// on every paginated request. Invalidated by KB file mtime/size.
const signaturePassportsCache = new Map<string, SignaturePassportsCacheEntry>();

const PREFERRED_QTY_ORDER = [
  "NetVolume",
  "GrossVolume",
  "NetArea",
  "Mass",
  "GrossArea",
  "NetSideArea",
  "GrossSideArea",
  "NetFootprintArea",
  "GrossFootprintArea",
  "Length",
  "Width",
  "Height",
] as const;

function stableStringifyForSignature(v: unknown): string {
  // Minimal stable serializer for signature keys: arrays/objects are canonicalized by sorting keys.
  // We keep it local to avoid bringing in extra deps.
  if (v == null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NaN";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map(stableStringifyForSignature).join(",")}]`;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyForSignature(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(String(v));
}

function signatureKeyFromPassport(p: ElementPassport): string {
  // Carbon/evidence depends on the EPD factors attached to materials (gwp + declared unit + density)
  // plus the BaseQuantities values for the activity metric.
  const materialSig = p.materials
    .map((m) => ({
      materialId: m.materialId,
      hasEPD: m.hasEPD,
      epdSlug: m.epdSlug ?? "",
      declaredUnit: m.declaredUnit ?? "",
      gwpPerUnit: m.gwpPerUnit ?? null,
      densityKgPerM3: m.densityKgPerM3 ?? null,
      epdDataProvenance: m.epdDataProvenance ?? "",
    }))
    .sort((a, b) => {
      const sa = [
        a.materialId,
        a.epdSlug,
        a.declaredUnit,
        String(a.gwpPerUnit),
        String(a.densityKgPerM3),
      ].join("|");
      const sb = [
        b.materialId,
        b.epdSlug,
        b.declaredUnit,
        String(b.gwpPerUnit),
        String(b.densityKgPerM3),
      ].join("|");
      return sa.localeCompare(sb);
    });

  const quantitiesSig = p.ifcQuantities
    .map((q) => ({
      quantityName: q.quantityName,
      unit: q.unit ?? "",
      value: q.value,
    }))
    .sort((a, b) => {
      const sa = `${a.quantityName}|${a.unit}|${String(a.value)}`;
      const sb = `${b.quantityName}|${b.unit}|${String(b.value)}`;
      return sa.localeCompare(sb);
    });

  return stableStringifyForSignature({
    // optional extra safety: schema:name could be included later
    materials: materialSig,
    ifcQuantities: quantitiesSig,
  });
}

function signatureIdFromKey(signatureKey: string): string {
  // Short deterministic id for grouping + UI stable key.
  const hex = createHash("sha1").update(signatureKey).digest("hex");
  return `sig-${hex.slice(0, 16)}`;
}

function activityScoreFromIfcQuantities(
  ifcQuantities: Array<{ quantityName: string; unit?: string; value: number }>
): number {
  const preferred = PREFERRED_QTY_ORDER.map((name) =>
    ifcQuantities.find((q) => q.quantityName === name)
  )
    .filter(Boolean)
    .slice(0, 3) as Array<{ quantityName: string; unit?: string; value: number }>;

  const compactParts =
    preferred.length > 0 ? preferred : ifcQuantities.length > 0 ? [ifcQuantities[0]] : [];

  const compactQuantities = compactParts.length
    ? compactParts
        .map((q) => {
          const unit = q.unit ? ` ${q.unit}` : "";
          return `${q.quantityName}: ${q.value}${unit}`;
        })
        .join(" | ")
    : "";

  const parsed = parsePrimaryQuantity(compactQuantities);
  return parsed.kind === "none" ? 0 : parsed.value;
}

function extractElementIdsFromStore(store: $rdf.Store): number[] {
  const stmts = store.statementsMatching(null as any, RDF("type"), BOT("Element"));
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const st of stmts) {
    const m = /element-(\d+)$/.exec(String(st.subject.value));
    if (!m) continue;
    const id = Number(m[1]);
    if (!Number.isFinite(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  ids.sort((a, b) => a - b);
  return ids;
}

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
    let epdDataProvenance: string | undefined;
    let sourceProductUri: string | undefined;
    let sourceFileName: string | undefined;
    let declaredUnit: string | undefined;
    let gwpPerUnit: number | undefined;
    let densityKgPerM3: number | undefined;

    if (epdSlug) {
      const ep = BIM(`epd-${epdSlug}`);
      gwpPerUnit = safeNum(getLitValue(store, ep, ONT("gwpPerUnit")));
      declaredUnit = getLitValue(store, ep, ONT("declaredUnit")) || undefined;
      densityKgPerM3 = safeNum(getLitValue(store, ep, ONT("density")));
      epdDataProvenance = getLitValue(store, ep, ONT("epdDataProvenance")) || undefined;
      sourceProductUri = getLitValue(store, ep, ONT("sourceProductUri")) || undefined;
      sourceFileName = getLitValue(store, ep, ONT("sourceFileName")) || undefined;
      const prov = epdDataProvenance;
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
      epdDataProvenance,
      sourceProductUri,
      sourceFileName,
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
  const elementPassportsMode = url.searchParams.get("elementPassportsMode") ?? "raw";
  const rawOffset = url.searchParams.get("elementPassportsOffset");
  const elementPassportsOffset = rawOffset != null ? Number(rawOffset) : 0;

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
  const kbStat = fs.statSync(kbPathOnDisk);

  const rawPassportLimit = url.searchParams.get("elementPassportsLimit");
  const parsedPassportLimit = rawPassportLimit != null ? Number(rawPassportLimit) : 80;

  const isSignatureMode = elementPassportsMode === "signature";
  const maxLimit = isSignatureMode ? 1000 : 300;

  const elementPassportsLimit = Math.min(
    maxLimit,
    Math.max(0, Number.isFinite(parsedPassportLimit) ? parsedPassportLimit : 80)
  );
  const safeOffset = Number.isFinite(elementPassportsOffset) ? elementPassportsOffset : 0;

  const uniqueByElementName =
    url.searchParams.get("elementPassportsUniqueName") !== "false";

  /** When false, skip per-element passport rows (still one KB parse). Faster Calculate dashboard first paint. */
  const includeElementPassports =
    url.searchParams.get("includeElementPassports") !== "false";

  const includeSignaturePassports = isSignatureMode && includeElementPassports;

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

  const elementPassportBundle = !includeSignaturePassports
    ? includeElementPassports
      ? buildElementPassports(store, elementPassportsLimit, {
          uniqueByElementName,
        })
      : {
          rows: [] as ElementPassport[],
          total: elementCount,
          totalElements: elementCount,
        }
    : {
        rows: [],
        total: elementCount,
        totalElements: elementCount,
      };

  let signaturePassportBundle: {
    rows: SignaturePassport[];
    total: number;
    offset: number;
    limit: number;
  } | null = null;

  if (includeSignaturePassports) {
    const cached = signaturePassportsCache.get(projectId);
    const cacheValid =
      cached &&
      cached.kbMtimeMs === kbStat.mtimeMs &&
      cached.kbSizeBytes === kbStat.size;

    let orderedSignatures: SignaturePassport[];
    let total: number;

    if (cacheValid) {
      orderedSignatures = cached!.orderedSignatures;
      total = cached!.total;
    } else {
      const allElementIds = extractElementIdsFromStore(store);
      const signatureById = new Map<
        string,
        { signature: SignaturePassport; repKey: number }
      >();

      // Iterate in increasing elementId to ensure representative element is deterministic.
      for (const elementId of allElementIds) {
        const p = buildOneElementPassport(store, elementId);
        const signatureKey = signatureKeyFromPassport(p);
        const signatureId = signatureIdFromKey(signatureKey);

        const existing = signatureById.get(signatureId);
        if (existing) {
          existing.signature.instanceCount += 1;
          continue;
        }

        const signature: SignaturePassport = {
          signatureId,
          instanceCount: 1,
          representativeElement: {
            elementId: p.elementId,
            elementName: p.elementName,
            ifcType: p.ifcType,
            globalId: p.globalId,
            expressId: p.expressId,
          },
          materials: p.materials,
          ifcQuantities: p.ifcQuantities,
        };

        signatureById.set(signatureId, { signature, repKey: elementId });
      }

      // Global ordering request:
      // Sort signatures by biggest total quantity magnitude (activity * instanceCount).
      // This ensures page 2+ continues the correct overall descending ordering.
      orderedSignatures = Array.from(signatureById.values())
        .map((v) => {
          const activityPerInstance = activityScoreFromIfcQuantities(
            v.signature.ifcQuantities
          );
          return {
            signature: v.signature,
            score: activityPerInstance * v.signature.instanceCount,
          };
        })
        .sort((a, b) => {
          const ds = b.score - a.score;
          if (ds !== 0) return ds;
          return a.signature.signatureId.localeCompare(
            b.signature.signatureId
          );
        })
        .map((v) => v.signature);

      total = orderedSignatures.length;
      signaturePassportsCache.set(projectId, {
        kbMtimeMs: kbStat.mtimeMs,
        kbSizeBytes: kbStat.size,
        orderedSignatures,
        total,
      });
    }

    const rows = orderedSignatures.slice(
      safeOffset,
      safeOffset + elementPassportsLimit
    );
    signaturePassportBundle = {
      rows,
      total,
      offset: safeOffset,
      limit: elementPassportsLimit,
    };
  }

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
    // Signature mode outputs. In raw mode these are omitted (or null) to avoid UI confusion.
    signaturePassports: signaturePassportBundle?.rows ?? undefined,
    signaturePassportTotal: signaturePassportBundle?.total ?? undefined,
    signaturePassportsOffset: signaturePassportBundle?.offset ?? undefined,
    signaturePassportsLimit: signaturePassportBundle?.limit ?? undefined,
    /** Same as counting `bot:Element` subjects in the KB (may match `elementCount`). */
    elementPassportElementsTotal: elementPassportBundle.totalElements,
    elementPassportsUniqueName: uniqueByElementName,
    elementPassportsLimit: includeElementPassports ? elementPassportsLimit : 0,
  });
}

