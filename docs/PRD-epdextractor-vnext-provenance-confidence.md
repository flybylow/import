## PRD — EPDextractor vNext (Nested JSON + Provenance + Confidence)

**Version**: 1.0  
**Schema version name**: `epdextractor.bepd.v1`  
**Date**: 2026-04-01  
**Status**: Draft  
**Scope**: Belgian B-EPD PDFs (EN/FR/NL), EN 15804+A2 LCA tables + passport-relevant metadata + scenarios (Level 2).  
**Out of scope for v1**: technical/engineering properties (planned v2).

---

### Sample “golden” JSON snippet (single EPD object)

This snippet demonstrates the required nested shape, per-field provenance, and confidence scoring. Values are illustrative.

```json
{
  "schema_version": "epdextractor.bepd.v1",
  "status": "OK",
  "ids": {
    "source_filename": {
      "raw": "B-EPD_024.0250.001_01.00.00 Reinforced concrete_Cordeel_EN - signed.pdf",
      "normalized": "B-EPD_024.0250.001_01.00.00 Reinforced concrete_Cordeel_EN - signed.pdf",
      "unit": null,
      "confidence": 100,
      "provenance": { "page": 0, "ref": "filesystem.filename" },
      "warnings": []
    },
    "source_file_hash_sha256": {
      "raw": "…",
      "normalized": "…",
      "unit": null,
      "confidence": 100,
      "provenance": { "page": 0, "ref": "filesystem.sha256" },
      "warnings": []
    },
    "epd_number": {
      "raw": "B-EPD nº 024.0250.001-01.00.00-EN",
      "normalized": "024.0250.001-01.00.00-EN",
      "unit": null,
      "confidence": 90,
      "provenance": { "page": 1, "ref": "cover.epd_number" },
      "warnings": []
    },
    "epd_number_normalized": {
      "raw": "024.0250.001-01.00.00-EN",
      "normalized": "024-0250-001-01-00-00-EN",
      "unit": null,
      "confidence": 95,
      "provenance": { "page": 1, "ref": "normalize.epd_number" },
      "warnings": []
    }
  },
  "document": {
    "language": {
      "raw": "EN",
      "normalized": "EN",
      "unit": null,
      "confidence": 80,
      "provenance": { "page": 0, "ref": "filename.language_suffix" },
      "warnings": []
    },
    "issue_date": {
      "raw": "2025-04-30",
      "normalized": "2025-04-30",
      "unit": null,
      "confidence": 90,
      "provenance": { "page": 1, "ref": "cover.issue_date" },
      "warnings": []
    },
    "valid_until": {
      "raw": "VALABLE JUSQU’AU 30.04.2030",
      "normalized": "2030-04-30",
      "unit": null,
      "confidence": 90,
      "provenance": { "page": 1, "ref": "cover.valid_until" },
      "warnings": []
    },
    "standard": {
      "raw": "EN 15804+A2",
      "normalized": "EN 15804+A2",
      "unit": null,
      "confidence": 95,
      "provenance": { "page": 1, "ref": "cover.standard" },
      "warnings": []
    },
    "pcr_reference": {
      "raw": "B-EPD PCR (version 18.10.2022)",
      "normalized": "B-EPD PCR|18.10.2022",
      "unit": null,
      "confidence": 80,
      "provenance": { "page": 1, "ref": "cover.pcr_reference" },
      "warnings": []
    }
  },
  "product": {
    "epd_owner": {
      "raw": "PIERRES ET MARBRES DE WALLONIE",
      "normalized": "PIERRES ET MARBRES DE WALLONIE",
      "unit": null,
      "confidence": 85,
      "provenance": { "page": 1, "ref": "cover.declarant_line" },
      "warnings": []
    },
    "producer": {
      "raw": null,
      "normalized": null,
      "unit": null,
      "confidence": 0,
      "provenance": { "page": 0, "ref": "not_present" },
      "warnings": []
    }
  },
  "functional": {
    "declared_unit": {
      "quantity": {
        "raw": "1",
        "normalized": 1,
        "unit": null,
        "confidence": 95,
        "provenance": { "page": 1, "ref": "cover.declared_unit_quantity" },
        "warnings": []
      },
      "unit": {
        "raw": "m²",
        "normalized": "m2",
        "unit": null,
        "confidence": 95,
        "provenance": { "page": 1, "ref": "cover.declared_unit" },
        "warnings": []
      },
      "text": {
        "raw": "1 m² de surface de sol extérieur couvert par des dalles…",
        "normalized": "1 m² de surface de sol extérieur couvert par des dalles…",
        "unit": null,
        "confidence": 80,
        "provenance": { "page": 1, "ref": "cover.declared_unit_text" },
        "warnings": []
      }
    }
  },
  "lca": {
    "modules_declared": {
      "raw": "A1 A2 A3 A4 A5 C1 C2 C3 C4 D",
      "normalized": ["A1", "A2", "A3", "A4", "A5", "C1", "C2", "C3", "C4", "D"],
      "unit": null,
      "confidence": 85,
      "provenance": { "page": 6, "ref": "lca.table_header.modules" },
      "warnings": []
    },
    "tables_provenance": [
      { "table": "impact_assessment", "page": 6, "ref": "lca.table1", "confidence": 90, "warnings": [] }
    ],
    "results": {
      "GWP_total": {
        "A1_A3": {
          "raw": "660",
          "normalized": 660,
          "unit": "kgCO2e",
          "confidence": 85,
          "provenance": { "page": 6, "ref": "lca.table1" },
          "warnings": []
        }
      }
    }
  },
  "scenarios": {
    "packaging": {
      "items": [
        {
          "material": {
            "raw": "cardboard",
            "normalized": "cardboard",
            "unit": null,
            "confidence": 70,
            "provenance": { "page": 3, "ref": "scenario.packaging" },
            "warnings": []
          },
          "mass": {
            "raw": null,
            "normalized": null,
            "unit": "kg",
            "confidence": 0,
            "provenance": { "page": 0, "ref": "not_present" },
            "warnings": []
          },
          "per": {
            "raw": "per declared unit",
            "normalized": "declared_unit",
            "unit": null,
            "confidence": 60,
            "provenance": { "page": 3, "ref": "scenario.packaging" },
            "warnings": ["no_mass_provided"]
          }
        }
      ],
      "raw_text": {
        "raw": "Packaging: cardboard + film",
        "normalized": "Packaging: cardboard + film",
        "unit": null,
        "confidence": 70,
        "provenance": { "page": 3, "ref": "scenario.packaging" },
        "warnings": []
      }
    }
  }
}
```

