/**
 * KBOB Liste v8.02 (sheet "Baumaterialien Matériaux") -> Turtle source graph.
 * Run: node scripts/import-kbob.js [path-to-xlsx]
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const KB_URI = "https://tabulas.eu/sources/kbob#";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";

const UUID_RE =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

function ttlLit(s) {
  return JSON.stringify(String(s ?? ""));
}

/**
 * Column 5 (density kg/m³) is sometimes a range like "1200-2000" — `Number()` is NaN.
 * Use the midpoint so volume→mass conversion works in Phase 3 when GWP is per kg.
 */
function parseDensityCell(raw) {
  if (raw === "" || raw === undefined || raw === null) return NaN;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const s = String(raw).trim();
  if (!s || s === "-") return NaN;
  const range = s.match(
    /^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/
  );
  if (range) {
    const a = Number(range[1].replace(",", "."));
    const b = Number(range[2].replace(",", "."));
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function main() {
  const defaultPath =
    "docs/DataSetMaterials/Oekobilanzdaten_ Baubereich_Donne_ecobilans_construction_2009-1-2022_v8.02.xlsx";
  const xlsxPath = path.resolve(process.argv[2] || defaultPath);
  if (!fs.existsSync(xlsxPath)) {
    console.error("File not found:", xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sh = wb.Sheets["Baumaterialien Matériaux"];
  if (!sh) {
    console.error('Sheet "Baumaterialien Matériaux" not found');
    process.exit(1);
  }

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const out = [];
  out.push(`@prefix kbobsrc: <${KB_URI}> .`);
  out.push(`@prefix ont: <${ONT_URI}> .`);
  out.push(`@prefix schema: <${SCHEMA_URI}> .`);
  out.push(`@prefix xsd: <${XSD_URI}> .`);
  out.push("");

  let rows = 0;
  let skipped = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const uuid = String(row[1] ?? "").trim();
    const nameDe = String(row[2] ?? "").trim();
    const nameFr = String(row[29] ?? "").trim();
    const unit = String(row[6] ?? "").trim();
    const dens = row[5];
    const gwp = row[25];

    if (!UUID_RE.test(uuid) || !nameDe) {
      skipped++;
      continue;
    }

    const gwpNum =
      typeof gwp === "number"
        ? gwp
        : gwp === "" || gwp === undefined
          ? NaN
          : Number(String(gwp).replace(",", "."));
    const densNum = parseDensityCell(dens);

    const idFrag = `uuid-${uuid}`;
    const matchText = [nameDe, nameFr, uuid].filter(Boolean).join(" | ");

    out.push(`kbobsrc:${idFrag} a ont:EPD ;`);
    out.push(`  ont:kbobUuid ${ttlLit(uuid)} ;`);
    out.push(`  schema:name ${ttlLit(nameDe)} ;`);
    if (nameFr) {
      out.push(`  ont:alternateName ${ttlLit(nameFr)} ;`);
    }
    out.push(`  ont:declaredUnit ${ttlLit(unit || "1")} ;`);
    if (Number.isFinite(gwpNum)) {
      out.push(`  ont:gwpPerUnit "${gwpNum}"^^xsd:decimal ;`);
    }
    if (Number.isFinite(densNum)) {
      out.push(`  ont:density "${densNum}"^^xsd:decimal ;`);
    }
    out.push(`  ont:matchText ${ttlLit(matchText)} ;`);
    out.push(`  ont:sourceDataset "kbob" ;`);
    out.push(`  ont:sourceVersion "8.02" ;`);
    out.push(
      `  ont:importedAt "${new Date().toISOString()}"^^xsd:dateTime ;`
    );
    out.push(`  ont:sourceFileName ${ttlLit(path.basename(xlsxPath))} .`);
    out.push("");

    rows++;
  }

  const outDir = path.join(process.cwd(), "data/sources/kbob");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "kbob-2026-03-16-v8.02.ttl");
  fs.writeFileSync(outFile, out.join("\n"), "utf-8");

  const report = {
    source: "kbob",
    inputFile: path.relative(process.cwd(), xlsxPath),
    outputTtl: path.relative(process.cwd(), outFile),
    rowCount: rows,
    skippedRows: skipped,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "kbob-2026-03-16-v8.02.report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
