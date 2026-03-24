import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";

import { ensureFillerNoEpdStub } from "@/lib/kb-epd-stubs";
import { loadSourcesConfig } from "@/lib/sources-config";
import {
  combinedNormalizedMaterialLabel,
  normMaterialLabelForMatch,
} from "@/lib/material-norm";
import {
  bimEpdSlugForSourceCandidate,
  findCandidateByUriFragment,
  loadMergedSourceStoreAndCandidates,
  pickFirstOrderedSourceMatch,
} from "@/lib/source-match";

const BIM_URI = "https://tabulas.eu/bim/";
const BOT_URI = "https://w3id.org/bot#";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const DCTERMS_URI = "http://purl.org/dc/terms/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";

const BIM = $rdf.Namespace(BIM_URI);
const BOT = $rdf.Namespace(BOT_URI);
const ONT = $rdf.Namespace(ONT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const XSD = $rdf.Namespace(XSD_URI);
const RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");

function isoNow() {
  return new Date().toISOString();
}

function toLitDecimal(n: number) {
  return $rdf.lit(n.toString(), undefined, XSD("decimal"));
}

function getLit(store: $rdf.Store, subj: any, pred: any) {
  const t = store.any(subj, pred, null);
  return t?.value;
}

type MatchEntry = {
  epdSlug: string;
  matchPatterns: string[];
  standardName: string;
  category: string;
  subcategory?: string;
  matchConfidence: number;
  matchType: string;
  epdSource: string;
  epdName: string;
  declaredUnit: string;
  /** Optional KBOB dataset row UUID — hydrate EPD when text overlap is below MIN_SOURCE_SCORE. */
  kbobUuid?: string;
  /**
   * When the source EPD has per-kg GWP but no `ont:density` (e.g. ICE import, KBOB “-”),
   * Phase 2 adds `ont:density` so volume × density × GWP works in Calculate.
   */
  defaultDensityKgPerM3?: number;
};

const MATERIAL_DICTIONARY_PATH = path.join(
  process.cwd(),
  "src/data/material-dictionary.json"
);

/** Read from disk each KB build so dev/prod always use the latest JSON (no stale bundle). */
export function loadMaterialDictionaryFromDisk(): {
  version?: string;
  entries: MatchEntry[];
  mtimeMs: number;
} {
  const raw = fs.readFileSync(MATERIAL_DICTIONARY_PATH, "utf-8");
  const stat = fs.statSync(MATERIAL_DICTIONARY_PATH);
  const parsed = JSON.parse(raw) as { version?: string; entries?: MatchEntry[] };
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return {
    version: parsed.version,
    entries,
    mtimeMs: stat.mtimeMs,
  };
}

/** Hatch / annotation-only layers — do not auto-link to any EPD. */
function shouldSkipMaterialAutoLink(args: {
  schemaName?: string;
  layerSetName?: string;
  ifcType?: string;
}): boolean {
  const ifc = (args.ifcType ?? "").trim();
  if (ifc === "IfcMaterialList" && !String(args.schemaName ?? "").trim()) {
    return true;
  }
  const n = combinedNormalizedMaterialLabel({
    schemaName: args.schemaName,
    layerSetName: args.layerSetName,
  });
  if (/\blege arcering\b/.test(n)) return true;
  return false;
}

/**
 * Avoid source-only links from weak overlap on placeholder IFC names (e.g. `material-40398`).
 * Dictionary matches still use source for LCA hydration when present.
 */
function isTooGenericForSourceOnlyMatch(combinedNorm: string): boolean {
  const t = combinedNorm.trim();
  if (t.length < 6) return true;
  if (/^material \d+$/.test(t)) return true;
  return false;
}

function matchMaterialToDictionary(
  entries: MatchEntry[],
  args: {
    schemaName?: string;
    layerSetName?: string;
  }
): { entry: MatchEntry; matchedBy: string } | null {
  const combined = combinedNormalizedMaterialLabel(args);
  for (const e of entries) {
    for (const p of e.matchPatterns) {
      const pp = normMaterialLabelForMatch(p);
      if (!pp) continue;
      if (combined.includes(pp)) {
        return { entry: e, matchedBy: p };
      }
    }
  }
  return null;
}

/**
 * Maps raw overlap score from `source-match` (see `ont:sourceMatchScore` on materials)
 * to a 0–1 confidence for display. Not an LCA value.
 */
function confidenceFromSourceScore(score: number) {
  return Math.min(0.92, 0.38 + score / 120);
}

function copyEpdFromSourceToBim(
  dest: $rdf.Store,
  sourceStore: $rdf.Store,
  srcTerm: $rdf.NamedNode,
  bimSlug: string
) {
  const epdNode = BIM(`epd-${bimSlug}`) as unknown as $rdf.NamedNode;
  dest.add(epdNode, RDF("type"), ONT("EPD"));

  const name = getLit(sourceStore, srcTerm, SCHEMA("name"));
  if (name) dest.add(epdNode, SCHEMA("name"), $rdf.lit(name));

  const gwp = getLit(sourceStore, srcTerm, ONT("gwpPerUnit"));
  if (gwp != null && gwp !== "") {
    const n = Number(gwp);
    if (Number.isFinite(n)) {
      dest.add(epdNode, ONT("gwpPerUnit"), toLitDecimal(n));
    }
  }

  const decl = getLit(sourceStore, srcTerm, ONT("declaredUnit"));
  if (decl) dest.add(epdNode, ONT("declaredUnit"), $rdf.lit(decl));

  const dens = getLit(sourceStore, srcTerm, ONT("density"));
  if (dens != null && dens !== "") {
    const n = Number(dens);
    if (Number.isFinite(n)) {
      dest.add(epdNode, ONT("density"), toLitDecimal(n));
    }
  }

  const ds = getLit(sourceStore, srcTerm, ONT("sourceDataset"));
  if (ds) dest.add(epdNode, ONT("source"), $rdf.lit(ds));

  dest.add(epdNode, ONT("sourceProductUri"), $rdf.lit(srcTerm.uri));
  dest.add(
    epdNode,
    ONT("resolvedAt"),
    $rdf.lit(isoNow(), undefined, XSD("dateTime"))
  );
}

/** After copying from a source EPD, fill missing labels only (no LCA numbers from JSON). */
function fillMissingEpdLabelsFromDictionary(
  dest: $rdf.Store,
  epdNode: $rdf.NamedNode,
  entry: MatchEntry
) {
  if (!dest.any(epdNode, SCHEMA("name"), null)) {
    dest.add(epdNode, SCHEMA("name"), $rdf.lit(entry.epdName));
  }
  if (!dest.any(epdNode, ONT("declaredUnit"), null)) {
    dest.add(epdNode, ONT("declaredUnit"), $rdf.lit(entry.declaredUnit));
  }
}

/** Dictionary routing without a qualifying source row: link exists, but no GWP/density in graph. */
function addDictionaryEpdWithoutLcaData(
  dest: $rdf.Store,
  epdNode: $rdf.NamedNode,
  entry: MatchEntry
) {
  dest.add(epdNode, SCHEMA("name"), $rdf.lit(entry.epdName));
  dest.add(epdNode, ONT("source"), $rdf.lit(entry.epdSource));
  dest.add(epdNode, ONT("declaredUnit"), $rdf.lit(entry.declaredUnit));
  dest.add(epdNode, ONT("epdDataProvenance"), $rdf.lit("dictionary-no-lca-data"));
}

const LEGACY_EPD_PROVENANCE_PLACEHOLDER = "dictionary-placeholder";

function removeOutgoingStatementsForSubject(
  dest: $rdf.Store,
  subj: $rdf.NamedNode
) {
  const stmts = dest.statementsMatching(subj as any, null as any, null as any);
  for (const s of stmts) {
    dest.remove(s);
  }
}

/** Aligns with `declaredUnitIsPerKg` / empty-unit in `calculate/route.ts`. */
function shouldFillDensityFromDictionaryFallback(declaredUnit: string | undefined) {
  const du = declaredUnit ?? "";
  const u = du.toLowerCase();
  const compact = u.replace(/\s/g, "");
  if (compact.includes("m3") || u.includes("m³") || u.includes("m^3")) {
    return false;
  }
  if (
    u === "kg" ||
    u.startsWith("kg ") ||
    u.includes("per kg") ||
    u.includes("kilogram")
  ) {
    return true;
  }
  return du.trim().length === 0;
}

function defaultDensityBySlugFromDictionary(entries: MatchEntry[]) {
  const m = new Map<string, number>();
  for (const e of entries) {
    const d = e.defaultDensityKgPerM3;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      m.set(e.epdSlug, d);
    }
  }
  return m;
}

