## EPDextractor traceability notes (2026-04-01)

This note summarizes the decisions made for the next iteration of B-EPD PDF extraction so downstream tooling (TTL import, KB build, product passports, and 3D visualization) can remain **traceable** and **auditable**.

### Key decisions

- **Nested JSON is required**: flat tables make it too hard to attach per-field provenance/confidence and to represent structured scenarios (packaging, transport legs, multiple sites, etc.).
- **Per-field provenance is required**: every extracted field must store:
  - **page number**
  - **stable provenance reference key** (e.g. `cover.valid_until`, `lca.table1`)
- **Per-field confidence is required**: store an integer **0–100** so downstream can:
  - show “trust level” in UI,
  - filter out low-confidence fields,
  - identify templates that need better extraction rules.
- **Raw + normalized values are both required**:
  - `raw` preserves what was actually observed in the PDF (for audit and diffing updates).
  - `normalized` enables stable matching and typed computations.
- **Stable IDs are required**:
  - Prefer official **EPD number** (`epd_number_normalized`) as the update identity.
  - Also store **PDF hash (sha256)** to detect changes even when the EPD number is missing/garbled.
- **Manufacturer semantics**:
  - `product.epd_owner` is the “manufacturer” in user-facing terms: the **EPD owner/declarant**.
  - Add optional `product.producer` only if the PDF explicitly distinguishes it.
- **LCA provenance granularity**:
  - Use **table-level** provenance for LCA results (page+ref per table), not per-cell provenance.
- **Scenarios (v1)**:
  - Packaging is required as **Level 2** structure: capture materials even when masses are missing (`mass=null`), plus raw text.
  - Transport/install/end-of-life scenarios are extracted when present, with strict enums for modes and unit normalization where possible.
- **Technical properties**:
  - Move to v2. Keep the schema ready to add a `technical` block later without breaking ingestion.

### Why nested JSON (practical rationale)

Nested structure avoids schema explosion. Example: a single field like “valid until” needs:
- raw text (sometimes localized phrasing),
- normalized ISO date,
- confidence score,
- provenance (page + extraction rule id),
- warnings.

Doing that for hundreds of LCA cells and multiple scenarios becomes unmanageable in flat CSV columns.

### “One big JSON file” vs “one JSON per EPD”

Current approach: one JSON array file is simplest for batch extraction and initial ingestion.
If performance or file size becomes a problem, we can later split to:
- `output/epds/<epd_number_normalized>.json` (one object per EPD)
- `output/index.json` (thin index + metadata)

Because the schema is nested and versioned, this refactor can be done without changing the per-EPD object shape.

### Next step

See the PRD: `docs/PRD-epdextractor-vnext-provenance-confidence.md`.

