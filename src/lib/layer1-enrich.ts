import fs from "fs";
import path from "path";
import * as WebIFC from "web-ifc";
import * as $rdf from "rdflib";

import {
  extractIfcPredefinedTypeLabel,
  shouldPartitionIfcType,
} from "@/lib/ifc-passport-type-group";
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

/** IFC property sets we map to flat `ont:` predicates on elements. */
const COMMON_PSET_NAMES = new Set([
  "Pset_DoorCommon",
  "Pset_WallCommon",
  "Pset_WindowCommon",
  "Pset_SlabCommon",
  "Pset_ManufacturerTypeInformation",
]);

const COMMON_PSET_SINGLE_VALUE_NAMES = new Set([
  "FireRating",
  "ThermalTransmittance",
  "AcousticRating",
  "IsExternal",
  "LoadBearing",
  "Manufacturer",
  "ModelLabel",
  "ModelReference",
]);

function collectIsDefinedByRelIds(
  ifcApi: WebIFC.IfcAPI,
  modelId: number,
  elementExpressId: number
): number[] {
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
  return relIds;
}

function toLitBoolean(b: boolean) {
  return $rdf.lit(b ? "true" : "false", undefined, XSD("boolean"));
}

/** String label from NominalValue; returns null if missing or whitespace-only (omit triple). */
function readIfcNominalLabelString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "object") {
    const inner = v.value ?? v._value;
    if (typeof inner === "string") {
      const t = inner.trim();
      return t === "" ? null : t;
    }
    if (typeof inner === "number" && Number.isFinite(inner)) return String(inner);
    if (inner != null && typeof inner !== "object") {
      const t = String(inner).trim();
      return t === "" ? null : t;
    }
  }
  return null;
}

function readIfcNominalBoolean(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (v == null) return null;
  if (typeof v === "object") {
    const inner = v.value ?? v._value;
    if (typeof inner === "boolean") return inner;
    if (inner === 0 || inner === 1) return inner === 1;
    if (typeof inner === "number" && Number.isFinite(inner)) return inner !== 0;
  }
  return null;
}

/** Numeric measure (e.g. thermal transmittance); null if absent. Zero is kept. */
function readIfcNominalNumber(v: any): number | null {
  const n = readIfcMeasureNumber(v);
  if (n != null) return n;
  if (v && typeof v === "object") {
    const inner = v.value ?? v._value;
    return readIfcMeasureNumber(inner);
  }
  return null;
}

export type CommonPsetProperties = {
  fireRating?: string;
  thermalTransmittance?: number;
  acousticRating?: string;
  isExternal?: boolean;
  loadBearing?: boolean;
  /** `Pset_ManufacturerTypeInformation` — product / supplier text for doors, windows, etc. */
  manufacturer?: string;
  modelLabel?: string;
  modelReference?: string;
};

/**
 * Reads IfcPropertySingleValue entries from selected common psets.
 * Later relations overwrite earlier ones if the same property name appears twice.
 */
