import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import {
  assertSafeProjectId,
  phase0ElementGroupsPath,
  projectIfcPath,
} from "@/lib/bestek/artifacts";
import { groupIfcElementsByType } from "@/lib/bestek/phase0-group-ifc";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let projectId = "";
  try {
    const form = await request.formData();
    const pid = form.get("projectId");
    projectId = typeof pid === "string" ? pid.trim() : "";
    assertSafeProjectId(projectId);
    const file = form.get("file");
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let bytes: Uint8Array;
    if (file instanceof File && file.size > 0) {
      const ab = await file.arrayBuffer();
      bytes = new Uint8Array(ab);
      const dest = projectIfcPath(projectId);
      fs.writeFileSync(dest, Buffer.from(bytes));
    } else {
      const p = projectIfcPath(projectId);
      if (!fs.existsSync(p)) {
        return NextResponse.json(
          {
            error:
              "No IFC: upload a file or place data/<projectId>.ifc before regrouping.",
          },
          { status: 400 }
        );
      }
      bytes = new Uint8Array(fs.readFileSync(p));
    }

    const groups = await groupIfcElementsByType(bytes);
    const outPath = phase0ElementGroupsPath(projectId);
    const payload = {
      generatedAt: new Date().toISOString(),
      groups,
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");

    const totalElements = groups.reduce((s, g) => s + g.element_count, 0);
    return NextResponse.json({
      projectId,
      groupsWritten: groups.length,
      totalElements,
      path: `data/${projectId}-phase0-element-groups.json`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Invalid projectId") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("deliveries/bestek/group-ifc:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
