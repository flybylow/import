import fs from "fs";
import { NextResponse } from "next/server";

import {
  assertSafeProjectId,
  bestekBindingsPath,
  phase0ElementGroupsPath,
} from "@/lib/bestek/artifacts";
import { computeBestekCouplingSignatureSha256 } from "@/lib/bestek/coupling-signature";
import { getDictionaryEntryBySlug } from "@/lib/bestek/material-dictionary-catalog";
import { readPhase0GroupsFromDisk } from "@/lib/bestek/phase0-element-groups-json";
import type { BestekBinding, ElementGroup } from "@/lib/bestek/types";

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
    return NextResponse.json({ error: "Element groups not found" }, { status: 404 });
  }

  let groups: ElementGroup[];
  try {
    groups = readPhase0GroupsFromDisk(projectId);
  } catch {
    return NextResponse.json({ error: "Could not read element groups" }, { status: 500 });
  }

  const bindingsPath = bestekBindingsPath(projectId);
  let bindings: BestekBinding[] = [];
  if (fs.existsSync(bindingsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(bindingsPath, "utf-8")) as unknown;
      if (Array.isArray(raw)) bindings = raw as BestekBinding[];
    } catch {
      bindings = [];
    }
  }

  const bindingByGroup = new Map(bindings.map((b) => [b.group_id, b]));
  const materialMatchedCount = groups.filter((g) => {
    const b = bindingByGroup.get(g.group_id);
    return Boolean(b?.material_slug?.trim());
  }).length;

  const namedGroups = groups.filter((g) => {
    const name = g.architect_name?.trim();
    if (name) return true;
    return bindingByGroup.has(g.group_id);
  });

  const totalElements = groups.reduce((sum, g) => sum + g.element_count, 0);
  const elementsWithBinding = namedGroups.reduce((sum, g) => sum + g.element_count, 0);
  const totalGroups = groups.length;
  const namedCount = namedGroups.length;
  const coverage_percent =
    totalGroups > 0 ? Math.round((namedCount / totalGroups) * 100) : 0;
  const material_coverage_percent =
    totalGroups > 0 ? Math.round((materialMatchedCount / totalGroups) * 100) : 0;

  const sig = computeBestekCouplingSignatureSha256(projectId);

  return NextResponse.json({
    projectId,
    total_element_groups: totalGroups,
    named_groups: namedCount,
    material_matched_groups: materialMatchedCount,
    coverage_percent,
    material_coverage_percent,
    total_elements: totalElements,
    elements_with_binding: elementsWithBinding,
    bestekCouplingSignatureSha256: sig,
    groups: groups.map((g) => {
      const b = bindingByGroup.get(g.group_id);
      const named = Boolean(g.architect_name?.trim() || b);
      const slug = b?.material_slug?.trim();
      const dict = slug ? getDictionaryEntryBySlug(slug) : undefined;
      const hasMaterial = Boolean(slug);
      return {
        group_id: g.group_id,
        ifc_type: g.ifc_type,
        element_count: g.element_count,
        architect_name: g.architect_name ?? b?.architect_name ?? null,
        article_number: b?.article_number ?? null,
        article_unit: b?.article_unit ?? null,
        article_quantity: b?.article_quantity ?? null,
        material_slug: slug ?? null,
        material_name: dict?.standardName ?? null,
        gwp_kg_co2e_per_tonne: dict?.gwpKgCo2ePerTonne ?? null,
        status: hasMaterial ? "complete" : named ? "named" : "pending",
      };
    }),
  });
}
