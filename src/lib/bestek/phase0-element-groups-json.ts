import fs from "fs";

import { phase0ElementGroupsPath } from "@/lib/bestek/artifacts";
import type { ElementGroup } from "@/lib/bestek/types";

/** Wrapped file written by POST …/group-ifc (v2). Legacy files are a bare `ElementGroup[]`. */
export type Phase0ElementGroupsFileV2 = {
  generatedAt?: string;
  /** Legacy; ignored. Regroup always stores the full IFC-type list. */
  regroupOptions?: {
    excludeSpatial?: boolean;
    excludeMeta?: boolean;
    excludedIfcTypes?: string[];
  };
  groups: ElementGroup[];
};

export function parsePhase0ElementGroupsFile(raw: unknown): {
  groups: ElementGroup[];
  regroupOptions?: Phase0ElementGroupsFileV2["regroupOptions"];
  generatedAt?: string;
} {
  if (Array.isArray(raw)) {
    return { groups: raw as ElementGroup[] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Phase0ElementGroupsFileV2;
    if (Array.isArray(o.groups)) {
      return {
        groups: o.groups as ElementGroup[],
        regroupOptions: o.regroupOptions,
        generatedAt: typeof o.generatedAt === "string" ? o.generatedAt : undefined,
      };
    }
  }
  throw new Error("Invalid phase0 element groups file shape");
}

/** Read `data/<projectId>-phase0-element-groups.json` (legacy array or v2 envelope). */
export function readPhase0GroupsFromDisk(
  projectId: string,
  cwd = process.cwd()
): ElementGroup[] {
  const fp = phase0ElementGroupsPath(projectId, cwd);
  const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as unknown;
  return parsePhase0ElementGroupsFile(raw).groups;
}

