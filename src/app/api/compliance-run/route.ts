import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import type { CompliancePilotSummary } from "@/lib/compliance-pilot";
import {
  COMPLIANCE_RUN_RULES_APPLIED,
  complianceFilePrefixes,
  complianceRunToTurtle,
} from "@/lib/compliance-run-turtle";
import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";

export const runtime = "nodejs";

type PostBody = {
  projectId?: string;
  summary?: CompliancePilotSummary;
  sourceData?: string;
  actorLabel?: string;
  actorSystem?: boolean;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const summary = body.summary;
  if (
    !summary ||
    typeof summary.evaluated !== "number" ||
    !Array.isArray(summary.results)
  ) {
    return NextResponse.json(
      { error: "Missing `summary` with evaluated + results[]" },
      { status: 400 }
    );
  }

  const sourceData =
    typeof body.sourceData === "string" && body.sourceData.trim()
      ? body.sourceData.trim()
      : `${projectId}.ifc`;

  const actorLabel =
    typeof body.actorLabel === "string" && body.actorLabel.trim()
      ? body.actorLabel.trim()
      : "system (automated test)";

  const actorSystem = body.actorSystem !== false;

  const runId = randomUUID();
  const timestampIso = new Date().toISOString();

  const block = complianceRunToTurtle({
    runId,
    timestampIso,
    actorSystem,
    actorLabel,
    action: "compliance_evaluation",
    rulesApplied: [...COMPLIANCE_RUN_RULES_APPLIED],
    summary,
    sourceData,
  });

  const dataDir = path.join(process.cwd(), "data");
  const fileName = `${projectId}-compliance-events.ttl`;
  const absPath = path.join(dataDir, fileName);

  let toWrite = `\n# ComplianceRun ${timestampIso} runId=${runId}\n${block}\n`;
  if (!fs.existsSync(absPath) || fs.statSync(absPath).size === 0) {
    toWrite = complianceFilePrefixes() + toWrite.trimStart();
  }

  fs.appendFileSync(absPath, toWrite, "utf-8");

  return NextResponse.json({
    ok: true,
    runId,
    path: `data/${fileName}`,
    timestampIso,
    rulesApplied: COMPLIANCE_RUN_RULES_APPLIED,
  });
}
