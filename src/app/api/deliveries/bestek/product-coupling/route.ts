import fs from "fs";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import {
  assertSafeProjectId,
  phase0ElementGroupsPath,
  productCouplingPath,
} from "@/lib/bestek/artifacts";
import { computeBestekCouplingSignatureSha256 } from "@/lib/bestek/coupling-signature";
import { readPhase0GroupsFromDisk } from "@/lib/bestek/phase0-element-groups-json";
import type { ElementGroup, ProductCouplingFile, ProductCouplingRow } from "@/lib/bestek/types";
import { appendTimelineAuditEvent } from "@/lib/timeline/append-event";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  try {
    assertSafeProjectId(projectId);
  } catch {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }
  const p = productCouplingPath(projectId);
  if (!fs.existsSync(p)) {
    return NextResponse.json({
      projectId,
      couplings: [] as ProductCouplingRow[],
    });
  }
  try {
    const doc = JSON.parse(fs.readFileSync(p, "utf-8")) as ProductCouplingFile;
    return NextResponse.json({
      projectId,
      couplings: Array.isArray(doc.couplings) ? doc.couplings : [],
      updated_at: doc.updated_at,
      updated_by: doc.updated_by,
    });
  } catch {
    return NextResponse.json({ error: "Could not read coupling file" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    couplings?: ProductCouplingRow[];
    updated_by?: string;
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

  const couplings = Array.isArray(body.couplings) ? body.couplings : [];
  const updatedBy = String(body.updated_by ?? "contractor").trim() || "contractor";

  const groupsPath = phase0ElementGroupsPath(projectId);
  if (!fs.existsSync(groupsPath)) {
    return NextResponse.json({ error: "Element groups missing; run group-ifc first." }, { status: 404 });
  }

  let groups: ElementGroup[];
  try {
    groups = readPhase0GroupsFromDisk(projectId);
  } catch {
    return NextResponse.json({ error: "Could not read element groups" }, { status: 500 });
  }

  const valid = new Set(groups.map((g) => g.group_id));
  for (const c of couplings) {
    if (!valid.has(c.group_id)) {
      return NextResponse.json({ error: `Invalid group_id: ${c.group_id}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const doc: ProductCouplingFile = {
    updated_at: now,
    updated_by: updatedBy,
    couplings,
  };

  fs.writeFileSync(productCouplingPath(projectId), JSON.stringify(doc, null, 2), "utf-8");

  const sigFull = computeBestekCouplingSignatureSha256(projectId);
  const rowsJson = JSON.stringify(couplings);

  appendTimelineAuditEvent(projectId, {
    eventId: randomUUID(),
    timestampIso: now,
    actorSystem: false,
    actorLabel: updatedBy,
    eventAction: "product_coupling_updated",
    source: "deliveries-bestek",
    productCouplingFields: {
      couplingRowsJson: rowsJson.length > 12_000 ? rowsJson.slice(0, 12_000) + "…" : rowsJson,
      couplingSignatureSha256: sigFull ?? undefined,
    },
  });

  return NextResponse.json({
    projectId,
    couplings_saved: couplings.length,
    bestekCouplingSignatureSha256: sigFull,
    status: "success",
  });
}
