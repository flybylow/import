import fs from "fs";
import { NextResponse } from "next/server";

import {
  assertSafeProjectId,
  bestekMaterialMatchingPath,
  phase0ElementGroupsPath,
} from "@/lib/bestek/artifacts";
import { IFC_TYPE_MATERIAL_DEFAULT_SLUG } from "@/lib/bestek/ifc-type-material-defaults";
import { materialDictionaryCatalog } from "@/lib/bestek/material-dictionary-catalog";
import { readPhase0GroupsFromDisk } from "@/lib/bestek/phase0-element-groups-json";
import type { BestekArchitectMaterialMatching, ElementGroup } from "@/lib/bestek/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  try {
    assertSafeProjectId(projectId);
  } catch {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }

  const groupsPath = phase0ElementGroupsPath(projectId);
  if (!fs.existsSync(groupsPath)) {
    return NextResponse.json(
      { error: "Element groups not found. POST …/group-ifc first.", projectId },
      { status: 404 }
    );
  }

  let groups: ElementGroup[];
  try {
    groups = readPhase0GroupsFromDisk(projectId);
  } catch {
    return NextResponse.json({ error: "Could not read element groups" }, { status: 500 });
  }

  const formGroups = groups.map((g) => ({
    group_id: g.group_id,
    ifc_type: g.ifc_type,
    element_count: g.element_count,
  }));

  const { version, categories } = materialDictionaryCatalog();
  const materials: Record<string, { epdSlug: string; standardName: string }[]> = {};
  for (const c of categories) {
    materials[c.category] = c.entries.map((e) => ({
      epdSlug: e.epdSlug,
      standardName: e.standardName,
    }));
  }

  let existingMatchings: BestekArchitectMaterialMatching[] | null = null;
  const matchPath = bestekMaterialMatchingPath(projectId);
  if (fs.existsSync(matchPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(matchPath, "utf-8")) as unknown;
      if (Array.isArray(raw)) existingMatchings = raw as BestekArchitectMaterialMatching[];
    } catch {
      existingMatchings = null;
    }
  }

  return NextResponse.json({
    projectId,
    dictionaryVersion: version,
    groups: formGroups,
    materials,
    smartDefaults: IFC_TYPE_MATERIAL_DEFAULT_SLUG,
    existingMatchings,
  });
}
