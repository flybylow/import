/**
 * Dry-run KB translate and print material match counts (writes KB to a temp file only).
 * Usage: npx tsx scripts/report-epd-coverage.ts [projectId]
 * Default projectId: example
 */
import fs from "fs";
import os from "os";
import path from "path";

import { translateLayer2FromEnrichedTtl } from "@/lib/layer2-translate";

/**
 * Words that look like ids but come from pasted docs / shell noise (not project ids).
 */
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
  ].map((s) => s.toLowerCase())
);

/** With `tsx --tsconfig … scripts/…ts [projectId]`, argv[2] is not the id. */
function parseProjectId(argv: string[]): string {
  let raw = argv.slice(2);
  const hashIdx = raw.indexOf("#");
  if (hashIdx >= 0) {
    raw = raw.slice(0, hashIdx);
  }
  const tail = raw.filter((a) => {
    if (!a || a.startsWith("-") || a === "#" || a.startsWith("#")) return false;
    if (a === "tsconfig.json" || a.endsWith("/tsconfig.json")) return false;
    if (a.endsWith(".ts") || a.endsWith(".tsx")) return false;
    if (a.includes("node_modules")) return false;
    return true;
  });
  for (const a of tail) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(a)) continue;
    if (NOT_PROJECT_ID.has(a.toLowerCase())) continue;
    return a;
  }
  return "example";
}

async function main() {
  const projectId = parseProjectId(process.argv);
  const cwd = process.cwd();
  const enriched = path.join(cwd, "data", `${projectId}-enriched.ttl`);
  if (!fs.existsSync(enriched)) {
    console.error(`Missing enriched TTL: ${enriched}`);
    console.error(
      `Tip: use a projectId that matches data/<projectId>-enriched.ttl (e.g. example). You passed resolved id: "${projectId}"`
    );
    process.exit(1);
  }
  const out = path.join(os.tmpdir(), `kb-${projectId}-${Date.now()}.ttl`);
  try {
    const r = await translateLayer2FromEnrichedTtl({
      projectId,
      inputTtlPath: enriched,
      outputTtlPath: out,
    });
    console.log(
      JSON.stringify(
        {
          projectId,
          materialsMatched: r.materialsMatched,
          materialsTotal: r.materialsTotal,
          unmatched: r.materialsTotal - r.materialsMatched,
          epdsCreated: r.epdsCreated,
          materialDictionaryVersion: r.materialDictionaryVersion,
        },
        null,
        2
      )
    );
  } finally {
    try {
      fs.unlinkSync(out);
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
