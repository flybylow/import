import path from "path";
import * as WebIFC from "web-ifc";

import type { ElementGroup } from "@/lib/bestek/types";
import {
  ifcCoveringPartitionWithMaterialsFallback,
  shouldPartitionIfcType,
} from "@/lib/ifc-passport-type-group";

function readIfcString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) {
    const vv = (v as { value?: unknown }).value;
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

type Phase0Bucket = {
  ifc_type: string;
  partition: string | null;
  globalIds: string[];
  created_at: string;
};

function bucketMergeKey(ifcType: string, partition: string | null): string {
  return `${ifcType}\0${partition ?? ""}`;
}

function slugPart(s: string): string {
  const t = s
    .replace(/^Ifc/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t.length > 0 ? t : "type";
}

/**
 * Walk spatial structure (same containment model as Phase 1 parse) and bucket
 * every `IsIfcElement` by IFC type. `IfcCovering` (and future partitioned types)
 * are split by `PredefinedType`, element name, or linked materials.
 */
export async function groupIfcElementsByType(ifcBytes: Uint8Array): Promise<ElementGroup[]> {
  const wasmDir = path.join(process.cwd(), "public", "wasm");
  const ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath(`${wasmDir}${path.sep}`, true);
  await ifcApi.Init();

  const modelId = ifcApi.OpenModel(ifcBytes);
  if (modelId < 0) {
    throw new Error("Failed to open IFC model");
  }

  const byBucket = new Map<string, Phase0Bucket>();

  try {
    const spatialRoot = await ifcApi.properties.getSpatialStructure(modelId);
    const visitNodes: any[] = [];
    const stack = [spatialRoot];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      visitNodes.push(n);
      if (Array.isArray(n.children)) stack.push(...n.children);
    }

    const buildingNode = visitNodes.find((n) => isType(n.type, "IfcBuilding")) || spatialRoot;

    const walk = async (node: any, currentStorey?: any, currentSpace?: any) => {
      const typeName: string = node.type;
      const expressId: number = node.expressID;

      const nextStorey = (() => {
        if (isType(typeName, "IfcBuildingStorey")) return node;
        return currentStorey;
      })();

      const nextSpace = (() => {
        if (isType(typeName, "IfcSpace")) return node;
        return currentSpace;
      })();

      const nodeTypeCode = ifcApi.GetLineType(modelId, expressId);
      if (ifcApi.IsIfcElement(nodeTypeCode)) {
        const elLine = ifcApi.GetLine(modelId, expressId);
        const globalId = readIfcString(elLine?.GlobalId) || `express-${expressId}`;

        let partition: string | null = null;
        if (shouldPartitionIfcType(typeName)) {
          const line = ifcApi.GetLine(modelId, expressId, false, true);
          const part = await ifcCoveringPartitionWithMaterialsFallback({
            ifcApi,
            modelId,
            expressId,
            typeName,
            line,
          });
          partition = part ?? null;
        }

        const mergeKey = bucketMergeKey(typeName, partition);
        let bucket = byBucket.get(mergeKey);
        if (!bucket) {
          bucket = {
            ifc_type: typeName,
            partition,
            globalIds: [],
            created_at: new Date().toISOString(),
          };
          byBucket.set(mergeKey, bucket);
        }
        bucket.globalIds.push(globalId);
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          await walk(child, nextStorey, nextSpace);
        }
      }
    };

    await walk(buildingNode, undefined, undefined);
  } finally {
    if (modelId >= 0) ifcApi.CloseModel(modelId);
    ifcApi.Dispose();
  }

  const sortedKeys = [...byBucket.keys()].sort((a, b) => {
    const [ta, pa] = a.split("\0");
    const [tb, pb] = b.split("\0");
    const c = ta.localeCompare(tb);
    if (c !== 0) return c;
    const sa = pa ?? "";
    const sb = pb ?? "";
    if (sa === "" && sb !== "") return 1;
    if (sb === "" && sa !== "") return -1;
    return sa.localeCompare(sb);
  });

  const groups: ElementGroup[] = sortedKeys.map((mergeKey, idx) => {
    const b = byBucket.get(mergeKey)!;
    const n = idx + 1;
    const typeSlug = slugPart(b.ifc_type);
    const hasPart = b.partition != null && b.partition.trim() !== "";
    const partSlug = hasPart ? slugPart(b.partition!) : "unspecified";
    const slug = `${typeSlug}_${partSlug}`;
    const group_id = `group_${slug}_${String(n).padStart(3, "0")}`;
    return {
      group_id,
      ifc_type: b.ifc_type,
      partition: b.partition,
      element_count: b.globalIds.length,
      element_ids: b.globalIds,
      created_at: b.created_at,
      architect_name: null,
    };
  });

  return groups;
}
