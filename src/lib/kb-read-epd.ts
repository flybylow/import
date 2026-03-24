import * as $rdf from "rdflib";

import { FILLER_NO_EPD_PROVENANCE } from "@/lib/kb-epd-stubs";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);

function safeNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Provenance values that mean the EPD node has no real LCA data in the graph. */
export const PLACEHOLDER_EPD_PROVENANCE = new Set([
  "dictionary-no-lca-data",
  "dictionary-placeholder",
  FILLER_NO_EPD_PROVENANCE,
]);

export type EpdFromKb = {
  gwpPerUnit?: number;
  declaredUnit?: string;
  densityKgPerM3?: number;
  epdDataProvenance?: string;
};

export type EpdLookup = {
  getBySlug: (epdSlug: string) => EpdFromKb;
};

/**
 * Phase A: refuse calculation when the KB EPD is routing-only or has no GWP to apply.
 * Returns `null` when calculation is allowed, otherwise a machine-readable reason key.
 */
export function calculationBlockedReason(epd: EpdFromKb): string | null {
  const prov = epd.epdDataProvenance;
  if (prov && PLACEHOLDER_EPD_PROVENANCE.has(prov)) {
    return `placeholder_provenance:${prov}`;
  }
  if (epd.gwpPerUnit == null || !Number.isFinite(epd.gwpPerUnit)) {
    return "missing_gwp";
  }
  return null;
}

/** Read LCA-related literals from `bim:epd-{epdSlug}` in KB Turtle. */
export function readEpdFromKbTtl(kbTtl: string, epdSlug: string): EpdFromKb {
  const lookup = buildEpdLookupFromKbTtl(kbTtl);
  return lookup.getBySlug(epdSlug);
}

/** Parse KB Turtle once; return `null` if parsing fails. */
export function parseKbStore(kbTtl: string): $rdf.Store | null {
  const store = $rdf.graph();
  try {
    $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");
    return store;
  } catch {
    return null;
  }
}

/** Parse KB once and provide fast repeated EPD lookups by slug. */
export function buildEpdLookupFromKbTtl(kbTtl: string): EpdLookup {
  const store = parseKbStore(kbTtl);
  if (!store) return { getBySlug: () => ({}) };
  return buildEpdLookupFromStore(store);
}

/** EPD lookup from an already-parsed KB store (avoids reparsing Turtle). */
export function buildEpdLookupFromStore(store: $rdf.Store): EpdLookup {
  const cache = new Map<string, EpdFromKb>();
  const getBySlug = (epdSlug: string): EpdFromKb => {
    const key = String(epdSlug ?? "").trim();
    if (!key) return {};
    const cached = cache.get(key);
    if (cached) return cached;

    const epd = BIM(`epd-${key}`) as $rdf.NamedNode;
    const gwp = safeNum(store.any(epd, ONT("gwpPerUnit"), null)?.value);
    const declaredUnit = store.any(epd, ONT("declaredUnit"), null)?.value?.trim();
    const density = safeNum(store.any(epd, ONT("density"), null)?.value);
    const epdDataProvenance = store
      .any(epd, ONT("epdDataProvenance"), null)
      ?.value?.trim();

    const out: EpdFromKb = {};
    if (gwp != null) out.gwpPerUnit = gwp;
    if (declaredUnit) out.declaredUnit = declaredUnit;
    if (density != null) out.densityKgPerM3 = density;
    if (epdDataProvenance) out.epdDataProvenance = epdDataProvenance;
    cache.set(key, out);
    return out;
  };

  return { getBySlug };
}

/** `ont:layerThickness` on `bim:material-{expressId}` (meters), when enriched from layer sets. */
export function readLayerThicknessMetersFromKbStore(
  store: $rdf.Store,
  materialExpressId: number
): number | undefined {
  if (!Number.isFinite(materialExpressId)) return undefined;
  const id = Math.floor(materialExpressId);
  const mat = BIM(`material-${id}`) as $rdf.NamedNode;
  const t = store.any(mat, ONT("layerThickness"), null);
  return safeNum(t?.value);
}
