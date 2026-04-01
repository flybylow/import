# EPDextractor → Tabulas TTL export (MVP spec)

This document specifies the **minimum** TTL export format that `EPDextractor` should produce so **bimimport** can consume B‑EPD data as a standard source snapshot (same as KBOB/ICE).

Goal: keep **PDF → JSON → TTL semantics in EPDextractor**, while **bimimport only consumes TTL snapshots** + BIM quantities.

---

## Summary (what we want)

### EPDextractor adds an optional export

For each extractor run, emit:

- **Turtle snapshot**: `b-epd-<YYYY-MM-DD>-<run_id>.ttl`
- **Report JSON**: `b-epd-<YYYY-MM-DD>-<run_id>.report.json`

The TTL must contain `ont:EPD` entities with the same minimal predicates that `bimimport` already uses for matching + calculation.

### bimimport remains unchanged (MVP)

Manual operator workflow:

1. Copy the generated `.ttl` + `.report.json` into `bimimport/data/sources/B-EPD/`
2. Update `bimimport/config.json` to point `"b-epd-be"` to the new TTL path
3. Rebuild the KB on `/kb` (Phase 2 — Link)

---

## Why this exists (context)

`bimimport` does **not** consume EPDextractor’s nested JSON index (`epd_index_*.json`) directly.
It consumes **versioned TTL snapshots** under `data/sources/**` (see `docs/sources-contract.md`).

Existing reference implementation in this repo:
- `scripts/import-b-epd.js` converts a legacy B‑EPD extracted JSON array into TTL using specific conventions.

This spec captures those conventions so the conversion can move upstream into EPDextractor.

---

## Contract: output file layout

### Where the operator will put files (bimimport)

Place the produced files in:

```
bimimport/
  data/
    sources/
      B-EPD/
        b-epd-<YYYY-MM-DD>-<run_id>.ttl
        b-epd-<YYYY-MM-DD>-<run_id>.report.json
```

Then update `config.json` to point at the new TTL:

```json
{
  "id": "b-epd-be",
  "type": "b-epd-be",
  "ttlPath": "data/sources/B-EPD/b-epd-<YYYY-MM-DD>-<run_id>.ttl",
  "enabled": true
}
```

---

## Contract: TTL graph (minimum required triples)

### Prefixes (required)

EPDextractor should emit the following prefixes (exact URIs matter):

- `@prefix bsrc: <https://tabulas.eu/sources/b-epd-be#> .`
- `@prefix ont: <https://tabulas.eu/ontology/> .`
- `@prefix schema: <http://schema.org/> .`
- `@prefix dct: <http://purl.org/dc/terms/> .`
- `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`

### One subject per EPD

Each exported EPD must be:

- Subject IRI: `https://tabulas.eu/sources/b-epd-be#entry-<stable-id>`
- RDF type: `a ont:EPD`

### Required predicates (MVP)

Each `ont:EPD` must include:

- `schema:name` (string)
- `ont:declaredUnit` (string; see declared unit rules below)
- `ont:gwpPerUnit` (`xsd:decimal`) — **kg CO₂e per declared unit** (A1–A3 cradle‑to‑gate)
- `ont:matchText` (string) — pipe-separated matching tokens
- `ont:sourceDataset "b-epd-be"` (string)
- `ont:sourceVersion "<string>"` (string) — dataset/version label (run date is acceptable for MVP)
- `ont:importedAt "<ISO datetime>"^^xsd:dateTime`
- `ont:sourceFileName "<string>"` (string) — provenance pointer (see provenance below)

### Recommended predicates (high value, low cost)

When available with reasonable confidence:

- `dct:identifier` (string) — normalized EPD number (programme registration ID)
- `ont:producer` (string) — EPD owner/declarant (avoid boilerplate/junk)
- `ont:issueDate "YYYY-MM-DD"` (string)
- `ont:validUntil "YYYY-MM-DD"` (string)
- `ont:density "<decimal>"^^xsd:decimal` (kg/m³) — enables common conversions downstream

### Minimal example block

```ttl
@prefix bsrc: <https://tabulas.eu/sources/b-epd-be#> .
@prefix ont: <https://tabulas.eu/ontology/> .
@prefix schema: <http://schema.org/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

bsrc:entry-bepd-024-0250-001-01-00-00 a ont:EPD ;
  schema:name "Reinforced concrete (Cordeel)" ;
  ont:declaredUnit "1 m3" ;
  ont:gwpPerUnit "123.456"^^xsd:decimal ;
  ont:matchText "Reinforced concrete | Cordeel | 024.0250.001-01.00.00 | ..." ;
  ont:sourceDataset "b-epd-be" ;
  ont:sourceVersion "2026-04-01" ;
  dct:identifier "024-0250-001-01-00-00" ;
  ont:producer "CORDEEL" ;
  ont:issueDate "2025-04-30" ;
  ont:validUntil "2030-04-30" ;
  ont:importedAt "2026-04-01T17:55:36.000Z"^^xsd:dateTime ;
  ont:sourceFileName "B-EPD_024.0250.001_01.00.00 Reinforced concrete_Cordeel_EN - signed.pdf" .
```

