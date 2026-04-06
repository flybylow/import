import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import {
  auditKbTtlFile,
  formatKbProvenanceAuditText,
  type KbProvenanceAudit,
} from "@/lib/kb-provenance-audit";

export const runtime = "nodejs";

const PROJECT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

function listProjectsWithKb(dataDir: string): string[] {
  const out: string[] = [];
  try {
    const names = fs.readdirSync(dataDir);
    const suf = "-kb.ttl";
    for (const n of names) {
      if (!n.endsWith(suf)) continue;
      out.push(n.slice(0, -suf.length));
    }
  } catch {
    return [];
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * GET /api/admin/kb-audit — list project ids that have `data/<id>-kb.ttl`.
 * GET /api/admin/kb-audit?projectId=foo — full audit JSON + `textReport` (CLI-shaped text).
 */
export async function GET(request: Request) {
  const cwd = process.cwd();
  const dataDir = path.join(cwd, "data");
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";

  if (!projectId) {
    return NextResponse.json({ projects: listProjectsWithKb(dataDir) });
  }

  if (!PROJECT_ID_RE.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }

  const kbPath = path.join(dataDir, `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) {
    return NextResponse.json(
      {
        error: `No KB at data/${projectId}-kb.ttl`,
        projects: listProjectsWithKb(dataDir),
      },
      { status: 404 }
    );
  }

  let kbTtl: string;
  try {
    kbTtl = fs.readFileSync(kbPath, "utf-8");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read KB TTL" },
      { status: 500 }
    );
  }

  const enrichedPath = path.join(dataDir, `${projectId}-enriched.ttl`);
  const calcPath = path.join(dataDir, `${projectId}-calc-latest.json`);
  const companion: KbProvenanceAudit["companionFiles"] = {
    kbTtlPath: kbPath,
    kbExists: true,
    kbBytes: Buffer.byteLength(kbTtl, "utf-8"),
    enrichedTtlPath: enrichedPath,
    enrichedExists: fs.existsSync(enrichedPath),
    calcLatestJsonPath: calcPath,
    calcExists: fs.existsSync(calcPath),
  };

  const audit = auditKbTtlFile(projectId, kbPath, kbTtl, companion);
  const textReport = formatKbProvenanceAuditText(audit);

  return NextResponse.json({
    ok: true as const,
    projectId,
    textReport,
    audit,
  });
}
