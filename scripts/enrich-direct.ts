import fs from "fs";
import path from "path";
import { enrichLayer1FromIfc } from "../src/lib/layer1-enrich";

async function main() {
  const projectId = "example-direct";
  const inputTtlPath = path.join("data", "example.ttl");
  const outputTtlPath = path.join("data", `${projectId}-enriched.ttl`);
  const ifcPath = path.join("data", "example.ifc");

  const exists = fs.existsSync(inputTtlPath) && fs.existsSync(ifcPath);
  if (!exists) {
    console.error("Missing example.ttl or example.ifc in data/");
    process.exit(1);
  }

  await enrichLayer1FromIfc({
    projectId,
    inputTtlPath,
    outputTtlPath,
    ifcPath,
  });

  const ttl = fs.readFileSync(outputTtlPath, "utf-8");
  console.log("outFile", outputTtlPath);
  console.log("has qty node", ttl.includes("bim:qty-"));
  console.log("has ifcQuantityValue", ttl.includes("ont:ifcQuantityValue"));
  console.log("has ifcQuantityName", ttl.includes("ont:ifcQuantityName"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

