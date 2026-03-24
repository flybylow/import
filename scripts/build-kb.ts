/**
 * Rebuild Phase 2 KB Turtle from enriched input (same as POST /api/kb).
 * Usage: npx tsx --tsconfig tsconfig.json scripts/build-kb.ts [projectId]
 * Default projectId: example
 *
 * Requires: data/<projectId>-enriched.ttl
 * Writes:   data/<projectId>-kb.ttl
 */
import fs from "fs";
import path from "path";

import { translateLayer2FromEnrichedTtl } from "@/lib/layer2-translate";

async function main() {
  const projectId = (process.argv[2] || "example").trim();
  const cwd = process.cwd();
  const enriched = path.join(cwd, "data", `${projectId}-enriched.ttl`);
  const out = path.join(cwd, "data", `${projectId}-kb.ttl`);

  if (!fs.existsSync(enriched)) {
    console.error(`Missing enriched TTL: ${enriched}`);
    process.exit(1);
  }

  const r = await translateLayer2FromEnrichedTtl({
    projectId,
    inputTtlPath: enriched,
    outputTtlPath: out,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        kbPath: `data/${projectId}-kb.ttl`,
        materialsMatched: r.materialsMatched,
        materialsTotal: r.materialsTotal,
        epdsCreated: r.epdsCreated,
        materialDictionaryVersion: r.materialDictionaryVersion,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