/**
 * ICE (and occasional KBOB) rows omit `ont:density`; dictionary supplies typical kg/m³
 * only when the EPD still has no density after source copy.
 */
function applyDictionaryDensityFallbacks(
  store: $rdf.Store,
  dictEntries: MatchEntry[]
) {
  const slugToDensity = defaultDensityBySlugFromDictionary(dictEntries);
  if (slugToDensity.size === 0) return;

  const epdStmts = store.statementsMatching(
    null as any,
    RDF("type"),
    ONT("EPD")
  );
  for (const st of epdStmts) {
    const epdNode = st.subject as $rdf.NamedNode;
    const uri = epdNode.uri;
    const prefix = `${BIM_URI}epd-`;
    if (!uri.startsWith(prefix)) continue;
    const slug = uri.slice(prefix.length);
    const fallback = slugToDensity.get(slug);
    if (fallback == null) continue;

    if (store.any(epdNode, ONT("density"), null)) continue;

    const gwpTerm = store.any(epdNode, ONT("gwpPerUnit"), null);
    const gwp = gwpTerm != null ? Number(gwpTerm.value) : NaN;
    if (!Number.isFinite(gwp)) continue;

    const du = getLit(store, epdNode, ONT("declaredUnit"));
    if (!shouldFillDensityFromDictionaryFallback(du)) continue;

    store.add(epdNode, ONT("density"), toLitDecimal(fallback));
  }
}

