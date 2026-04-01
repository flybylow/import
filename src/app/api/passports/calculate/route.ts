import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import * as $rdf from "rdflib";
import { createHash } from "crypto";

import {
  buildEpdLookupFromStore,
  calculationBlockedReason,
  readLayerThicknessMetersFromKbStore,
  type EpdFromKb,
} from "@/lib/kb-read-epd";
import {
  inferLayerThicknessMetersFromLabel,
  parsePrimaryQuantity,
  computeKgCO2e,
} from "@/lib/phase3-carbon-calc";
import { materialDisplayNameFromStore } from "@/lib/material-label";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const DCT = $rdf.Namespace("http://purl.org/dc/terms/");

type PassportCarbonRequest = {
  projectId?: string;
  signatureIds?: string[];
  debug?: boolean;
  debugSampleCount?: number;
};

type PassportCarbonMaterial = {
  materialId: number;
  materialName: string;
  epdSlug?: string;
  epdName?: string;
  declaredUnitFromKb?: string;
  gwpPerUnitFromKb?: number;
  densityKgPerM3FromKb?: number;
  epdDataProvenance?: string;
  sourceProductUri?: string;
  sourceFileName?: string;
  producer?: string;
  productionLocation?: string;
  issueDate?: string;
  validUntil?: string;
  epdIdentifier?: string;
  matchType?: string;
  matchConfidence?: number;
  quantityKind: string;
  activityMetric: number;
  layerThicknessMetersFromKb?: number;
  layerThicknessMetersInferred?: number;
  calculationNote?: string | null;
  kgCO2e: number;
};

type PassportCarbonSignature = {
  signatureId: string;
  instanceCount: number;
  representativeElement: {
    elementId: number;
    elementName?: string;
    ifcType?: string;
    globalId?: string;
    expressId?: number;
  };
  ifcQuantities: Array<{ quantityName: string; unit?: string; value: number }>;
  materials: PassportCarbonMaterial[];
  totalKgCO2e: number;
};

type ElementPassportMaterial = {
  materialId: number;
  materialName: string;
  hasEPD: boolean;
  epdSlug?: string;
  epdName?: string;
  matchType?: string;
  matchConfidence?: number;
  lcaReady?: boolean;
  epdDataProvenance?: string;
  sourceProductUri?: string;
  sourceFileName?: string;
  producer?: string;
  productionLocation?: string;
  issueDate?: string;
  validUntil?: string;
  epdIdentifier?: string;
  declaredUnit?: string;
  gwpPerUnit?: number;
  densityKgPerM3?: number;
};

type ElementPassport = {
  elementId: number;
  elementName?: string;
  ifcType?: string;
  globalId?: string;
  expressId?: number;
  materials: ElementPassportMaterial[];
  ifcQuantities: Array<{ quantityName: string; unit?: string; value: number }>;
};

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
      const sa = [a.materialId, a.epdSlug, a.declaredUnit, String(a.gwpPerUnit), String(a.densityKgPerM3)].join("|");
      const sb = [b.materialId, b.epdSlug, b.declaredUnit, String(b.gwpPerUnit), String(b.densityKgPerM3)].join("|");
      return sa.localeCompare(sb);
    });

  const quantitiesSig = p.ifcQuantities
    .map((q) => ({ quantityName: q.quantityName, unit: q.unit ?? "", value: q.value }))
    .sort((a, b) => {
      const sa = `${a.quantityName}|${a.unit}|${String(a.value)}`;
      const sb = `${b.quantityName}|${b.unit}|${String(b.value)}`;
      return sa.localeCompare(sb);
    });

  return stableStringifyForSignature({ materials: materialSig, ifcQuantities: quantitiesSig });
}

