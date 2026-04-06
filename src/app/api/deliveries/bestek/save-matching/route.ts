import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import {
  assertSafeProjectId,
  bestekMaterialMatchingPath,
  phase0ElementGroupsPath,
} from "@/lib/bestek/artifacts";
import { isValidMaterialDictionarySlug } from "@/lib/bestek/material-dictionary-catalog";
import { readPhase0GroupsFromDisk } from "@/lib/bestek/phase0-element-groups-json";
import type { BestekArchitectMaterialMatching, ElementGroup } from "@/lib/bestek/types";

export const runtime = "nodejs";

type RowIn = {
  group_id: string;
  material_slug?: string;
  notes?: string;
};

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    matchings?: RowIn[];
    created_by?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = String(body.projectId ?? "").trim();
  try {
    assertSafeProjectId(projectId);
  } catch {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }

  const createdBy = String(body.created_by ?? "architect").trim() || "architect";
  const rowsIn = Array.isArray(body.matchings) ? body.matchings : [];

  const groupsPath = phase0ElementGroupsPath(projectId);
  if (!fs.existsSync(groupsPath)) {
    return NextResponse.json({ error: "Element groups missing" }, { status: 404 });
  }

  let groups: ElementGroup[];
  try {
    groups = readPhase0GroupsFromDisk(projectId);
  } catch {
    return NextResponse.json({ error: "Could not read groups" }, { status: 500 });
  }

  const byId = new Map(rowsIn.map((r) => [r.group_id, r]));
  const now = new Date().toISOString();
  const out: BestekArchitectMaterialMatching[] = [];

  for (const g of groups) {
    const row = byId.get(g.group_id);
    const slug = String(row?.material_slug ?? "").trim();
    if (slug && !isValidMaterialDictionarySlug(slug)) {
      return NextResponse.json(
        { error: `Unknown material_slug for ${g.group_id}: not in material-dictionary.json` },
        { status: 400 }
      );
    }
    out.push({
      group_id: g.group_id,
      ifc_type: g.ifc_type,
      element_count: g.element_count,
      material_slug: slug,
      notes: row?.notes?.trim() || undefined,
      created_by: createdBy,
      created_at: now,
    });
  }

  const dest = bestekMaterialMatchingPath(projectId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2), "utf-8");

  const unmatched = out.filter(
    (r) => r.ifc_type !== "IfcSpace" && !r.material_slug.trim()
  ).length;

  return NextResponse.json({
    projectId,
    saved: out.length,
    unmatched,
    path: `data/${projectId}-bestek-material-matching.json`,
    status: "success",
  });
}
