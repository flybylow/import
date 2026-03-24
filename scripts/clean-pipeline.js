#!/usr/bin/env node
/**
 * Remove generated pipeline artifacts for one project under data/.
 * Does NOT delete: IFC fixtures, source snapshots (data/sources/**), or config.json.
 *
 * Usage:
 *   node scripts/clean-pipeline.js [projectId]
 *   PROJECT_ID=myproj node scripts/clean-pipeline.js
 *
 * Default projectId: example
 */
const fs = require("fs");
const path = require("path");

const projectId = (
  process.env.PROJECT_ID ||
  process.argv[2] ||
  "example"
).trim();

const dataDir = path.join(process.cwd(), "data");

const files = [
  `${projectId}.ttl`,
  `${projectId}-enriched.ttl`,
  `${projectId}-translated.ttl`,
  `${projectId}-kb.ttl`,
  `${projectId}-calc.ttl`,
  `${projectId}-calc-latest.json`,
];

let removed = 0;
for (const f of files) {
  const p = path.join(dataDir, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log("removed", path.join("data", f));
    removed++;
  }
}

if (!removed) {
  console.log(
    `No pipeline files found for projectId="${projectId}" (nothing to remove).`
  );
} else {
  console.log(`Done. Removed ${removed} file(s) for projectId="${projectId}".`);
}