function signatureIdFromKey(signatureKey: string): string {
  const hex = createHash("sha1").update(signatureKey).digest("hex");
  return `sig-${hex.slice(0, 16)}`;
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

const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const BOT_URI = "https://w3id.org/bot#";
const RDF = $rdf.Namespace(RDF_URI);
const BOT = $rdf.Namespace(BOT_URI);

function buildOneElementPassport(store: $rdf.Store, elementId: number): ElementPassport {
  const el = BIM(`element-${elementId}`);
  const elementName = store.any(el as any, $rdf.Namespace("http://schema.org/")("name"), null)?.value as
    | string
    | undefined;
  const ifcType = store.any(el as any, ONT("ifcType"), null)?.value as string | undefined;
  const globalId = store.any(el as any, ONT("globalId"), null)?.value as string | undefined;
  const expressIdTerm = store.any(el as any, ONT("expressId"), null)?.value;
  const expressId = expressIdTerm != null ? Number(expressIdTerm) : undefined;

  const ifcQuantities: ElementPassport["ifcQuantities"] = [];
  const qtyStmts = store.statementsMatching(el as any, ONT("hasIfcQuantity"), null as any);
  for (const st of qtyStmts) {
    const qtyNode = st.object as $rdf.Term;
    const quantityName =
      store.any(qtyNode as any, ONT("ifcQuantityName"), null)?.value || "unknown";
    const unit = store.any(qtyNode as any, ONT("ifcQuantityUnit"), null)?.value || undefined;
    const rawVal = store.any(qtyNode as any, ONT("ifcQuantityValue"), null)?.value;
    const n = rawVal != null ? Number(rawVal) : undefined;
    if (n == null || !Number.isFinite(n)) continue;
    ifcQuantities.push({
      quantityName,
      unit,
      value: Number(n.toFixed(8)),
    });
  }
  ifcQuantities.sort((a, b) => a.quantityName.localeCompare(b.quantityName));

  const materials: ElementPassportMaterial[] = [];
  const madeStmts = store.statementsMatching(el as any, ONT("madeOf"), null as any);
  for (const st of madeStmts) {
    const obj = st.object as $rdf.Term;
    const mm = /material-(\d+)$/.exec(String(obj.value));
    if (!mm) continue;
    const mid = Number(mm[1]);
    if (!Number.isFinite(mid)) continue;

    const mat = BIM(`material-${mid}`);
    const epdTerm = store.any(mat as any, ONT("hasEPD"), null as any);

    let epdSlug: string | undefined;
    let epdName: string | undefined;
    let hasEPD = false;
    let declaredUnit: string | undefined;
    let gwpPerUnit: number | undefined;
    let densityKgPerM3: number | undefined;
    let epdDataProvenance: string | undefined;
    let sourceProductUri: string | undefined;
    let sourceFileName: string | undefined;
    let producer: string | undefined;
    let productionLocation: string | undefined;
    let issueDate: string | undefined;
    let validUntil: string | undefined;
    let epdIdentifier: string | undefined;

    if (epdTerm?.value) {
      const sm = /epd-(.+)$/.exec(epdTerm.value);
      if (sm) {
        hasEPD = true;
        epdSlug = sm[1];
        const epn = BIM(`epd-${epdSlug}`);
        epdName = store.any(epn as any, $rdf.Namespace("http://schema.org/")("name"), null)?.value || epdSlug;

        const gwpRaw = store.any(epn as any, ONT("gwpPerUnit"), null)?.value;
        const duRaw = store.any(epn as any, ONT("declaredUnit"), null)?.value;
        const densRaw = store.any(epn as any, ONT("density"), null)?.value;
        const provRaw = store.any(epn as any, ONT("epdDataProvenance"), null)?.value;
        const srcUriRaw = store.any(epn as any, ONT("sourceProductUri"), null)?.value;
        const srcFileRaw = store.any(epn as any, ONT("sourceFileName"), null)?.value;
        const producerRaw = store.any(epn as any, ONT("producer"), null)?.value;
        const productionLocationRaw = store.any(epn as any, ONT("productionLocation"), null)?.value;
        const issueDateRaw = store.any(epn as any, ONT("issueDate"), null)?.value;
        const validUntilRaw = store.any(epn as any, ONT("validUntil"), null)?.value;
        const identifierRaw = store.any(epn as any, DCT("identifier"), null)?.value;

        if (gwpRaw != null) {
          const n = Number(gwpRaw);
          if (Number.isFinite(n)) gwpPerUnit = n;
        }
        if (duRaw) declaredUnit = duRaw;
        if (densRaw != null) {
          const n = Number(densRaw);
          if (Number.isFinite(n)) densityKgPerM3 = n;
        }
        if (provRaw) epdDataProvenance = provRaw;
        if (srcUriRaw) sourceProductUri = srcUriRaw;
        if (srcFileRaw) sourceFileName = srcFileRaw;
        if (producerRaw) producer = producerRaw;
        if (productionLocationRaw) productionLocation = productionLocationRaw;
        if (issueDateRaw) issueDate = issueDateRaw;
        if (validUntilRaw) validUntil = validUntilRaw;
        if (identifierRaw) epdIdentifier = identifierRaw;
      }
    }

    const matchType = store.any(mat as any, ONT("matchType"), null)?.value || undefined;
    const matchConfidenceRaw = store.any(mat as any, ONT("matchConfidence"), null)?.value;
    const matchConfidence = matchConfidenceRaw != null ? Number(matchConfidenceRaw) : undefined;

    const lcaReady =
      epdSlug && gwpPerUnit != null
        ? calculationBlockedReason({
            gwpPerUnit,
            epdDataProvenance,
          }) === null
        : undefined;

    materials.push({
      materialId: mid,
      materialName: materialDisplayNameFromStore(store, mid),
      hasEPD,
      epdSlug,
      epdName,
      matchType,
      matchConfidence,
      lcaReady,
      declaredUnit,
      gwpPerUnit,
      densityKgPerM3,
      epdDataProvenance,
      sourceProductUri,
      sourceFileName,
      producer,
      productionLocation,
      issueDate,
      validUntil,
      epdIdentifier,
    });
  }

  return {
    elementId,
    elementName,
    ifcType,
    globalId,
    expressId: expressId != null && Number.isFinite(expressId) ? expressId : undefined,
    materials,
    ifcQuantities,
  };
}

export async function POST(request: Request) {
  let body: PassportCarbonRequest;
  try {
    body = (await request.json()) as PassportCarbonRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = String(body?.projectId ?? "").trim();
  const signatureIds = Array.isArray(body?.signatureIds) ? body.signatureIds : [];
  const debug = body?.debug === true;
  const debugSampleCount =
    typeof body?.debugSampleCount === "number" && Number.isFinite(body.debugSampleCount)
      ? Math.max(0, Math.floor(body.debugSampleCount))
      : 0;
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }
  if (!signatureIds.length && !debugSampleCount) {
    return NextResponse.json(
      { error: "Missing `signatureIds` array (or provide `debugSampleCount` for debug mode)" },
      { status: 400 }
    );
  }

  const dataDir = path.join(process.cwd(), "data");
  const kbPath = path.join(dataDir, `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) {
    return NextResponse.json({ error: `KB not found: data/${projectId}-kb.ttl` }, { status: 404 });
  }

  const kbTtl = fs.readFileSync(kbPath, "utf-8");
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");

  const epdLookup = buildEpdLookupFromStore(store);

  const elementIds = extractElementIdsFromStore(store);

  const signatureById = new Map<
    string,
    {
      signatureId: string;
      signatureKey: string;
      instanceCount: number;
      representativeElement: ElementPassport;
      signatureMaterials: ElementPassportMaterial[];
      signatureIfcs: ElementPassport["ifcQuantities"];
      signatureKeyMismatchCount: number;
    }
  >();

  // When debugSampleCount is set, we build all signature groups, then sample IDs.
  // (This is intentionally expensive; debug only.)
  const want = debugSampleCount
    ? null
    : new Set(signatureIds);

  for (const elementId of elementIds) {
    const p = buildOneElementPassport(store, elementId);
    const signatureKey = signatureKeyFromPassport(p);
    const signatureId = signatureIdFromKey(signatureKey);

    if (want && !want.has(signatureId)) continue;

    const existing = signatureById.get(signatureId);
    if (existing) {
      existing.instanceCount += 1;
      if (existing.signatureKey !== signatureKey) {
        existing.signatureKeyMismatchCount += 1;
      }
      continue;
    }

    signatureById.set(signatureId, {
      signatureId,
      signatureKey,
      instanceCount: 1,
      representativeElement: p,
      signatureMaterials: p.materials,
      signatureIfcs: p.ifcQuantities,
      signatureKeyMismatchCount: 0,
    });
  }

  const effectiveSignatureIds: string[] = signatureIds.length
    ? signatureIds
    : Array.from(signatureById.keys()).sort((a, b) => a.localeCompare(b)).slice(0, debugSampleCount);

  // If any ids weren't found, still return them with empty results.
  for (const sid of effectiveSignatureIds) {
    if (signatureById.has(sid)) continue;
    signatureById.set(sid, {
      signatureId: sid,
      signatureKey: "",
      instanceCount: 0,
      representativeElement: {
        elementId: -1,
        materials: [],
        ifcQuantities: [],
      } as any,
      signatureMaterials: [],
      signatureIfcs: [],
      signatureKeyMismatchCount: 0,
    });
  }

  const signatures: PassportCarbonSignature[] = [];
  const debugReport: Array<{
    signatureId: string;
    instanceCount: number;
    signatureKeyMismatchCount: number;
    signatureTotalKgCO2e: number;
    expectedTotalKgCO2e: number;
    deltaKgCO2e: number;
  }> = [];

  for (const signatureId of effectiveSignatureIds) {
    const g = signatureById.get(signatureId)!;
    const rep = g.representativeElement;

    const instanceCount = g.instanceCount || 0;
    const materials = g.signatureMaterials;
    const ifcQuantities = g.signatureIfcs;

    const totalMaterialCO2: number[] = [];
    const byMaterials: PassportCarbonMaterial[] = [];

    // Match Phase 3 material-level compactQuantities selection:
    // pick up to 3 preferred quantity kinds, then join with `|` separators.
    const preferred = PREFERRED_QTY_ORDER.map((name) =>
      ifcQuantities.find((q) => q.quantityName === name)
    )
      .filter(Boolean)
      .slice(0, 3) as Array<{ quantityName: string; unit?: string; value: number }>;

    const compactParts = preferred.length
      ? preferred
      : ifcQuantities.length
        ? [ifcQuantities[0]]
        : [];

    const scaledCompactQuantities = compactParts.length
      ? compactParts
          .map((q) => {
            const scaled = q.value * instanceCount;
            const unit = q.unit ? ` ${q.unit}` : "";
            return `${q.quantityName}: ${scaled}${unit}`;
          })
          .join(" | ")
      : "";

    const parsed = parsePrimaryQuantity(scaledCompactQuantities);
    const quantityKind = parsed.kind;
    const quantityValue = parsed.value;

    for (const m of materials) {
      const epd: EpdFromKb = m.epdSlug ? epdLookup.getBySlug(m.epdSlug) : {};

      const thicknessFromKb = readLayerThicknessMetersFromKbStore(store as any, m.materialId);
      const labelForThickness = materialDisplayNameFromStore(store, m.materialId);
      const thicknessInferred = inferLayerThicknessMetersFromLabel(labelForThickness);
      const layerThicknessMeters = thicknessFromKb ?? thicknessInferred;

      const calc = computeKgCO2e({
        quantityKind,
        quantityValue,
        epd,
        layerThicknessMeters,
      });

      const kgCO2e = calc.kgCO2e != null && Number.isFinite(calc.kgCO2e) ? calc.kgCO2e : 0;
      totalMaterialCO2.push(kgCO2e);

      byMaterials.push({
        materialId: m.materialId,
        materialName: m.materialName,
        epdSlug: m.epdSlug,
        epdName: m.epdName,
        declaredUnitFromKb: epd.declaredUnit,
        gwpPerUnitFromKb: epd.gwpPerUnit,
        densityKgPerM3FromKb: epd.densityKgPerM3,
        epdDataProvenance: m.epdDataProvenance,
        sourceProductUri: m.sourceProductUri,
        sourceFileName: m.sourceFileName,
        producer: m.producer,
        productionLocation: m.productionLocation,
        issueDate: m.issueDate,
        validUntil: m.validUntil,
        epdIdentifier: m.epdIdentifier,
        matchType: m.matchType,
        matchConfidence: m.matchConfidence,
        quantityKind,
        activityMetric: quantityValue,
        layerThicknessMetersFromKb: thicknessFromKb,
        layerThicknessMetersInferred: thicknessInferred,
        calculationNote: calc.note ?? null,
        kgCO2e,
      });
    }

    const totalKgCO2e = totalMaterialCO2.reduce((sum, v) => sum + v, 0);

    signatures.push({
      signatureId,
      instanceCount,
      representativeElement: {
        elementId: rep.elementId,
        elementName: rep.elementName,
        ifcType: rep.ifcType,
        globalId: rep.globalId,
        expressId: rep.expressId,
      },
      ifcQuantities,
      materials: byMaterials,
      totalKgCO2e,
    });

    if (debug) {
      // Verify linearity: signatureTotal ~= perElementTotal * instanceCount.
      // We recompute using instanceCount=1 and then scale.
      const perElementCompactQuantities = compactParts.length
        ? compactParts
            .map((q) => {
              const unit = q.unit ? ` ${q.unit}` : "";
              return `${q.quantityName}: ${q.value}${unit}`;
            })
            .join(" | ")
        : "";

      const perParsed = parsePrimaryQuantity(perElementCompactQuantities);
      const perQuantityKind = perParsed.kind;
      const perQuantityValue = perParsed.value;

      let perElementTotal = 0;
      for (const m of materials) {
        const epd: EpdFromKb = m.epdSlug ? epdLookup.getBySlug(m.epdSlug) : {};

        const thicknessFromKb = readLayerThicknessMetersFromKbStore(
          store as any,
          m.materialId
        );
        const labelForThickness = materialDisplayNameFromStore(store, m.materialId);
        const thicknessInferred = inferLayerThicknessMetersFromLabel(
          labelForThickness
        );
        const layerThicknessMeters = thicknessFromKb ?? thicknessInferred;

        const perCalc = computeKgCO2e({
          quantityKind: perQuantityKind,
          quantityValue: perQuantityValue,
          epd,
          layerThicknessMeters,
        });

        const kg = perCalc.kgCO2e != null && Number.isFinite(perCalc.kgCO2e) ? perCalc.kgCO2e : 0;
        perElementTotal += kg;
      }

      const expectedTotal = perElementTotal * instanceCount;
      const delta = Math.abs(totalKgCO2e - expectedTotal);

      debugReport.push({
        signatureId,
        instanceCount,
        signatureKeyMismatchCount: g.signatureKeyMismatchCount,
        signatureTotalKgCO2e: totalKgCO2e,
        expectedTotalKgCO2e: expectedTotal,
        deltaKgCO2e: delta,
      });
    }
  }

  return NextResponse.json({
    projectId,
    calculationId: new Date().toISOString(),
    signatures,
    debug: debug ? debugReport : undefined,
  });
}

