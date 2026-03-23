import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import type { IfcParsedPhase1 } from "./ifc-parser";

const TAB_URI = "https://tabulas.eu/ontology/";
const BIM_URI = "https://tabulas.eu/bim/";
const BOT_URI = "https://w3id.org/bot#";
const SCHEMA_URI = "http://schema.org/";
const DCTERMS_URI = "http://purl.org/dc/terms/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const TAB = $rdf.Namespace(TAB_URI);
const BIM = $rdf.Namespace(BIM_URI);
const BOT = $rdf.Namespace(BOT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const DCTERMS = $rdf.Namespace(DCTERMS_URI);
const XSD = $rdf.Namespace(XSD_URI);
const RDF = $rdf.Namespace(RDF_URI);

function isoNow() {
  return new Date().toISOString();
}

export async function generateTriplesPhase1(params: {
  projectId: string;
  parsed: IfcParsedPhase1;
}): Promise<{ ttlPath: string; ttl: string }> {
  const { projectId, parsed } = params;

  // RDF store + prefixes for easier debugging/round-tripping.
  const store = $rdf.graph();
  store.setPrefixForURI("tab", TAB_URI);
  store.setPrefixForURI("bim", BIM_URI);
  store.setPrefixForURI("bot", BOT_URI);
  store.setPrefixForURI("schema", SCHEMA_URI);
  store.setPrefixForURI("dcterms", DCTERMS_URI);
  store.setPrefixForURI("xsd", XSD_URI);

  const buildingNode = BIM(`building-${parsed.building.expressId}`);
  store.add(buildingNode, RDF("type"), BOT("Building"));
  if (parsed.building.name) store.add(buildingNode, SCHEMA("name"), $rdf.lit(parsed.building.name));
  store.add(
    buildingNode,
    DCTERMS("created"),
    $rdf.lit(isoNow(), undefined, XSD("dateTime"))
  );

  // Deduplicate material nodes by expressId.
  const materialByExpressId = new Map<number, { name?: string; ifcType: string }>();

  for (const storey of parsed.building.storeys) {
    const storeyNode = BIM(`storey-${storey.expressId}`);
    store.add(storeyNode, RDF("type"), BOT("Storey"));
    if (storey.name) store.add(storeyNode, SCHEMA("name"), $rdf.lit(storey.name));
    store.add(buildingNode, BOT("hasStorey"), storeyNode);

    for (const space of storey.spaces) {
      const spaceNode = BIM(`space-${space.expressId}`);
      store.add(spaceNode, RDF("type"), BOT("Space"));
      if (space.name) store.add(spaceNode, SCHEMA("name"), $rdf.lit(space.name));
      store.add(storeyNode, BOT("hasSpace"), spaceNode);

      for (const element of space.elements) {
        const elementNode = BIM(`element-${element.expressId}`);
        store.add(elementNode, RDF("type"), BOT("Element"));
        if (element.name) store.add(elementNode, SCHEMA("name"), $rdf.lit(element.name));
        store.add(elementNode, TAB("ifcType"), $rdf.lit(element.ifcType));
        store.add(
          elementNode,
          TAB("expressId"),
          $rdf.lit(element.expressId.toString(), undefined, XSD("integer"))
        );
        if (element.globalId)
          store.add(elementNode, TAB("globalId"), $rdf.lit(element.globalId));
        store.add(spaceNode, BOT("containsElement"), elementNode);

        for (const mat of element.materials) {
          const existing = materialByExpressId.get(mat.expressId);
          if (!existing) {
            materialByExpressId.set(mat.expressId, { name: mat.name, ifcType: mat.ifcType });
          }
          store.add(elementNode, TAB("madeOf"), BIM(`material-${mat.expressId}`));
        }
      }
    }

    // Phase 1 may attach elements at the storey level if no space exists.
    for (const element of storey.elements) {
      const elementNode = BIM(`element-${element.expressId}`);
      store.add(elementNode, RDF("type"), BOT("Element"));
      if (element.name) store.add(elementNode, SCHEMA("name"), $rdf.lit(element.name));
      store.add(elementNode, TAB("ifcType"), $rdf.lit(element.ifcType));
      store.add(
        elementNode,
        TAB("expressId"),
        $rdf.lit(element.expressId.toString(), undefined, XSD("integer"))
      );
      if (element.globalId)
        store.add(elementNode, TAB("globalId"), $rdf.lit(element.globalId));
      store.add(storeyNode, BOT("containsElement"), elementNode);

      for (const mat of element.materials) {
        const existing = materialByExpressId.get(mat.expressId);
        if (!existing) {
          materialByExpressId.set(mat.expressId, { name: mat.name, ifcType: mat.ifcType });
        }
        store.add(elementNode, TAB("madeOf"), BIM(`material-${mat.expressId}`));
      }
    }
  }

  // Emit material nodes after elements so they always exist.
  for (const [expressId, mat] of materialByExpressId.entries()) {
    const materialNode = BIM(`material-${expressId}`);
    store.add(materialNode, RDF("type"), TAB("Material"));
    if (mat.name) store.add(materialNode, SCHEMA("name"), $rdf.lit(mat.name));
    if (mat.ifcType) store.add(materialNode, TAB("ifcType"), $rdf.lit(mat.ifcType));
  }

  // rdflib's type definitions are too strict here; we always want Turtle output.
  const ttl = $rdf.serialize(null as any, store, null as any, "text/turtle") as string;

  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });
  const ttlPath = path.join(outDir, `${projectId}.ttl`);
  fs.writeFileSync(ttlPath, ttl, "utf-8");

  return { ttlPath, ttl };
}

