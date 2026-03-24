/**
 * ICE Educational V4.1 — sheet "ICE Summary" -> Turtle source graph.
 * Run: node scripts/import-ice.js [path-to-xlsx]
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");

const ICE_URI = "https://tabulas.eu/sources/ice#";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";

function ttlLit(s) {
  return JSON.stringify(String(s ?? ""));
}

function slugFromName(name) {
  const h = crypto.createHash("sha1").update(name).digest("hex").slice(0, 12);
  const safe = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${safe || "entry"}-${h}`;
}

function main() {
  const defaultPath =
    "docs/DataSetMaterials/ICE DB Educational V4.1 - Oct 2025/ICE DB Educational V4.1 - Oct 2025.xlsx";
  const xlsxPath = path.resolve(process.argv[2] || defaultPath);
  if (!fs.existsSync(xlsxPath)) {
    console.error("File not found:", xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sh = wb.Sheets["ICE Summary"];
  if (!sh) {
    console.error('Sheet "ICE Summary" not found');
    process.exit(1);
  }

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const out = [];
  out.push(`@prefix icesrc: <${ICE_URI}> .`);
  out.push(`@prefix ont: <${ONT_URI}> .`);
  out.push(`@prefix schema: <${SCHEMA_URI}> .`);
  out.push(`@prefix xsd: <${XSD_URI}> .`);
  out.push("");

  let rows = 0;
  let skipped = 0;
  let section = "";

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const c5 = String(row[5] ?? "").trim();
    const c6 = row[6];
    const c19 = String(row[19] ?? "").trim();

    if (c5 === "Materials" && String(c6).includes("Embodied Carbon")) {
      continue;
    }

    if (
      c5 &&
      !c6 &&
      !c19 &&
      row.slice(0, 5).every((x) => !String(x ?? "").trim())
    ) {
      if (/^[A-Za-z]/.test(c5) && c5.length < 80) {
        section = c5;
      }
      continue;
    }

    const gwpNum =
      typeof c6 === "number"
        ? c6
        : c6 === "" || c6 === undefined
          ? NaN
          : Number(String(c6).replace(",", "."));

    if (!c5 || !Number.isFinite(gwpNum)) {
      skipped++;
      continue;
    }

    const longName = c19 || c5;
    const slug = slugFromName(longName);
    const frag = `entry-${slug}`;
    const matchText = [section, longName, c5].filter(Boolean).join(" | ");

    out.push(`icesrc:${frag} a ont:EPD ;`);
    out.push(`  schema:name ${ttlLit(longName)} ;`);
    out.push(`  ont:sourceDataset "ice-educational" ;`);
    out.push(`  ont:sourceVersion "4.1-oct-2025" ;`);
    if (section) {
      out.push(`  ont:iceSection ${ttlLit(section)} ;`);
    }
    out.push(`  ont:declaredUnit "kg" ;`);
    out.push(`  ont:gwpPerUnit "${gwpNum}"^^xsd:decimal ;`);
    out.push(`  ont:matchText ${ttlLit(matchText)} ;`);
    out.push(`  ont:iceShortLabel ${ttlLit(c5)} ;`);
    out.push(
      `  ont:importedAt "${new Date().toISOString()}"^^xsd:dateTime ;`
    );
    out.push(`  ont:sourceFileName ${ttlLit(path.basename(xlsxPath))} .`);
    out.push("");

    rows++;
  }

  const outDir = path.join(process.cwd(), "data/sources/ice");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "ice-educational-2025-10-v4.1.ttl");
  fs.writeFileSync(outFile, out.join("\n"), "utf-8");

  const report = {
    source: "ice-educational",
    inputFile: path.relative(process.cwd(), xlsxPath),
    outputTtl: path.relative(process.cwd(), outFile),
    rowCount: rows,
    skippedRows: skipped,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "ice-educational-2025-10-v4.1.report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