function extractCommonPsetPropertiesFromElement(args: {
  ifcApi: WebIFC.IfcAPI;
  modelId: number;
  elementExpressId: number;
  isDefinedByRelIds?: number[];
}): CommonPsetProperties {
  const { ifcApi, modelId, elementExpressId, isDefinedByRelIds } = args;
  const out: CommonPsetProperties = {};
  const relIds =
    isDefinedByRelIds ?? collectIsDefinedByRelIds(ifcApi, modelId, elementExpressId);

  for (const relId of relIds) {
    const rel = ifcApi.GetLine(modelId, relId);
    const relating = rel?.RelatingPropertyDefinition?.value ?? rel?.RelatingPropertyDefinition;
    if (relating == null) continue;
    const defId = Number(relating?.value ?? relating);
    if (!Number.isFinite(defId)) continue;

    if (ifcApi.GetLineType(modelId, defId) !== WebIFC.IFCPROPERTYSET) continue;

    const pset = ifcApi.GetLine(modelId, defId);
    const setName = pset?.Name?.value ?? pset?.Name;
    if (!setName || !COMMON_PSET_NAMES.has(String(setName))) continue;

    const hasProps = pset?.HasProperties;
    if (!Array.isArray(hasProps)) continue;

    for (const h of hasProps) {
      const pid = Number(h?.value ?? h);
      if (!Number.isFinite(pid)) continue;
      if (ifcApi.GetLineType(modelId, pid) !== WebIFC.IFCPROPERTYSINGLEVALUE) continue;

      const psv = ifcApi.GetLine(modelId, pid);
      const propName = psv?.Name?.value ?? psv?.Name;
      if (!propName || !COMMON_PSET_SINGLE_VALUE_NAMES.has(String(propName))) continue;

      const nv = psv?.NominalValue;

      switch (String(propName)) {
        case "FireRating": {
          const s = readIfcNominalLabelString(nv);
          if (s != null) out.fireRating = s;
          break;
        }
        case "AcousticRating": {
          const s = readIfcNominalLabelString(nv);
          if (s != null) out.acousticRating = s;
          break;
        }
        case "ThermalTransmittance": {
          const n = readIfcNominalNumber(nv);
          if (n != null) out.thermalTransmittance = n;
          break;
        }
        case "IsExternal": {
          const b = readIfcNominalBoolean(nv);
          if (b != null) out.isExternal = b;
          break;
        }
        case "LoadBearing": {
          const b = readIfcNominalBoolean(nv);
          if (b != null) out.loadBearing = b;
          break;
        }
        case "Manufacturer": {
          const s = readIfcNominalLabelString(nv);
          if (s != null) out.manufacturer = s;
          break;
        }
        case "ModelLabel": {
          const s = readIfcNominalLabelString(nv);
          if (s != null) out.modelLabel = s;
          break;
        }
        case "ModelReference": {
          const s = readIfcNominalLabelString(nv);
          if (s != null) out.modelReference = s;
          break;
        }
        default:
          break;
      }
    }
  }

  return out;
}

function extractBaseQuantitiesFromElement(args: {
  ifcApi: WebIFC.IfcAPI;
  modelId: number;
  elementExpressId: number;
  /** When set, skips a second inverse lookup on the element (large models). */
  isDefinedByRelIds?: number[];
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
  const { ifcApi, modelId, elementExpressId, isDefinedByRelIds } = args;

  const relIds =
    isDefinedByRelIds ?? collectIsDefinedByRelIds(ifcApi, modelId, elementExpressId);

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
      const ifcTypeLit = store.any(elementNode, ONT("ifcType"), null);
      const elIfcType =
        typeof ifcTypeLit?.value === "string" ? ifcTypeLit.value : undefined;
      if (shouldPartitionIfcType(elIfcType ?? "")) {
        try {
          const line = ifcApi.GetLine(modelId, elementId, false, true);
          const pre = extractIfcPredefinedTypeLabel(line?.PredefinedType);
          if (pre) {
            store.add(elementNode, ONT("ifcPredefinedType"), $rdf.lit(pre));
          }
        } catch {
          /* ignore */
        }
      }

      const relIds = collectIsDefinedByRelIds(ifcApi, modelId, elementId);
      const qtys = await extractBaseQuantitiesFromElement({
        ifcApi,
        modelId,
        elementExpressId: elementId,
        isDefinedByRelIds: relIds,
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

      const commonPset = extractCommonPsetPropertiesFromElement({
        ifcApi,
        modelId,
        elementExpressId: elementId,
        isDefinedByRelIds: relIds,
      });
      if (commonPset.fireRating != null)
        store.add(elementNode, ONT("fireRating"), $rdf.lit(commonPset.fireRating));
      if (commonPset.acousticRating != null)
        store.add(elementNode, ONT("acousticRating"), $rdf.lit(commonPset.acousticRating));
      if (commonPset.thermalTransmittance != null)
        store.add(elementNode, ONT("thermalTransmittance"), toLitDecimal(commonPset.thermalTransmittance));
      if (commonPset.isExternal != null)
        store.add(elementNode, ONT("isExternal"), toLitBoolean(commonPset.isExternal));
      if (commonPset.loadBearing != null)
        store.add(elementNode, ONT("loadBearing"), toLitBoolean(commonPset.loadBearing));
      if (commonPset.manufacturer != null)
        store.add(elementNode, ONT("ifcManufacturer"), $rdf.lit(commonPset.manufacturer));
      if (commonPset.modelLabel != null)
        store.add(elementNode, ONT("ifcModelLabel"), $rdf.lit(commonPset.modelLabel));
      if (commonPset.modelReference != null)
        store.add(elementNode, ONT("ifcModelReference"), $rdf.lit(commonPset.modelReference));
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

