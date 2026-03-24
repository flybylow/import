# Using the **full trace table** for dictionary work

The Phase 3 **full trace table** (Calculate) is built from `GET /api/kb/status`: each row is one **material that already has `ont:hasEPD`** in the KB, plus quantity rollups from elements.

## What each column is good for

| Column | Use for dictionary / QA |
|--------|-------------------------|
| **Material** | Raw IFC / layer names → add **patterns** in `material-dictionary.json` or **tokens** in `material-norm.ts` when the same name repeats. |
| **EPD** (slug + label) | **Sanity-check** product family (e.g. EPS vs glass wool). If many rows share one EPD, the pattern may be **broad** (good for coverage, bad for precision). |
| **LCA in KB** | **No** = linked EPD but **no `ont:gwpPerUnit`** (dictionary-only or missing source row). Prioritise **source** or **manual** for high-mass / high-cost rows first. |
| **Elements** | **Reach**: how many elements use this material — good **priority** for fixing wrong families. |
| **Qty records** | How many quantity rows were aggregated — **density** of BIM data. |
| **Qty (compact)** | **Declared-unit hints**: `NetVolume`/`GrossVolume` (m³) vs `NetArea`/`GrossArea` (m²) vs `Length` (m) — when you add EPDs manually, align **declared unit** and conversion. |
| **Details** | Expand to see **per-quantity-type** breakdown — useful if one material mixes area vs volume. |

## What the table does *not* tell you

- It only lists materials **with** an EPD link. **Unmatched** materials appear on **Phase 2 `/kb`** (unmatched list), not in this table.
- It does **not** prove environmental **correctness** — only that a link + (optional) LCA literals exist.

## Practical workflow

1. **Group by EPD** in the UI — spot one EPD carrying unrelated names (over-broad pattern).
2. **Sort by Elements** (or export mentally) — fix **high-reach** wrong families first.
3. **LCA in KB = No** — either improve **source match** for that slug or **manual EPD** on `/kb`.
4. Encode repeated **Material** strings into **`routing-…` dictionary** + **`material-norm.ts`** (see `docs/epd-coverage-tuning.md`).

## Batch ideas from this project’s material list

Examples mined from `data/example-enriched.ttl` names: **dekvloer / cementdekvloer** → screed; **keramisch / vloertegel** → ceramic tile; **natuursteen** → natural stone; **gips\*** → gypsum; **glas hekwerk** → glass; **metalstud / stripstaal** → steel; **cellenbeton** must win over generic **brick** (AAC placed **before** masonry in the dictionary; **metselwerk** alone removed from brick patterns to avoid stealing AAC).

Dictionary version **`routing-2026-03-27`** reflects many of these.
