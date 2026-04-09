# Material Matcher Architecture

## Overview

The material matcher aligns IFC material references with Tabulas' knowledge base (KB) categories, enriching them with properties (fire rating, embodied carbon, supplier).

**Input:** IFC file with elements and material assignments (e.g., `bim:element-1000000 ont:madeOf bim:material-54625`)

**Output:** Elements linked to KB categories (e.g., `bim:archcat-timber`) with enriched properties ready for timeline locking.

---

## Pipeline

```
IFC material name (raw string)
       ↓
[Needle Matching]
  - Convert slug to ranked candidate strings
  - Handle dimension expansion, case normalization
       ↓
[Token Fallback]
  - Split on underscore, discard tiny tokens
  - Require every significant token in material name
       ↓
[KB Index Lookup]
  - Match to canonical epdSlug (e.g., "timber")
       ↓
[Category Resolution]
  - Map slug to ArchitectSpecCategory IRI (e.g., bim:archcat-timber)
       ↓
[Validation]
  - Ensure category has fire rating, embodied carbon, supplier
       ↓
[Timeline Lock]
  - Immutable matching recorded, ready for downstream actors
```

---

## Three Matching Layers

### Layer 1: String Normalization (TypeScript)

**Function:** `materialSlugMatchNeedles(slug)`

Converts raw material slug into ranked search candidates:
- Longest/most-specific first (e.g., "60100x160" before "100x160")
- Handles dimension formats (`_60100x160` ↔ `_60/100x160`)
- Strips `ifc_` prefix, converts underscores to spaces
- All lowercase, minimum 3 characters

**Example:**
- Input: `ifc_vebo_raamdorpel_rd_60100x160`
- Needles: `["vebo raamdorpel rd 60100x160", "vebo raamdorpel rd", "raamdorpel", ...]`

### Layer 2: Semantic Matching (Two-Tier)

**Function:** `passportMaterialLayerMatchesSlug(materialName, epdSlug, slugLower)`

**Tier 1 (Preferred):** Exact match on canonical KB `epdSlug`
- Example: English slug `timber` matches Dutch IFC label `loofhout` via KB mapping
- Uses knowledge base equivalences (currently hardcoded; candidate for OWL formalization)

**Tier 2 (Fallback):** Token-based matching on raw IFC `materialName`
- Splits slug on `_`, discards dimension-only tokens
- Requires every significant token to appear in material name
- Handles naming drift across BIM files and vendors

### Layer 3: Smart Defaults (Rule-Based)

**File:** `src/lib/bestek/ifc-type-material-defaults.ts`

Pre-fills suggestions before architect manually maps:

**Tier 1 - IFC Type Defaults:**
- `IfcWall` → `masonry_brick`
- `IfcDoor` → `timber`
- `IfcWindow` → `aluminium_window_frame`

**Tier 2 - Partition-Aware Rules:**
For types like `IfcCovering` with no single default, partition labels trigger regex rules:
- `"gipsplafond"` → `gypsum_plaster`
- `"dakisolatie"` → `insulation_generic`
- `"leien"` → `natural_stone`

First match wins. Reduces manual architect work.

---

## Validation (SHACL Shape)

Before locking material to timeline, validate:
```
✓ Category has canonical name
✓ Fire rating present (A1, B, C, etc.)
✓ Embodied carbon data (kg/m²)
✓ Supplier information
```

Ensures no incomplete enrichment reaches timeline events. Failed validations block handoff to contractor phase.

---

## Data Artifacts

| File | Role |
|------|------|
| `data/<id>-phase0-element-groups.json` | IFC types + partitions extracted from BIM |
| `data/<id>-bestek-material-matching.json` | Architect's IFC group → EPD slug mapping (immutable after write) |
| `data/<id>-bestek-bindings.json` | Full binding: material, brands, article#, quantity |

---

## Design Principles

1. **No database** — Append-only JSON files in `data/`. Schema is the source of truth.

2. **Canonical slug bias** — Prefer KB `epdSlug` over raw IFC text to handle language/naming drift.

3. **Immutable once written** — Architect matching file is not re-saved by later stages. Contractor binding and product coupling extend it separately.

4. **Progressive enrichment** — Phase 0 (extraction) → Phase 1 (architect match) → Phase 2 (contractor binding) → Phase 3 (timeline lock). Each phase adds, never overwrites.

5. **No timeline events from matching UI** — Matching is not an event itself. Events are emitted during ingest and KB build phases only.

---

## Future: OWL + SHACL Formalization

Not required for MVP, but valuable when:
- Multiple pilots with conflicting naming conventions
- Architects need auditable explanations ("Why did this match?")
- Rules become too complex for TypeScript maintenance

**Candidate formalizations:**

1. **Material equivalences** (OWL)
   ```turtle
   "gipsplafond" owl:equivalentTo "gypsum_plaster" .
   ```
   Moves partition rules from regex code to declarative triples.

2. **Transitive hierarchies** (OWL)
   ```turtle
   "gypsum_plaster" rdfs:subClassOf "thermal_insulation_generic" .
   ```
   Enables reasoning: "If material matches gypsum_plaster, it's-a insulation"

3. **Validation constraints** (SHACL)
   Formalize fire rating + carbon requirements as shapes queryable via Comunica.

When implemented, architect matching becomes queryable: "Find all materials equivalent to X and validate they have carbon data" → SPARQL over RDF graph, not TypeScript functions.

---

## Integration Points

| Where | How |
|-------|-----|
| `src/lib/phase4-passports.ts` | Uses `passportMaterialLayerMatchesSlug()` to highlight IFC elements matching a URL `?materialSlug=` param in 3D viewer |
| `src/lib/timeline/construction-buildup.ts` | Resolves `materialReference` slugs in timeline events to IFC elements (deep link: timeline → 3D) |
| Deliveries pipeline | Phase 0 groups → architect matching → contractor product coupling → bestek bindings |

---

## See Also

- `docs/data-flow-bim-materials-timeline-pid.md` — Overall pipeline
- `docs/LESSON-2026-03-23-kb-manual-matching.md` — Manual KB matching for unmatched materials
- `docs/BASE.md` — Notes on dictionary matching and slug suggestions
- `docs/bestek-material-template-nl.md` — Flemish/Dutch material-to-article mapping
