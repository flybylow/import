/**
 * CLI: import IFC → TTL + enrich (same as POST /api/run-example + /api/enrich).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-import-enrich-sample.ts
 */
import fs from "fs";
import path from "path";
import { enrichLayer1FromIfc } from "@/lib/layer1-enrich";
import { parseIfcPhase1 } from "@/lib/ifc-parser";
import {
  PHASE1_LIBRARY_SAMPLES,
  resolvePhase1LibrarySampleKey,
  type Phase1LibrarySampleKey,
} from "@/lib/phase1-library-samples";
import { generateTriplesPhase1 } from "@/lib/triple-generator";

const sampleArg = process.argv[2]?.trim();
const sampleKey: Phase1LibrarySampleKey = resolvePhase1LibrarySampleKey(
  sampleArg ?? "communityWall"
);
const meta = PHASE1_LIBRARY_SAMPLES[sampleKey];
const projectId = meta.suggestedProjectId;
const cwd = process.cwd();
const dataDir = path.join(cwd, "data");
const ifcPath = path.join(dataDir, meta.dataFile);
const inputTtlPath = path.join(dataDir, `${projectId}.ttl`);
const outEnrichedPath = path.join(dataDir, `${projectId}-enriched.ttl`);

async function main() {
  if (!fs.existsSync(ifcPath)) {
    console.error(`Missing ${ifcPath}`);
    process.exit(1);
  }
  const bytes = new Uint8Array(fs.readFileSync(ifcPath));
  console.log("parseIfcPhase1…", meta.dataFile, bytes.length, "bytes");
  const parsed = await parseIfcPhase1(bytes);
  const { ttl } = await generateTriplesPhase1({ projectId, parsed });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(inputTtlPath, ttl, "utf-8");
  fs.writeFileSync(path.join(dataDir, `${projectId}.ifc`), Buffer.from(bytes));
  console.log("wrote", path.relative(cwd, inputTtlPath), ttl.length, "chars");

  console.log("enrichLayer1FromIfc…");
  await enrichLayer1FromIfc({
    projectId,
    inputTtlPath,
    outputTtlPath: outEnrichedPath,
    ifcPath,
  });
  const st = fs.statSync(outEnrichedPath);
  console.log("ok", path.relative(cwd, outEnrichedPath), st.size, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
