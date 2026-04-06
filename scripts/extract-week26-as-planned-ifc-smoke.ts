/**
 * Hard-coded smoke: parse DataSetArch “as-planned” Week 26 IFC with web-ifc (same as Phase 1).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/extract-week26-as-planned-ifc-smoke.ts
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

import { parseIfcPhase1 } from "../src/lib/ifc-parser";
import type { IfcElementRef } from "../src/lib/ifc-parser";

const IFC_RELATIVE =
  "docs/DataSetArch/As Planned models/Week 26 26 june IFC Schependomlaan incl planningsdata.ifc";

const SPATIAL_TYPES = new Set(
  ["IfcBuildingStorey", "IfcSpace", "IfcSite", "IfcBuilding"].map((t) => t.toLowerCase())
);

function collectElements(
  parsed: Awaited<ReturnType<typeof parseIfcPhase1>>,
  max: number
): IfcElementRef[] {
  const out: IfcElementRef[] = [];
  const push = (els: IfcElementRef[]) => {
    for (const e of els) {
      if (out.length >= max) return;
      if (SPATIAL_TYPES.has(e.ifcType.toLowerCase())) continue;
      out.push(e);
    }
  };
  for (const st of parsed.building.storeys) {
    push(st.elements);
    for (const sp of st.spaces) push(sp.elements);
  }
  return out;
}

function countAllElements(parsed: Awaited<ReturnType<typeof parseIfcPhase1>>): number {
  let n = 0;
  for (const st of parsed.building.storeys) {
    n += st.elements.length;
    for (const sp of st.spaces) n += sp.elements.length;
  }
  return n;
}

async function main() {
  const ifcPath = path.join(process.cwd(), IFC_RELATIVE);
  if (!existsSync(ifcPath)) {
    console.error(`Missing IFC: ${ifcPath}`);
    process.exit(1);
  }

  const buf = readFileSync(ifcPath);
  const parsed = await parseIfcPhase1(new Uint8Array(buf));

  const sample = collectElements(parsed, 10).map((e) => ({
    expressId: e.expressId,
    ifcType: e.ifcType,
    name: e.name ?? null,
    globalId: e.globalId ?? null,
    materialCount: e.materials.length,
    materialNames: e.materials.slice(0, 2).map((m) => m.name ?? m.ifcType),
  }));

  const storeySummaries = parsed.building.storeys.slice(0, 8).map((s) => ({
    expressId: s.expressId,
    name: s.name ?? null,
    directElements: s.elements.length,
    spaces: s.spaces.length,
    elementsInSpaces: s.spaces.reduce((a, sp) => a + sp.elements.length, 0),
  }));

  console.log(
    JSON.stringify(
      {
        ifcPath: IFC_RELATIVE,
        ifcSchema: parsed.ifcSchema ?? null,
        building: {
          expressId: parsed.building.expressId,
          name: parsed.building.name ?? null,
          storeyCount: parsed.building.storeys.length,
          totalElements: countAllElements(parsed),
        },
        storeySummaries,
        sampleElements: sample,
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
