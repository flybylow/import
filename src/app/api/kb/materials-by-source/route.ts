import fs from "fs";
import path from "path";
import * as $rdf from "rdflib";
import { NextResponse } from "next/server";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { materialMatchedSourceKey } from "@/lib/kb-epd-stats";
import { materialDisplayNameFromStore } from "@/lib/material-label";
import { parseKbTtlToStore } from "@/lib/kb-store-queries";

export const runtime = "nodejs";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);

function getLitValue(store: $rdf.Store, subject: unknown, predicate: unknown) {
  const term = store.any(subject as any, predicate as any, null);
  return term?.value;
}

function parseMaterialIdFromSubject(subjectValue: string): number | null {
  const m = /material-(\d+)$/.exec(subjectValue);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function epdSlugFromObject(store: $rdf.Store, epd: unknown): string | undefined {
  const v = String((epd as { value?: string } | null)?.value ?? "");
  const sm = /epd-(.+)$/.exec(v);
  return sm ? sm[1] : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const sourceKey = url.searchParams.get("source")?.trim() ?? "dictionary-no-lca";
  const rawLimit = url.searchParams.get("limit");
  const limit = Math.min(
    800,
    Math.max(1, Number(rawLimit ?? 400) || 400)
  );

  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const kbPath = path.join(process.cwd(), "data", `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) {
    return NextResponse.json(
      { error: `KB not found: data/${projectId}-kb.ttl` },
      { status: 404 }
    );
  }

  const ttl = fs.readFileSync(kbPath, "utf-8");
  const store = parseKbTtlToStore(ttl);

  const rows: Array<{
    materialId: number;
    materialLabel: string;
    epdSlug?: string;
    epdName?: string;
    matchType?: string;
    sourceKey: string;
  }> = [];

  const stmts = store.statementsMatching(null as any, ONT("hasEPD"), null as any);
  for (const st of stmts) {
    const mat = st.subject;
    const epd = st.object;
    const key = materialMatchedSourceKey(store, mat, epd);
    if (key !== sourceKey) continue;

    const mid = parseMaterialIdFromSubject(String(mat.value));
    if (mid == null) continue;

    const slug = epdSlugFromObject(store, epd);
    const epdNode = slug ? BIM(`epd-${slug}`) : null;
    const epdName = epdNode
      ? getLitValue(store, epdNode, SCHEMA("name")) ?? slug
      : undefined;

    rows.push({
      materialId: mid,
      materialLabel: materialDisplayNameFromStore(store, mid),
      epdSlug: slug,
      epdName: epdName ?? undefined,
      matchType: getLitValue(store, mat, ONT("matchType")) ?? undefined,
      sourceKey: key,
    });
  }

  rows.sort((a, b) => a.materialId - b.materialId);
  const total = rows.length;
  const truncated = rows.length > limit;
  const list = truncated ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    projectId,
    source: sourceKey,
    total,
    truncated,
    limit,
    rows: list,
  });
}
