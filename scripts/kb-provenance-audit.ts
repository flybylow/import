/**
 * Audit built KB Turtle: provenance, LCA readiness, element↔material links, UI lineage notes.
 *
 * Usage: npx tsx scripts/kb-provenance-audit.ts [projectId] [--json]
 * Default projectId: example
 */
import fs from "fs";
import path from "path";

import { auditKbTtlFile, formatKbProvenanceAuditText } from "@/lib/kb-provenance-audit";

const NOT_PROJECT_ID = new Set(
  [
    "exists",
    "explicit",
    "when",
    "uses",
    "use",
    "data",
    "ttl",
    "match",
    "enriched",
    "or",
    "the",
    "with",
    "bash",
    "npm",
    "run",
    "tip",
    "must",
    "only",
    "that",
    "scripts",
    "npx",
    "tsx",
    "tsconfig",
    "default",
    "--json",
  ].map((s) => s.toLowerCase())
);

function parseArgs(argv: string[]): { projectId: string; json: boolean } {
  const tail = argv.slice(2).filter((a) => {
    if (!a || a.startsWith("-")) return false;
    if (a === "tsconfig.json" || a.endsWith("/tsconfig.json")) return false;
    if (a.endsWith(".ts") || a.endsWith(".tsx")) return false;
    if (a.includes("node_modules")) return false;
    return true;
  });
  let projectId = "example";
  for (const a of tail) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(a)) continue;
    if (NOT_PROJECT_ID.has(a.toLowerCase())) continue;
    projectId = a;
    break;
  }
  const json = argv.includes("--json");
  return { projectId, json };
}

async function main() {
  const { projectId, json } = parseArgs(process.argv);
  const cwd = process.cwd();
  const kbPath = path.join(cwd, "data", `${projectId}-kb.ttl`);
  const enrichedPath = path.join(cwd, "data", `${projectId}-enriched.ttl`);
  const calcPath = path.join(cwd, "data", `${projectId}-calc-latest.json`);

  if (!fs.existsSync(kbPath)) {
    console.error(`Missing KB: ${kbPath}`);
    console.error("Build the KB for this project (Phase 2 / Link materials to EPD / workflow), then re-run.");
    process.exit(1);
  }

  const kbTtl = fs.readFileSync(kbPath, "utf-8");
  const companion = {
    kbTtlPath: kbPath,
    kbExists: true,
    kbBytes: Buffer.byteLength(kbTtl, "utf-8"),
    enrichedTtlPath: enrichedPath,
    enrichedExists: fs.existsSync(enrichedPath),
    calcLatestJsonPath: calcPath,
    calcExists: fs.existsSync(calcPath),
  };

  const audit = auditKbTtlFile(projectId, kbPath, kbTtl, companion);

  if (json) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  console.log(formatKbProvenanceAuditText(audit));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
