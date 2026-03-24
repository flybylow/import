import fs from "fs";
import path from "path";
import * as WebIFC from "web-ifc";
import * as $rdf from "rdflib";

import { resolveMaterialLineFromIfc } from "@/lib/ifc-material-resolve";

const BIM_URI = "https://tabulas.eu/bim/";
const BOT_URI = "https://w3id.org/bot#";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const DCTERMS_URI = "http://purl.org/dc/terms/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const BIM = $rdf.Namespace(BIM_URI);
const BOT = $rdf.Namespace(BOT_URI);
const ONT = $rdf.Namespace(ONT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const DCTERMS = $rdf.Namespace(DCTERMS_URI);
const XSD = $rdf.Namespace(XSD_URI);
const RDF = $rdf.Namespace(RDF_URI);

function toLitDecimal(n: number) {
  return $rdf.lit(n.toString(), undefined, XSD("decimal"));
}

function readIfcMeasureNumber(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (!v || typeof v !== "object") return null;
  // web-ifc often returns structures like { _representationValue: 123.4, ... }.
  const rep = v._representationValue ?? v._internalValue ?? v.value;
  if (typeof rep === "number" && Number.isFinite(rep)) return rep;
  // Some wrappers expose a nested JS number under "representationValue".
  const rep2 = v.representationValue ?? v.representation;
  if (typeof rep2 === "number" && Number.isFinite(rep2)) return rep2;
  return null;
}

function maybeMmToM(qName: string, value: number): number {
  // Schependomlaan uses millimeters for base length measures.
  // Heuristic: if it looks like a length in mm (>= 100), convert to meters.
  const normalized = qName.toLowerCase();
  const isLengthLike =
    normalized === "length" ||
    normalized === "height" ||
    normalized === "width" ||
    normalized === "thickness";
  if (!isLengthLike) return value;
  return value >= 100 ? value / 1000 : value;
}

function parseBimExpressId(subjectValue: string, kind: "element" | "material") {
  // e.g. https://tabulas.eu/bim/element-1001928
  const re = new RegExp(`${kind}-(\\d+)$`);
  const m = subjectValue.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractBaseQuantitiesFromElement(args: {
  ifcApi: WebIFC.IfcAPI;
  modelId: number;
  elementExpressId: number;
}): Promise<{
  length?: number;
  height?: number;
  width?: number;
  grossVolume?: number;
  netVolume?: number;
  grossSideArea?: number;
  netSideArea?: number;
  grossFootprintArea?: number;
  quantities: Array<{
    name: string;
    value: number;
    unitName?: string;
  }>;
}> {
  const { ifcApi, modelId, elementExpressId } = args;

  // web-ifc returns inverse properties when inverse=true and inversePropKey=null.
  const elementLine = ifcApi.GetLine(modelId, elementExpressId, false, true);
  const isDefinedBy = elementLine?.IsDefinedBy;
  const relIds: number[] = [];

  if (Array.isArray(isDefinedBy)) {
    for (const r of isDefinedBy) {
      const v = r?.value ?? r;
      const n = Number(v);
      if (Number.isFinite(n)) relIds.push(n);
    }
  } else if (isDefinedBy) {
    const v = (isDefinedBy as any)?.value ?? isDefinedBy;
    const n = Number(v);
    if (Number.isFinite(n)) relIds.push(n);
  }

  // Initialize all values as optional. We'll fill what we find.
  const result: any = {};
  const capturedQuantities: Array<{
    name: string;
    value: number;
    unitName?: string;
  }> = [];

  for (const relId of relIds) {
    const rel = ifcApi.GetLine(modelId, relId);
    const relating = rel?.RelatingPropertyDefinition?.value ?? rel?.RelatingPropertyDefinition;
    if (!relating) continue;

    const propDef = ifcApi.GetLine(modelId, relating);
    const name = propDef?.Name?.value ?? propDef?.Name;
    if (!name) continue;
    if (String(name).toLowerCase() !== "basequantities") continue;

    const baseQuantities = propDef?.Quantities;
    const qtyIds: number[] = [];
    if (Array.isArray(baseQuantities)) {
      for (const q of baseQuantities) {
        const v = q?.value ?? q;
        const n = Number(v);
        if (Number.isFinite(n)) qtyIds.push(n);
      }
    }

    for (const qid of qtyIds) {
      const q = ifcApi.GetLine(modelId, qid);
      const qName = q?.Name?.value ?? q?.Name;
      if (!qName) continue;

      const lengthVal = q?.LengthValue;
      const areaVal = q?.AreaValue;
      const volumeVal = q?.VolumeValue;

      const numeric =
        readIfcMeasureNumber(lengthVal) ??
        readIfcMeasureNumber(areaVal) ??
        readIfcMeasureNumber(volumeVal);
      if (numeric == null) continue;

      const mappedName = String(qName);
      const qMetersOrRaw = maybeMmToM(mappedName, numeric);

      // Unit extraction is best-effort; if unit is present, store a readable label.
      const unitName =
        q?.Unit?.Name?.value ?? q?.Unit?.Name ?? q?.Unit?.value ?? undefined;

      // Priority-1/2: preserve all BaseQuantities numerics (no loss) in a generic list.
      capturedQuantities.push({
        name: mappedName,
        value: qMetersOrRaw,
        unitName: typeof unitName === "string" ? unitName : undefined,
      });

      switch (mappedName) {
        case "Length":
          result.length = qMetersOrRaw;
          break;
        case "Height":
          result.height = qMetersOrRaw;
          break;
        case "Width":
          result.width = qMetersOrRaw;
          break;
        case "Thickness":
          // PRD says “Width / Thickness” -> ont:width. Best effort.
          result.width = qMetersOrRaw;
          break;
        case "GrossVolume":
          result.grossVolume = numeric;
          break;
        case "NetVolume":
          result.netVolume = numeric;
          break;
        case "GrossSideArea":
          result.grossSideArea = numeric;
          break;
        case "NetSideArea":
          result.netSideArea = numeric;
          break;
        case "GrossFootprintArea":
          result.grossFootprintArea = numeric;
          break;
        default:
          break;
      }
    }

    // Once BaseQuantities is found, we can stop scanning relations.
    break;
  }

  return Promise.resolve({ ...result, quantities: capturedQuantities });
}

export async function enrichLayer1FromIfc(params: {
  projectId: string;
  inputTtlPath: string;
  outputTtlPath: string;
  ifcPath: string;
}): Promise<{
  enrichedTtl: string;
  elementCount: number;
  materialCount: number;
}> {
  const { inputTtlPath, outputTtlPath, ifcPath } = params;

  const ttlContent = fs.readFileSync(inputTtlPath, "utf-8");
  const ifcBytes = new Uint8Array(fs.readFileSync(ifcPath));

  const store = $rdf.graph();
  // Parse existing TTL so we preserve all existing triples.
  $rdf.parse(ttlContent, store, BIM_URI, "text/turtle");

  // Ensure prefixes for nicer serialization.
  store.setPrefixForURI("bim", BIM_URI);
  store.setPrefixForURI("bot", BOT_URI);
  store.setPrefixForURI("ont", ONT_URI);
  store.setPrefixForURI("schema", SCHEMA_URI);
  store.setPrefixForURI("dcterms", DCTERMS_URI);
  store.setPrefixForURI("xsd", XSD_URI);

  const wasmDir = path.join(process.cwd(), "public", "wasm");
  const ifcApi = new (WebIFC as any).IfcAPI() as WebIFC.IfcAPI;
  ifcApi.SetWasmPath(`${wasmDir}${path.sep}`, true);
  await ifcApi.Init();
  const modelId = ifcApi.OpenModel(ifcBytes);
  if (modelId < 0) throw new Error("Failed to open IFC model for enrichment");

  try {
    // Elements to enrich.
    const elementStmts = store.statementsMatching(null as any, RDF("type"), BOT("Element"));
    const elementExpressIds: number[] = [];
    const elementById = new Map<number, $rdf.NamedNode>();

    for (const st of elementStmts) {
      const subj = st.subject;
      const expressId = parseBimExpressId(subj.value, "element");
      if (expressId == null) continue;
      // If multiple statements point to same node, de-dupe.
      if (!elementById.has(expressId)) elementById.set(expressId, subj as $rdf.NamedNode);
    }
    elementExpressIds.push(...elementById.keys());

    // Materials to enrich.
    const materialStmts = store.statementsMatching(null as any, RDF("type"), ONT("Material"));
    const materialById = new Map<number, $rdf.NamedNode>();

    for (const st of materialStmts) {
      const subj = st.subject;
      const expressId = parseBimExpressId(subj.value, "material");
      if (expressId == null) continue;
      if (!materialById.has(expressId)) materialById.set(expressId, subj as $rdf.NamedNode);
    }

    for (const elementId of elementExpressIds) {
      const elementNode = elementById.get(elementId)!;
      const qtys = await extractBaseQuantitiesFromElement({
        ifcApi,
        modelId,
        elementExpressId: elementId,
      });

      if (qtys.length != null) store.add(elementNode, ONT("length"), toLitDecimal(qtys.length));
      if (qtys.height != null) store.add(elementNode, ONT("height"), toLitDecimal(qtys.height));
      if (qtys.width != null) store.add(elementNode, ONT("width"), toLitDecimal(qtys.width));
      if (qtys.grossVolume != null)
        store.add(elementNode, ONT("grossVolume"), toLitDecimal(qtys.grossVolume));
      if (qtys.netVolume != null)
        store.add(elementNode, ONT("netVolume"), toLitDecimal(qtys.netVolume));
      if (qtys.grossSideArea != null)
        store.add(elementNode, ONT("grossSideArea"), toLitDecimal(qtys.grossSideArea));
      if (qtys.netSideArea != null)
        store.add(elementNode, ONT("netSideArea"), toLitDecimal(qtys.netSideArea));
      if (qtys.grossFootprintArea != null)
        store.add(elementNode, ONT("grossFootprintArea"), toLitDecimal(qtys.grossFootprintArea));

      // Also store every BaseQuantities numeric value so we don't lose any information
      // even if it doesn't map to our priority 1/2 predicate list.
      for (let i = 0; i < qtys.quantities.length; i++) {
        const q = qtys.quantities[i];
        const qtyNode = BIM(`qty-${elementId}-${i}`);
        store.add(qtyNode, RDF("type"), ONT("IfcQuantity" as any));
        store.add(qtyNode, ONT("ifcQuantityName"), $rdf.lit(q.name));
        store.add(qtyNode, ONT("ifcQuantityValue"), toLitDecimal(q.value));
        if (q.unitName) store.add(qtyNode, ONT("ifcQuantityUnit"), $rdf.lit(q.unitName));
        store.add(elementNode, ONT("hasIfcQuantity"), qtyNode);
      }
    }

    for (const [materialId, materialNode] of materialById.entries()) {
      const layerInfo = resolveMaterialLineFromIfc(ifcApi, modelId, materialId);

      if (layerInfo.materialName) {
        store.add(materialNode, SCHEMA("name"), $rdf.lit(layerInfo.materialName));
      }
      if (layerInfo.layerSetName) {
        store.add(materialNode, ONT("layerSetName"), $rdf.lit(layerInfo.layerSetName));
      }
      if (layerInfo.layerThicknessMeters != null) {
        store.add(
          materialNode,
          ONT("layerThickness"),
          toLitDecimal(layerInfo.layerThicknessMeters)
        );
      }
    }

    // rdflib's type definitions allow `undefined` here; we always expect Turtle output.
    const enrichedTtl = $rdf.serialize(null as any, store, null as any, "text/turtle") as string;
    fs.mkdirSync(path.dirname(outputTtlPath), { recursive: true });
    fs.writeFileSync(outputTtlPath, enrichedTtl, "utf-8");
    return {
      enrichedTtl,
      elementCount: elementExpressIds.length,
      materialCount: materialById.size,
    };
  } finally {
    if (modelId >= 0) ifcApi.CloseModel(modelId);
    ifcApi.Dispose();
  }
}

