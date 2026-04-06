import path from "path";
import * as WebIFC from "web-ifc";

import {
  primaryMaterialLabelFromResolution,
  readIfcString as readIfcStringMat,
  resolveMaterialLineFromIfc,
} from "@/lib/ifc-material-resolve";

export type IfcMaterialRef = {
  expressId: number;
  ifcType: string;
  name?: string;
};

export type IfcElementRef = {
  expressId: number;
  ifcType: string;
  name?: string;
  globalId?: string;
  materials: IfcMaterialRef[];
};

export type IfcSpaceNode = {
  expressId: number;
  name?: string;
  elements: IfcElementRef[];
};

export type IfcStoreyNode = {
  expressId: number;
  name?: string;
  spaces: IfcSpaceNode[];
  elements: IfcElementRef[];
};

export type IfcBuildingNode = {
  expressId: number;
  name?: string;
  storeys: IfcStoreyNode[];
};

export type IfcParsedPhase1 = {
  ifcSchema?: string;
  building: IfcBuildingNode;
};

/** Small payload for APIs — avoid JSON-encoding full `IfcParsedPhase1` on large models. */
export type IfcParsedPhase1Summary = {
  ifcSchema?: string;
  elementCount: number;
  storeyCount: number;
  spaceCount: number;
};

export function summarizeIfcParsedPhase1(parsed: IfcParsedPhase1): IfcParsedPhase1Summary {
  let spaceCount = 0;
  let elementCount = 0;
  for (const st of parsed.building.storeys) {
    spaceCount += st.spaces.length;
    elementCount += st.elements.length;
    for (const sp of st.spaces) {
      elementCount += sp.elements.length;
    }
  }
  return {
    ifcSchema: parsed.ifcSchema,
    elementCount,
    storeyCount: parsed.building.storeys.length,
    spaceCount,
  };
}

function readIfcString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) {
    const vv = (v as any).value;
    if (vv == null) return undefined;
    return typeof vv === "string" ? vv : String(vv);
  }
  return undefined;
}

function normalizeIfcType(typeName: string): string {
  return typeName.trim().toLowerCase();
}

function isType(typeName: string, ifcType: string): boolean {
  return normalizeIfcType(typeName) === normalizeIfcType(ifcType);
}

async function createMaterialsForElement(
  ifcApi: WebIFC.IfcAPI,
  modelId: number,
  elementExpressId: number
): Promise<IfcMaterialRef[]> {
  try {
    const materialLines = await ifcApi.properties.getMaterialsProperties(
      modelId,
      elementExpressId
    );

    if (!Array.isArray(materialLines)) return [];

    // web-ifc can return many material definitions; keep everything we get,
    // and let the triple generator deduplicate by expressId later.
    return materialLines.map((mat: any) => {
      const r = resolveMaterialLineFromIfc(ifcApi, modelId, mat.expressID);
      const label = primaryMaterialLabelFromResolution(r);
      return {
        expressId: mat.expressID,
        ifcType: r.ifcType,
        name: label ?? readIfcStringMat(mat.Name),
      };
    });
  } catch {
    return [];
  }
}

export async function parseIfcPhase1(ifcBytes: Uint8Array): Promise<IfcParsedPhase1> {
  const wasmDir = path.join(process.cwd(), "public", "wasm");
  const ifcApi = new WebIFC.IfcAPI();
  // web-ifc concatenates `wasmPath + filename`, so we must include a trailing slash.
  ifcApi.SetWasmPath(`${wasmDir}${path.sep}`, true);
  await ifcApi.Init();

  const modelId = ifcApi.OpenModel(ifcBytes);
  if (modelId < 0) {
    throw new Error("Failed to open IFC model");
  }

  try {
    const ifcSchema = ifcApi.GetModelSchema(modelId);

    // Spatial structure tree includes spatial containers and contained elements
    // through IfcRelContainedInSpatialStructure.
    const spatialRoot = await ifcApi.properties.getSpatialStructure(modelId);

    const visitNodes: any[] = [];
    const stack = [spatialRoot];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      visitNodes.push(n);
      if (Array.isArray(n.children)) stack.push(...n.children);
    }

    const buildingNode =
      visitNodes.find((n) => isType(n.type, "IfcBuilding")) || spatialRoot;

    const buildingLine = ifcApi.GetLine(modelId, buildingNode.expressID);
    const building: IfcBuildingNode = {
      expressId: buildingNode.expressID,
      name: readIfcString(buildingLine?.Name),
      storeys: [],
    };

    const storeyMemo = new Map<number, IfcStoreyNode>();
    const spaceMemo = new Map<number, IfcSpaceNode>();

    let totalElements = 0;

    const getStorey = (expressId: number): IfcStoreyNode | undefined =>
      storeyMemo.get(expressId);
    const getSpace = (expressId: number): IfcSpaceNode | undefined =>
      spaceMemo.get(expressId);

    // Traverse only from the chosen building node, so we don't create multiple top-level BOT buildings.
    const walk = async (node: any, currentStorey?: IfcStoreyNode, currentSpace?: IfcSpaceNode) => {
      const typeName: string = node.type;
      const expressId: number = node.expressID;

      const nextStorey = (() => {
        if (isType(typeName, "IfcBuildingStorey")) {
          const existing = getStorey(expressId);
          if (existing) return existing;
          const line = ifcApi.GetLine(modelId, expressId);
          const s: IfcStoreyNode = { expressId, name: readIfcString(line?.Name), spaces: [], elements: [] };
          storeyMemo.set(expressId, s);
          building.storeys.push(s);
          return s;
        }
        return currentStorey;
      })();

      const nextSpace = (() => {
        if (isType(typeName, "IfcSpace")) {
          const existing = getSpace(expressId);
          if (existing) return existing;
          const line = ifcApi.GetLine(modelId, expressId);
          const parentStorey = nextStorey;
          const sp: IfcSpaceNode = { expressId, name: readIfcString(line?.Name), elements: [] };
          spaceMemo.set(expressId, sp);
          if (parentStorey) parentStorey.spaces.push(sp);
          else {
            // Some IFCs place spaces directly under the project; attach to a synthetic storey-less space.
            // For Phase 1 we keep it simple: ignore if no storey exists.
          }
          return sp;
        }
        return currentSpace;
      })();

      // If it's an IFC element (e.g. IfcDoor, IfcWall, ...), attach it to the current space or storey.
      const nodeTypeCode = ifcApi.GetLineType(modelId, expressId);
      if (ifcApi.IsIfcElement(nodeTypeCode)) {
        const elLine = ifcApi.GetLine(modelId, expressId);
        const materials = await createMaterialsForElement(ifcApi, modelId, expressId);

        const element: IfcElementRef = {
          expressId,
          ifcType: typeName,
          name: readIfcString(elLine?.Name),
          globalId: readIfcString(elLine?.GlobalId),
          materials,
        };

        totalElements += 1;
        if (nextSpace) nextSpace.elements.push(element);
        else if (nextStorey) nextStorey.elements.push(element);
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          await walk(child, nextStorey, nextSpace);
        }
      }
    };

    await walk(buildingNode, undefined, undefined);

    // totalElements is currently unused in the return object, but keeping it makes it easy to add sanity checks later.
    void totalElements;

    return {
      ifcSchema,
      building,
    };
  } finally {
    // Always free the model from WASM memory.
    if (modelId >= 0) ifcApi.CloseModel(modelId);
    ifcApi.Dispose();
  }
}