export async function translateLayer2FromEnrichedTtl(params: {
  projectId: string;
  inputTtlPath: string;
  outputTtlPath: string;
}): Promise<{
  translatedTtl: string;
  materialsMatched: number;
  materialsTotal: number;
  epdsCreated: number;
  materialDictionaryVersion?: string;
  materialDictionaryMtimeMs: number;
}> {
  const { inputTtlPath, outputTtlPath } = params;
  const ttlContent = fs.readFileSync(inputTtlPath, "utf-8");

  const dict = loadMaterialDictionaryFromDisk();
  const dictEntries = dict.entries;

  const store = $rdf.graph();
  $rdf.parse(ttlContent, store, BIM_URI, "text/turtle");

  store.setPrefixForURI("bim", BIM_URI);
  store.setPrefixForURI("bot", BOT_URI);
  store.setPrefixForURI("ont", ONT_URI);
  store.setPrefixForURI("schema", SCHEMA_URI);
  store.setPrefixForURI("dcterms", DCTERMS_URI);
  store.setPrefixForURI("xsd", XSD_URI);

  const cfg = loadSourcesConfig(process.cwd());
  const orderedSources = (cfg.sources ?? []).filter((s) => s.enabled !== false);
  const { store: sourceStore, candidatesBySource } =
    loadMergedSourceStoreAndCandidates(orderedSources, process.cwd());

  const materialTypeMatches = store.statementsMatching(
    null as any,
    RDF("type"),
    ONT("Material")
  );

  const materialNodes = new Set<string>();
  const materialTerms: $rdf.NamedNode[] = [];

  for (const st of materialTypeMatches) {
    const subj = st.subject as $rdf.NamedNode;
    const key = subj.value;
    if (materialNodes.has(key)) continue;
    materialNodes.add(key);
    materialTerms.push(subj);
  }

  const epdBySlug = new Map<string, $rdf.NamedNode>();
  let epdsCreated = 0;
  let materialsMatched = 0;

  for (const matNode of materialTerms) {
    const schemaNameTerm = store.any(matNode, SCHEMA("name"), null);
    const layerSetNameTerm = store.any(matNode, ONT("layerSetName"), null);
    const ifcTypeTerm = store.any(matNode, ONT("ifcType"), null);
    const schemaName = schemaNameTerm?.value;
    const layerSetName = layerSetNameTerm?.value;
    const ifcType = ifcTypeTerm?.value;

    if (
      shouldSkipMaterialAutoLink({
        schemaName,
        layerSetName,
        ifcType,
      })
    ) {
      continue;
    }

    const combinedNorm = combinedNormalizedMaterialLabel({
      schemaName,
      layerSetName,
    });

    const dictMatch = matchMaterialToDictionary(dictEntries, {
      schemaName,
      layerSetName,
    });

    const sourceHit =
      dictMatch || !isTooGenericForSourceOnlyMatch(combinedNorm)
        ? pickFirstOrderedSourceMatch({
            orderedEntries: orderedSources,
            candidatesBySource,
            combinedNorm,
          })
        : null;

    let effectiveSourceHit = sourceHit;
    if (
      !effectiveSourceHit &&
      dictMatch?.entry.kbobUuid &&
      dictMatch.entry.epdSource === "kbob"
    ) {
      const kbobSourceId = orderedSources.find((s) => s.type === "kbob")?.id;
      if (kbobSourceId) {
        const found = findCandidateByUriFragment(
          candidatesBySource.get(kbobSourceId),
          dictMatch.entry.kbobUuid
        );
        if (found) {
          effectiveSourceHit = { candidate: found, score: 12 };
        }
      }
    }

    if (!dictMatch && !effectiveSourceHit) continue;

    materialsMatched += 1;

    if (dictMatch) {
      const { entry } = dictMatch;

      let epdNode = epdBySlug.get(entry.epdSlug);
      const isNewEpd = !epdNode;
      if (!epdNode) {
        epdNode = BIM(`epd-${entry.epdSlug}`) as unknown as $rdf.NamedNode;
        epdBySlug.set(entry.epdSlug, epdNode);
        epdsCreated += 1;
      }

      const provExisting = getLit(store, epdNode, ONT("epdDataProvenance"));
      const shouldBuildOrUpgrade =
        isNewEpd ||
        (Boolean(effectiveSourceHit) &&
          (provExisting === "dictionary-no-lca-data" ||
            provExisting === LEGACY_EPD_PROVENANCE_PLACEHOLDER));

      if (shouldBuildOrUpgrade) {
        if (!isNewEpd) {
          removeOutgoingStatementsForSubject(store, epdNode);
        }
        store.add(epdNode, RDF("type"), ONT("EPD"));

        if (effectiveSourceHit) {
          copyEpdFromSourceToBim(
            store,
            sourceStore,
            effectiveSourceHit.candidate.term,
            entry.epdSlug
          );
          fillMissingEpdLabelsFromDictionary(store, epdNode, entry);
          store.add(epdNode, ONT("epdDataProvenance"), $rdf.lit("source-import"));
        } else {
          addDictionaryEpdWithoutLcaData(store, epdNode, entry);
          store.add(
            epdNode,
            ONT("resolvedAt"),
            $rdf.lit(isoNow(), undefined, XSD("dateTime"))
          );
        }
      }

      store.add(matNode, ONT("standardName"), $rdf.lit(entry.standardName));
      store.add(matNode, ONT("category"), $rdf.lit(entry.category));
      if (entry.subcategory) {
        store.add(matNode, ONT("subcategory"), $rdf.lit(entry.subcategory));
      }
      const matchTypeLabel = effectiveSourceHit
        ? `${entry.matchType}+source`
        : `${entry.matchType}+no-lca`;
      store.add(matNode, ONT("matchType"), $rdf.lit(matchTypeLabel));
      store.add(
        matNode,
        ONT("matchConfidence"),
        toLitDecimal(
          effectiveSourceHit
            ? confidenceFromSourceScore(effectiveSourceHit.score)
            : entry.matchConfidence
        )
      );
      if (effectiveSourceHit) {
        store.add(
          matNode,
          ONT("sourceMatchScore"),
          toLitDecimal(effectiveSourceHit.score)
        );
      }
      store.add(
        matNode,
        ONT("source"),
        $rdf.lit(effectiveSourceHit ? "dictionary-routed" : "dictionary-no-lca")
      );
      store.add(matNode, ONT("hasEPD"), epdNode);
      continue;
    }

    if (effectiveSourceHit) {
      const { candidate, score } = effectiveSourceHit;
      const slug = bimEpdSlugForSourceCandidate(candidate);

      let epdNode = epdBySlug.get(slug);
      if (!epdNode) {
        epdNode = BIM(`epd-${slug}`) as unknown as $rdf.NamedNode;
        epdsCreated += 1;
        epdBySlug.set(slug, epdNode);
        copyEpdFromSourceToBim(store, sourceStore, candidate.term, slug);
        store.add(epdNode, ONT("epdDataProvenance"), $rdf.lit("source-import"));
      }

      store.add(matNode, ONT("standardName"), $rdf.lit(candidate.displayName));
      store.add(matNode, ONT("category"), $rdf.lit(candidate.sourceType));
      store.add(
        matNode,
        ONT("matchType"),
        $rdf.lit(`source_${candidate.sourceType}`)
      );
      store.add(
        matNode,
        ONT("matchConfidence"),
        toLitDecimal(confidenceFromSourceScore(score))
      );
      store.add(matNode, ONT("sourceMatchScore"), toLitDecimal(score));
      store.add(
        matNode,
        ONT("source"),
        $rdf.lit(`${candidate.sourceId}-source`)
      );
      store.add(matNode, ONT("hasEPD"), epdNode);
    }
  }

  applyDictionaryDensityFallbacks(store, dictEntries);

  ensureFillerNoEpdStub(store);

  const translatedTtl = $rdf.serialize(
    null as any,
    store,
    null as any,
    "text/turtle"
  ) as string;
  fs.mkdirSync(path.dirname(outputTtlPath), { recursive: true });
  fs.writeFileSync(outputTtlPath, translatedTtl, "utf-8");

  return {
    translatedTtl,
    materialsMatched,
    materialsTotal: materialTerms.length,
    epdsCreated,
    materialDictionaryVersion: dict.version,
    materialDictionaryMtimeMs: dict.mtimeMs,
  };
}
