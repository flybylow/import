/**
 * Belgian B-EPD — extracted JSON (EN 15804+A2 indicators) -> Turtle source graph.
 *
 * GWP policy (cradle-to-gate modules A1–A3):
 * - Use numeric `GWP_total_A1-A3` when present.
 * - Else sum `GWP_total_A1` + `GWP_total_A2` + `GWP_total_A3` when all are finite.
 * - Otherwise skip row (no ont:gwpPerUnit).
 *
 * Declared unit: PDF extraction often corrupts `declared_unit`. We scan that field plus
 * `filename` for phrases like "1 m2", "1 m3", "per kg", "1 t"; otherwise skip row.
 * Per-tonne GWP is converted to per-kg for Phase 3 (`ont:gwpPerUnit` / `ont:declaredUnit` "kg").
 *
 * Run: node scripts/import-b-epd.js [path-to-json]
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BEPD_URI = "https://tabulas.eu/sources/b-epd-be#";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const DCT_URI = "http://purl.org/dc/terms/";
const XSD_URI = "http://www.w3.org/2001/XMLSchema#";

const SOURCE_VERSION = "2026-03-28";

function ttlLit(s) {
  return JSON.stringify(String(s ?? ""));
}

function slugFromKey(key) {
  const h = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
  const safe = String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${safe || "entry"}-${h}`;
}

function formatGwpDecimal(n) {
  if (!Number.isFinite(n)) return null;
  let s = n.toFixed(8);
  s = s.replace(/\.?0+$/, "");
  return s || "0";
}

function num(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function gwpA1toA3(row) {
  const combined = num(row["GWP_total_A1-A3"]);
  if (Number.isFinite(combined)) return combined;
  const a1 = num(row.GWP_total_A1);
  const a2 = num(row.GWP_total_A2);
  const a3 = num(row.GWP_total_A3);
  if (
    Number.isFinite(a1) &&
    Number.isFinite(a2) &&
    Number.isFinite(a3)
  ) {
    return a1 + a2 + a3;
  }
  return NaN;
}

/** Share of '.' in string — PDF table junk. */
function isMostlyDots(s) {
  if (!s || s.length < 8) return false;
  const dots = (s.match(/\./g) || []).length;
  return dots / s.length > 0.25;
}