---

## Declared unit rules (must match bimimport calc)

`bimimport` uses simple declared-unit heuristics in `src/lib/phase3-carbon-calc.ts`.
For MVP, keep these exact strings (matching the existing importer):

- **Mass**: `ont:declaredUnit "kg"`
- **Area**: `ont:declaredUnit "1 m2"`
- **Volume**: `ont:declaredUnit "1 m3"`

Notes:
- If the PDF uses `m²`/`m³`, normalize to `m2`/`m3` only in the JSON; in TTL keep the exact strings above.
- If the PDF expresses **per tonne**, export must normalize to per‑kg (see next section).

---

## GWP policy (A1–A3 cradle‑to‑gate) and normalization

### Required: exported GWP is A1–A3

Export `ont:gwpPerUnit` as the cradle‑to‑gate total for `GWP_total`:

- Prefer combined **A1–A3** value if present.
- Else sum **A1 + A2 + A3** when all three are present and finite.

### Unit policy

- `ont:gwpPerUnit` is always **kg CO₂e per declared unit**.

### Tonne → kg normalization

If the declared unit is **tonne** (e.g. “1 t” / “per tonne”), export must convert:

- `ont:declaredUnit "kg"`
- `ont:gwpPerUnit = (gwp_per_tonne / 1000)`

Reason: `bimimport` expects per‑kg when the unit is `kg`.

### Skipping rules (MVP)

If the exporter cannot produce BOTH:
- a supported declared unit (`kg`, `1 m2`, `1 m3`), and
- a finite `ont:gwpPerUnit`,

then **skip writing that EPD to TTL** and count it as skipped in the report.

---

## Stable identifiers & subject IDs

`bimimport` mainly uses:
- `dct:identifier` (registration id) for display and debugging
- `ont:matchText` for matching overlap

For stable subject IDs:

- Preferred: derive `<stable-id>` from `epd_number_normalized` (when present).
- Fallback: use a deterministic surrogate based on PDF hash (sha256 prefix) plus a safe filename slug.

Good pattern (matches existing extractor index style):

- `epd_id = <epd_number_normalized>__<sha256prefix>`
- `entry-<epd_id>` as the fragment, sanitized

---

## Provenance (MVP)

Per-field provenance is kept in the nested JSON (EPDextractor PRD).
For TTL (MVP), we only require:

- `ont:sourceFileName` — the original PDF filename (or relative path within the extractor input folder)

Optionally add (if available already in extractor outputs):

- `ont:sourceFileHashSha256 "<hex>"` (predicate name can be chosen; not currently used by bimimport)

Keep it simple: TTL is “consumable snapshot”, JSON remains the audit trail.

---

## Report JSON (`*.report.json`) contract

This is used by bimimport’s Sources UI (`/sources`) to display metadata.
Minimum fields (matches `docs/sources-contract.md`):

- `generatedAt` (ISO datetime)
- `inputFile` (string; index path or JSON path used)
- `outputTtl` (string; path to TTL file)
- `rowCount` (number of EPD subjects written)

Recommended additional fields:

- `totalInputEpds`
- `skippedRows`
- `skipSamples` (array of reasons)
- `gwpPolicy` (string)
- `source` (string; `"b-epd-be"`)

---

## Operator runbook (manual, MVP)

1. Run extractor with TTL export:
   - produces `b-epd-<date>-<run>.ttl` + `b-epd-<date>-<run>.report.json`
2. Copy both files into:
   - `bimimport/data/sources/B-EPD/`
3. Edit `bimimport/config.json`:
   - point `sources[0].ttlPath` (id `b-epd-be`) at the new TTL
4. Open `bimimport`:
   - `/sources` should show the new TTL path + report metadata
   - `/kb` rebuild the KB (Phase 2 — Link)
5. Verify:
   - passports show EPD metadata, and LCA-ready materials compute CO₂e when quantities exist

---

## References (existing code in bimimport)

- Current B‑EPD importer (legacy JSON → TTL): `scripts/import-b-epd.js`
- Sources contract + folder layout: `docs/sources-contract.md`
- Declared unit interpretation & carbon compute: `src/lib/phase3-carbon-calc.ts`
- Source matching: `src/lib/source-match.ts`

