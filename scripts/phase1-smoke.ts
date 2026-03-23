import { readFileSync } from "fs";
import { parseIfcPhase1 } from "../src/lib/ifc-parser";
import { generateTriplesPhase1 } from "../src/lib/triple-generator";

async function main() {
  const ifcPath =
    process.argv[2] ??
    "data/IFC Schependomlaan.ifc";

  const buf = readFileSync(ifcPath);
  const bytes = new Uint8Array(buf);

  const parsed = await parseIfcPhase1(bytes);
  const projectId = "phase1-smoke";

  const { ttl } = await generateTriplesPhase1({ projectId, parsed });

  const hasBotBuilding = ttl.includes("bot:Building");
  const hasBotElement = ttl.includes("bot:Element");
  const elementCount = (ttl.match(/bot:Element/g) ?? []).length;

  const storeyCount = parsed.building.storeys.length;
  const spaceCount = parsed.building.storeys.reduce((acc, s) => acc + s.spaces.length, 0);
  const elementCountParsed = parsed.building.storeys.reduce(
    (acc, s) => acc + s.elements.length + s.spaces.reduce((a, sp) => a + sp.elements.length, 0),
    0
  );

  console.log(
    JSON.stringify(
      {
        ifcPath,
        ok: hasBotBuilding && hasBotElement && elementCount > 0,
        hasBotBuilding,
        hasBotElement,
        elementCountTurtle: elementCount,
        storeyCount,
        spaceCount,
        elementCountParsed,
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