function manufacturerOk(s) {
  if (!s || s.length < 2) return false;
  if (isMostlyDots(s)) return false;
  const t = String(s).trim();
  if (!t) return false;
  // Common boilerplate / extraction junk (seen in current B-EPD JSON output).
  if (/cannot be held responsible/i.test(t)) return false;
  if (/of this environmental product declaration/i.test(t)) return false;
  if (/in a single production site/i.test(t)) return false;
  if (/^\(following the dtu/i.test(t)) return false;
  // Table-of-contents dot leaders (e.g. "Fabricant .......... 19")
  if (/^\s*(fabricant|manufacturer|producer)\s+\.+/i.test(t)) return false;
  // Avoid “sentence fragments” as producers.
  if (/[.]{0,1}\s*$/.test(t) && t.split(/\s+/).length < 2) return false;
  return true;
}

function isoDateOnly(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Infer declared unit + optional GWP scale fix (tonne -> per kg).
 * Returns { declaredUnit: string, gwpScale: number } or null.
 */
function inferDeclaredUnitAndScale(declaredRaw, filename) {
  const text = `${declaredRaw ?? ""} ${filename ?? ""}`
    .replace(/\u00b2/g, "2")
    .replace(/\u00b3/g, "3");

  if (/\b1\s*t(?:onne)?s?\b/i.test(text) || /\bper\s*tonne\b/i.test(text)) {
    return { declaredUnit: "kg", gwpScale: 1 / 1000 };
  }

  if (
    /\b1\s*m\s*3\b/i.test(text) ||
    /\b1\s*m³\b/i.test(text) ||
    /\b1m3\b/i.test(text) ||
    /\b1\s*m\^3\b/i.test(text) ||
    /\bm\s*3\s+of\s+ready-?mixed\b/i.test(text)
  ) {
    return { declaredUnit: "1 m3", gwpScale: 1 };
  }

  if (
    /\b1\s*m\s*2\b/i.test(text) ||
    /\b1\s*m2\b/i.test(text) ||
    /\b1m2\b/i.test(text) ||
    /\b1\s*m\^2\b/i.test(text) ||
    /\bper\s*m\s*2\b/i.test(text) ||
    /\binstallation\s+of\s+1\s*m\s*2\b/i.test(text) ||
    /\bdecorate\s+1\s*m\s*2\b/i.test(text)
  ) {
    return { declaredUnit: "1 m2", gwpScale: 1 };
  }

  if (
    /^\s*kg\s*$/i.test(String(declaredRaw ?? "").trim()) ||
    /\bper\s*kg\b/i.test(text) ||
    /\b1\s*kg\b/i.test(text)
  ) {
    return { declaredUnit: "kg", gwpScale: 1 };
  }

  const duRaw = String(declaredRaw ?? "").trim();
  if (isMostlyDots(duRaw)) {
    return inferDeclaredUnitFromFilename(filename);
  }

  const du = duRaw.toLowerCase();
  if (du === "kg" || du.startsWith("kg ")) {
    return { declaredUnit: "kg", gwpScale: 1 };
  }

  const duAscii = duRaw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (duAscii.includes("module") && duAscii.includes("declar")) {
    return inferDeclaredUnitFromFilename(filename);
  }

  return null;
}

/** When PDF text is junk, infer from product words in filename (conservative). */
function inferDeclaredUnitFromFilename(filename) {
  const f = String(filename ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  if (
    /concrete|ready-?mixed|\bcem\b|cement|beton|mortar|screed|zand|aggreg|bulk holcim|fedbeton|carbstone|masonry block|hollow concrete/i.test(
      f
    )
  ) {
    return { declaredUnit: "1 m3", gwpScale: 1 };
  }

  if (
    /insulation|rockwool|glaswol|glass wool|pir|eps|xps|kingspan|kooltherm|recticel|isohem|webercoll|lambda|ursa|isola|unilin|mineral wool/i.test(
      f
    )
  ) {
    return { declaredUnit: "1 m2", gwpScale: 1 };
  }

  if (
    /plaster|platre|gypsum|gyproc|gips|knauf|plaque|drywall|lining|ceiling|covering|paint|lacquer|coating|dalle|paving|pierre|ceramic|brick|tile|socket|switch|door|window|kozijn|alumin|steel sheet|profile|saint-?gobain|gyplat|firebloc|soundbloc|duragyp|rf-?tech|damper|bordure|moellon/i.test(
      f
    )
  ) {
    return { declaredUnit: "1 m2", gwpScale: 1 };
  }

  if (/wood|hout|timber|bois de structure/i.test(f)) {
    return { declaredUnit: "kg", gwpScale: 1 };
  }

  return null;
}

/** B-EPD-style registration fragment from filename, if any. */
function bepdIdFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const m = base.match(
    /(?:B-EPD|B_EPD)[\s._-]*(\d{2,3}[\._]\d{4}[\._]\d{2,4})/i
  );
  if (m) return m[1].replace(/\./g, "-");
  const m2 = base.match(/(\d{2}[\._]\d{4}[\._]\d{2,4})/);
  if (m2) return m2[1].replace(/\./g, "-");
  return null;
}

function displayName(row) {
  const fn = path.basename(String(row.filename ?? ""), ".pdf");
  const epdName = String(row.epd_name ?? "").trim();
  if (epdName && epdName !== "." && !isMostlyDots(epdName)) {
    return `${fn} (${epdName})`;
  }
  return fn || "B-EPD product";
}

function main() {
  const defaultPath = "data/sources/B-EPD/epd_data_2026-03-28.json";
  const jsonPath = path.resolve(process.cwd(), process.argv[2] || defaultPath);
  if (!fs.existsSync(jsonPath)) {
    console.error("File not found:", jsonPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    console.error("Expected JSON array");
    process.exit(1);
  }

  const out = [];
  out.push(`@prefix bsrc: <${BEPD_URI}> .`);
  out.push(`@prefix dct: <${DCT_URI}> .`);
  out.push(`@prefix ont: <${ONT_URI}> .`);
  out.push(`@prefix schema: <${SCHEMA_URI}> .`);
  out.push(`@prefix xsd: <${XSD_URI}> .`);
  out.push("");

  let written = 0;
  let skipped = 0;
  const skipSamples = [];

  function recordSkip(reason) {
    skipped++;
    if (skipSamples.length < 25) skipSamples.push(reason);
  }

  for (const row of rows) {
    const filename = String(row.filename ?? "");
    if (!filename) {
      recordSkip("missing_filename");
      continue;
    }

    const gwpRaw = gwpA1toA3(row);
    if (!Number.isFinite(gwpRaw) || gwpRaw < 0) {
      recordSkip(`no_gwp:${filename.slice(0, 60)}`);
      continue;
    }

    const inf = inferDeclaredUnitAndScale(row.declared_unit, filename);
    if (!inf) {
      recordSkip(`no_declared_unit:${filename.slice(0, 60)}`);
      continue;
    }

    const gwp = gwpRaw * inf.gwpScale;
    const gwpStr = formatGwpDecimal(gwp);
    if (!gwpStr) {
      recordSkip(`gwp_scale:${filename.slice(0, 60)}`);
      continue;
    }

    const bepdId = bepdIdFromFilename(filename);
    const slugKey = bepdId ? `bepd-${bepdId}` : filename;
    const slug = bepdId
      ? `entry-bepd-${bepdId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
      : `entry-${slugFromKey(filename)}`;

    const name = displayName(row);
    const matchParts = [name, filename.replace(/\.pdf$/i, "")];
    if (bepdId) matchParts.push(bepdId);
    const epdName = String(row.epd_name ?? "").trim();
    if (epdName && epdName !== "." && !isMostlyDots(epdName)) {
      matchParts.push(epdName);
    }
    if (manufacturerOk(row.manufacturer)) {
      matchParts.push(String(row.manufacturer).trim());
    }
    const matchText = matchParts.filter(Boolean).join(" | ");

    out.push(`bsrc:${slug} a ont:EPD ;`);
    out.push(`  schema:name ${ttlLit(name)} ;`);
    out.push(`  ont:declaredUnit ${ttlLit(inf.declaredUnit)} ;`);
    out.push(`  ont:gwpPerUnit "${gwpStr}"^^xsd:decimal ;`);
    out.push(`  ont:matchText ${ttlLit(matchText)} ;`);
    out.push(`  ont:sourceDataset "b-epd-be" ;`);
    out.push(`  ont:sourceVersion ${ttlLit(SOURCE_VERSION)} ;`);
    if (manufacturerOk(row.manufacturer)) {
      out.push(`  ont:producer ${ttlLit(String(row.manufacturer).trim())} ;`);
    }
    const issueDate = isoDateOnly(row.issue_date);
    if (issueDate) {
      out.push(`  ont:issueDate ${ttlLit(issueDate)} ;`);
    }
    const validUntil = isoDateOnly(row.valid_until);
    if (validUntil) {
      out.push(`  ont:validUntil ${ttlLit(validUntil)} ;`);
    }
    if (bepdId) {
      out.push(`  dct:identifier ${ttlLit(bepdId)} ;`);
    }
    out.push(
      `  ont:importedAt "${new Date().toISOString()}"^^xsd:dateTime ;`
    );
    out.push(
      `  ont:sourceFileName ${ttlLit(path.relative(path.join(process.cwd(), "data"), jsonPath).replace(/\\\\/g, "/"))} .`
    );
    out.push("");

    written++;
  }

  const outDir = path.join(process.cwd(), "data/sources/B-EPD");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "b-epd-2026-03-28.ttl");
  fs.writeFileSync(outFile, out.join("\n"), "utf-8");

  const report = {
    source: "b-epd-be",
    inputFile: path.relative(process.cwd(), jsonPath),
    outputTtl: path.relative(process.cwd(), outFile),
    rowCount: written,
    skippedRows: skipped,
    totalInputRows: rows.length,
    skipSamples,
    gwpPolicy: "GWP_total_A1-A3 or sum A1+A2+A3; declared unit from text/heuristics",
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "b-epd-2026-03-28.report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
