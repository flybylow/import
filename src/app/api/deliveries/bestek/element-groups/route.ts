import fs from "fs";
import { NextResponse } from "next/server";

import { assertSafeProjectId, phase0ElementGroupsPath } from "@/lib/bestek/artifacts";
import { parsePhase0ElementGroupsFile } from "@/lib/bestek/phase0-element-groups-json";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  try {
    assertSafeProjectId(projectId);
  } catch {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }

  const fp = phase0ElementGroupsPath(projectId);
  if (!fs.existsSync(fp)) {
    return NextResponse.json(
      { error: "Element groups not found. POST /api/deliveries/bestek/group-ifc first." },
      { status: 404 }
    );
  }

  let parsed: ReturnType<typeof parsePhase0ElementGroupsFile>;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as unknown;
    parsed = parsePhase0ElementGroupsFile(raw);
  } catch {
    return NextResponse.json({ error: "Could not read element groups file" }, { status: 500 });
  }

  const { groups, generatedAt } = parsed;
  const totalElements = groups.reduce((sum, g) => sum + g.element_count, 0);
  return NextResponse.json({
    projectId,
    groups,
    generated_at: generatedAt ?? null,
    total_groups: groups.length,
    total_elements: totalElements,
  });
}
