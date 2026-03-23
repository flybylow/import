import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";

import materialDictionary from "@/data/material-dictionary.json";

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
const DCTERMS = $rdf.Namespace(DCTERMS_URI);
const XSD = $rdf.Namespace(XSD_URI);
const RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");

function isoNow() {
  return new Date().toISOString();
}

function toLitDecimal(n: number) {
  return $rdf.lit(n.toString(), undefined, XSD("decimal"));
}

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
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
  densityKgPerM3?: number;
  gwpPerUnitKgCO2e?: number;
};

function matchMaterialToDictionary(args: {
  schemaName?: string;
  layerSetName?: string;
}): { entry: MatchEntry; matchedBy: string } | null {
  const schemaName = norm(args.schemaName);
  const layerSetName = norm(args.layerSetName);
  const combined = `${schemaName} ${layerSetName}`.trim();

  const entries = (materialDictionary as any).entries as MatchEntry[];
  for (const e of entries) {
    for (const p of e.matchPatterns) {
      const pp = norm(p);
      if (!pp) continue;
      if (combined.includes(pp)) {
        return { entry: e, matchedBy: p };
      }
    }
  }
  return null;
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
}> {
  const { inputTtlPath, outputTtlPath } = params;
  const ttlContent = fs.readFileSync(inputTtlPath, "utf-8");

  const store = $rdf.graph();
  $rdf.parse(ttlContent, store, BIM_URI, "text/turtle");

  // Ensure prefixes for nicer serialization.
  store.setPrefixForURI("bim", BIM_URI);
  store.setPrefixForURI("bot", BOT_URI);
  store.setPrefixForURI("ont", ONT_URI);
  store.setPrefixForURI("schema", SCHEMA_URI);
  store.setPrefixForURI("dcterms", DCTERMS_URI);
  store.setPrefixForURI("xsd", XSD_URI);

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

  // Create EPD nodes once per `epdSlug` (many IFC materials can map to the same product).
  const epdBySlug = new Map<string, $rdf.NamedNode>();
  let epdsCreated = 0;
  let materialsMatched = 0;

  for (const matNode of materialTerms) {
    const schemaNameTerm = store.any(matNode, SCHEMA("name"), null);
    const layerSetNameTerm = store.any(matNode, ONT("layerSetName"), null);
    const schemaName = schemaNameTerm?.value;
    const layerSetName = layerSetNameTerm?.value;

    const matched = matchMaterialToDictionary({
      schemaName,
      layerSetName,
    });
    if (!matched) continue;

    materialsMatched += 1;
    const { entry } = matched;

    let epdNode = epdBySlug.get(entry.epdSlug);
    if (!epdNode) {
      epdNode = BIM(`epd-${entry.epdSlug}`) as unknown as $rdf.NamedNode;
      epdsCreated += 1;
      epdBySlug.set(entry.epdSlug, epdNode);

      store.add(epdNode, RDF("type"), ONT("EPD"));
      store.add(epdNode, SCHEMA("name"), $rdf.lit(entry.epdName));
      store.add(epdNode, ONT("source"), $rdf.lit(entry.epdSource));
      store.add(epdNode, ONT("declaredUnit"), $rdf.lit(entry.declaredUnit));
      if (entry.gwpPerUnitKgCO2e != null) {
        store.add(
          epdNode,
          ONT("gwpPerUnit"),
          toLitDecimal(entry.gwpPerUnitKgCO2e)
        );
      }
      if (entry.densityKgPerM3 != null) {
        store.add(epdNode, ONT("density"), toLitDecimal(entry.densityKgPerM3));
      }
      store.add(epdNode, ONT("resolvedAt"), $rdf.lit(isoNow(), undefined, XSD("dateTime")));
    }

    store.add(matNode, ONT("standardName"), $rdf.lit(entry.standardName));
    store.add(matNode, ONT("category"), $rdf.lit(entry.category));
    if (entry.subcategory) {
      store.add(matNode, ONT("subcategory"), $rdf.lit(entry.subcategory));
    }
    store.add(matNode, ONT("matchType"), $rdf.lit(entry.matchType));
    store.add(matNode, ONT("matchConfidence"), toLitDecimal(entry.matchConfidence));
    store.add(matNode, ONT("source"), $rdf.lit("dictionary-mvp"));
    store.add(matNode, ONT("hasEPD"), epdNode);
  }

  const translatedTtl = $rdf.serialize(null as any, store, null as any, "text/turtle") as string;
  fs.mkdirSync(path.dirname(outputTtlPath), { recursive: true });
  fs.writeFileSync(outputTtlPath, translatedTtl, "utf-8");

  return {
    translatedTtl,
    materialsMatched,
    materialsTotal: materialTerms.length,
    epdsCreated,
  };
}