---

## 1. Purpose

Extract **machine-readable, traceable** data from official Belgian B-EPD PDF files for downstream use in:
- material matching and catalog building
- LCA calculations
- digital product passports (DPP)
- BIM/3D visualization and filtering (e.g. “show elements with EPD expiring soon”, “compare module A4 assumptions”, etc.)

## 2. Goals

- **G1 — Traceability**: every extracted field has `raw`, `normalized`, `confidence`, and `provenance` (`page` + `ref`).
- **G2 — Stable IDs**: support update detection via official EPD number and a PDF hash.
- **G3 — LCA completeness**: extract all EN 15804+A2 indicator tables + modules declared.
- **G4 — Scenarios (v1)**: include Level 2 packaging/scenario structure (even when quantities are missing).
- **G5 — Robustness**: reject common PDF false matches (e.g. table-of-contents dot leaders) and never crash.

## 3. Non-goals (v1)

- OCR for scanned PDFs.
- Technical/engineering properties (fire class, lambda, compressive strength, etc.) — see **v2 backlog**.
- Automatic PDF downloads.
- UI “expired/overdue” logic (dates are extracted; UI can compute).

## 4. Input

- Folder path containing `.pdf` files (non-recursive).
- Optional: process a single PDF path.
- Language detection: filename suffix + fallback heuristics.

## 5. Output

### 5.1 Output files

Default v1 output:
- `output/epd_extract_<YYYY-MM-DD>.json` (one JSON array; one object per EPD)

Optional outputs:
- CSV/Excel may remain, but **JSON is source-of-truth**.

### 5.2 Output schema versioning

Every EPD object must include:
- `schema_version`: `"epdextractor.bepd.v1"`

The JSON file should also include a wrapper `meta` block:
- `generated_at`, `tool_version`, `input_folder`, `counts`, `warnings`.

## 6. ExtractedValue contract (required everywhere)

All extracted “leaf fields” must follow:

```json
{
  "raw": "string|null",
  "normalized": "typed|null",
  "unit": "enum|string|null",
  "confidence": 0,
  "provenance": {
    "page": 1,
    "ref": "string"
  },
  "warnings": ["string", "..."]
}
```

Rules:
- `confidence` is integer **0–100**.
- `provenance.page` is 1-based page number. (Use `0` for filesystem-derived values.)
- `provenance.ref` is a stable key naming the extraction rule/template.
- Never invent values: if absent, `raw=null`, `normalized=null`, confidence `0`.

### 6.1 Confidence scoring rubric

- **90–100**: explicit label match + strict parse validation (date/unit/enum).
- **70–89**: strong template heuristic (cover block position, known section headings).
- **40–69**: weak heuristic (keyword proximity).
- **0–39**: tentative; should be treated as “needs review”.

## 7. Stable IDs & update detection

Required ID fields:
- `ids.epd_number` (ExtractedValue; official number when present)
- `ids.epd_number_normalized` (ExtractedValue; canonical formatting)
- `ids.source_filename` (ExtractedValue)
- `ids.source_file_hash_sha256` (ExtractedValue; hash of PDF bytes)

Update detection rules:
- primary key: `ids.epd_number_normalized.normalized` when present.
- otherwise: deterministic surrogate (documented) + PDF hash.

## 8. Field catalog (v1)

### 8.1 Document / EPD metadata

