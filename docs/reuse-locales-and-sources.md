# Reuse across languages / markets

## What is **generic** (reusable as-is)

- **Pipeline shape**: IFC → enrich → **KB** (`layer2-translate`, `ont:hasEPD`, calculate reading GWP from TTL).
- **Mechanics**: `rdflib`, **source order** in `config.json`, **overlap scoring** in `source-match.ts`, **dictionary-first then sources** matching order.
- **Data contract**: versioned **Turtle snapshots** under `data/sources/`, importers, provenance fields.

None of that is tied to one human language — it is tied to **how you name materials in IFC** and **what strings appear in your EPD sources**.

## What is **project-specific** today (custom)

- **`src/data/material-dictionary.json`** — patterns are **hand-curated** for **this** model mix (NL/BE-style layer names, product jargon). Another country’s IFC will use **different** strings; patterns must be **extended or forked**, not assumed universal.
- **`src/lib/material-norm.ts`** — token replacements (`isolatie` → `insulation`, `beton` → `concrete`, …) are **locale helpers** for overlap with **ICE/KBOB** `matchText`. For **French-only** or **German-only** IFC, add **parallel** rules (or a small `locale: "nl-be"` table later).
- **Sources**: **KBOB** (German/French product names) and **ICE Educational** (English) are **geography + programme** choices. A **DE** building might weight ÖKOBAUDAT; **NL** might add **NMD** under licence — same code pattern, **different** TTL + legal rules.

## How to “reuse in other languages”

1. **Keep one codebase** — add **more patterns** and **more `norm()` rules** for the new locale, or maintain **`material-dictionary.fr.json`** (etc.) and load by `config` / env (not implemented yet; today it is a single JSON file).
2. **Do not rely on automatic translation** — matchers use **substring overlap**, not MT; you need **either** IFC names in a language your **sources** already describe **or** explicit mapping.
3. **Reuse ICE/KBOB** wherever product names **overlap** English/German; for **pure local** names, add **dictionary** lines or **national** source snapshots.
4. **Per-project** BIM naming conventions (merk A/B, `IFC_*` prefixes) are **always** partly custom — expect **pattern** updates per client or template.

## Summary

| Layer | Reusable? |
|-------|-----------|
| Engine (KB, APIs, calculate) | **Yes** |
| Source snapshots + importers | **Yes**, if licence allows |
| Dictionary + `material-norm` | **Concept** reusable; **content** is **locale + project** specific |
| Same numbers everywhere | **No** — must re-validate EPD fit per region and IFC naming |
