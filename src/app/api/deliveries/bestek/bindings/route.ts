import fs from "fs";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import {
  assertSafeProjectId,
  bestekBindingsPath,
  phase0ElementGroupsPath,
} from "@/lib/bestek/artifacts";
import { isValidMaterialDictionarySlug } from "@/lib/bestek/material-dictionary-catalog";
import { readPhase0GroupsFromDisk } from "@/lib/bestek/phase0-element-groups-json";
import type { BestekBinding, ElementGroup } from "@/lib/bestek/types";
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

  const p = bestekBindingsPath(projectId);
  if (!fs.existsSync(p)) {
    return NextResponse.json({ projectId, bindings: [] as BestekBinding[] });
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    const bindings = Array.isArray(raw) ? (raw as BestekBinding[]) : [];
    return NextResponse.json({ projectId, bindings });
  } catch {
    return NextResponse.json({ error: "Could not read bindings file" }, { status: 500 });
  }
}

type BindingInput = {
  group_id: string;
  architect_name: string;
  material_slug?: string;
  approved_brands?: string[];
  or_equivalent?: boolean;
  article_number?: string;
  article_unit?: string;
  article_quantity?: string;
  article_unit_price_eur?: string;
};

const TIMELINE_WORK_LABEL_MAX = 200;

function sanitizeTimelineWorkLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return undefined;
  return oneLine.length > TIMELINE_WORK_LABEL_MAX
    ? oneLine.slice(0, TIMELINE_WORK_LABEL_MAX).trimEnd()
    : oneLine;
}

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    bindings?: BindingInput[];
    created_by?: string;
    /** Optional werf / project title — first line of `timeline:message` so the timeline row is human-readable. */
    timeline_work_label?: string;
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

  const bindingsIn = Array.isArray(body.bindings) ? body.bindings : [];
  if (!bindingsIn.length) {
    return NextResponse.json({ error: "bindings array required" }, { status: 400 });
  }

  const createdBy = String(body.created_by ?? "unknown").trim() || "unknown";
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
  for (const b of bindingsIn) {
    if (!valid.has(b.group_id)) {
      return NextResponse.json({ error: `Invalid group_id: ${b.group_id}` }, { status: 400 });
    }
    const slug = String(b.material_slug ?? "").trim();
    if (slug && !isValidMaterialDictionarySlug(slug)) {
      return NextResponse.json(
        { error: `Unknown material_slug for ${b.group_id}: not in material-dictionary.json` },
        { status: 400 }
      );
    }
  }

  const now = new Date().toISOString();
  const timestamped: BestekBinding[] = bindingsIn.map((b) => {
    const slug = String(b.material_slug ?? "").trim();
    return {
      group_id: b.group_id,
      architect_name: String(b.architect_name ?? "").trim(),
      ...(slug ? { material_slug: slug } : {}),
      approved_brands: b.approved_brands,
      or_equivalent: b.or_equivalent !== false,
      article_number: b.article_number,
      article_unit: b.article_unit,
      article_quantity: b.article_quantity,
      article_unit_price_eur: b.article_unit_price_eur,
      created_by: createdBy,
      created_at: now,
    };
  });

  for (const b of timestamped) {
    const g = groups.find((x) => x.group_id === b.group_id);
    if (g) g.architect_name = b.architect_name;
  }

  fs.writeFileSync(groupsPath, JSON.stringify(groups, null, 2), "utf-8");

  const prevPath = bestekBindingsPath(projectId);
  let existing: BestekBinding[] = [];
  if (fs.existsSync(prevPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(prevPath, "utf-8")) as unknown;
      if (Array.isArray(raw)) existing = raw as BestekBinding[];
    } catch {
      existing = [];
    }
  }
  const touched = new Set(timestamped.map((t) => t.group_id));
  const merged = [
    ...existing.filter((e) => !touched.has(e.group_id)),
    ...timestamped,
  ];
  fs.writeFileSync(prevPath, JSON.stringify(merged, null, 2), "utf-8");

  const bindingBatchId = randomUUID();
  const workLabel = sanitizeTimelineWorkLabel(body.timeline_work_label);
  const messageLines = [
    workLabel,
    `Bestek document opgeslagen — ${timestamped.length} groep(en)`,
    `data/${projectId}-bestek-bindings.json`,
    `batch ${bindingBatchId}`,
  ].filter((line): line is string => Boolean(line?.trim()));
  appendTimelineAuditEvent(projectId, {
    eventId: randomUUID(),
    timestampIso: now,
    actorSystem: false,
    actorLabel: createdBy,
    eventAction: "bestek_bindings_milestone",
    source: "deliveries-bestek",
    bestekBindingSaveBatchId: bindingBatchId,
    message: messageLines.join("\n"),
  });

  return NextResponse.json({
    projectId,
    binding_batch_id: bindingBatchId,
    bindings_saved: timestamped.length,
    timeline_events_created: 1,
    status: "success",
  });
}