- `document.title`
- `document.language` (enum: `EN|FR|NL|UNKNOWN`)
- `document.issue_date` (ISO `YYYY-MM-DD`)
- `document.valid_until` (ISO `YYYY-MM-DD`)
- `document.standard` (expected `EN 15804+A2`)
- `document.programme` (e.g. `B-EPD`)
- `document.program_operator`
- `document.pcr_reference` (string; include version/date when present)
- `document.verification.third_party_verifier.name`
- `document.verification.third_party_verifier.organization` (optional)
- `document.verification.lca_practitioner.name` (optional)
- `document.registration_url` (optional)

### 8.2 Product identity

Semantics:
- `product.epd_owner` = EPD owner / declarant (the “manufacturer” in user-facing terms)
- `product.producer` = optional separate entity only if explicitly distinct in the PDF

Fields:
- `product.epd_owner`
- `product.producer` (optional)
- `product.name` (optional if distinct from `document.title`)
- `product.category` (CPC/category if present)
- `product.geography.market_scope` (string + optional normalized ISO country code)
- `product.production_sites[]` (optional)

### 8.3 Functional / declared unit

- `functional.declared_unit.quantity` (number, usually 1)
- `functional.declared_unit.unit` (enum: `kg|t|m2|m3|piece|unknown`)
- `functional.declared_unit.text` (full phrase)
- `functional.functional_unit.text` (optional)
- `functional.reference_service_life_years` (number; optional)
- `functional.density_kg_per_m3` (number; optional; extract when explicitly stated)

### 8.4 System boundary and modules declared

- `lca.modules_declared` (enum array: `A1`, `A2`, `A3`, `A1_A3`, `A4`, `A5`, `B1..B7`, `C1..C4`, `D`)
- `lca.system_boundary.text` (optional)
- `lca.cut_off_rules.text` (optional)
- `lca.allocation.text` (optional)

### 8.5 LCA results (EN 15804+A2)

Nested storage:
- `lca.results.<indicator>.<module>` where each cell is an ExtractedValue with `unit` appropriate to the indicator.

Provenance policy:
- **table-level provenance** is required via `lca.tables_provenance[]`.
- per-cell provenance should point at the table ref (not per-cell coordinates).

Indicators:
- All mandatory EN 15804+A2 indicators as already implemented (impact assessment, resource use, waste/output flows).

### 8.5.1 Downstream calculation note (non-goal, but important contract)

This PRD specifies extraction, not BIM quantity takeoff. However, downstream carbon computation commonly requires:
- a usable BIM quantity (mass/volume/area/length), and
- compatible EPD units (declared unit + GWP), and sometimes
- density (for volume→mass conversion when GWP is per kg, or area×thickness×density cases).

If any required inputs are missing, downstream systems must treat results as **not computable** (do not coerce to “0” without an explicit warning).

### 8.6 Scenarios & packaging (Level 2)

#### Packaging (required when mentioned)

- `scenarios.packaging.raw_text`
- `scenarios.packaging.items[]` where each item includes:
  - `material` (enum/string)
  - `mass` (nullable number)
  - `per` (enum: `declared_unit|pack|pallet|unknown`)
  - optional `treatment` (enum: `recycle|incinerate|landfill|unknown`)

Rule:
- If no mass is present, still emit an item with `mass.normalized=null` and a warning `no_mass_provided`.

#### Transport (A4), installation (A5), end-of-life (C) (when present)

- `scenarios.transport_a4.legs[]` (mode + distance_km + notes)
- `scenarios.installation_a5.waste_rate_percent` (optional)
- `scenarios.installation_a5.notes`
- `scenarios.end_of_life_c.notes`
- Optional structured shares if explicit.

## 9. Robustness requirements

- Reject false positives from table-of-contents dot leaders (e.g. `fabricant .......... 19`).
- Prefer cover-page heuristics when labels are unreliable.
- If PDF is likely scanned (no text layer), output an entry with status `FAIL_SCANNED` + identifiers + warnings.
- Never crash the batch run.

## 10. Acceptance tests (fixture PDFs)

Required fixtures:
- `B-EPD 025.0262.004-01.00.00 Beton Agglo Carbstones Kimblok EN - signed.pdf`
- `B-EPD_024.0146.006-01.00.00_ Kingspan Unidek_ Aero PD_NL- signed.pdf`
- `B-EPD 026.0306.002 Proclima Tescon Vana EN - signed.pdf`
- `B-EPD_23.0145.001_01.00.01 Pierres  Marbres FR- signed.pdf`
- `B-EPD_024.0250.001_01.00.00 Reinforced concrete_Cordeel_EN - signed.pdf`

Must-pass criteria:
- Each fixture produces an object with `schema_version`, `ids.source_filename`, `ids.source_file_hash_sha256`.
- `product.epd_owner` must not be table-of-contents dot junk.
- Dates normalize to ISO when present.
- `functional.declared_unit.unit` uses strict enums.
- `lca.modules_declared` is non-empty and consistent with parsed table headers.
- LCA results stored nested + `lca.tables_provenance[]` includes page+ref.
- Packaging emits items even when mass is missing (captures “cardboard + film”).

## 11. v2 backlog (technical/engineering properties)

Not in v1; add later under a `technical` top-level block:
- fire reaction class (Euroclass)
- thermal conductivity (lambda)
- compressive strengthx
- density
- acoustic ratings
- composition and recycled content

