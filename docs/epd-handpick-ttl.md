# Hand-picked programme EPDs (EPD Hub, Environdec, B-EPD, …)

Bulk imports today: **KBOB** + **ICE** (`npm run import:kbob` / `import:ice`). For **specific registrations** you care about (e.g. **EPD Hub `HUB-4855`**, a B-EPD row, Environdec product EPD), add them to a **small Turtle snapshot** and enable the **`epd-hub`** source in `config.json`.

## How it flows

1. **Author TTL** under `data/sources/epd-hub/` (one file or versioned `*-YYYY-MM-DD.ttl` — see [`sources-contract.md`](./sources-contract.md)).
2. **Point `config.json`** at the file with `"type": "epd-hub"` (see active [`config.json`](../config.json)).
3. **Order matters (strict priority):** `pickFirstOrderedSourceMatch` checks enabled sources **top-to-bottom** and takes the **first** source that has a candidate scoring ≥ `MIN_SOURCE_SCORE`. Put `epd-hub` higher in `config.json` if these hand-picks must win before bulk catalogues.
4. **Rebuild KB** (Phase 2 — Link). Matcher loads `ont:EPD` subjects from the TTL; **`ont:matchText`** (or `schema:name`) drives overlap with normalized IFC material strings (`material-norm.ts`).
5. **Phase 3** uses **`ont:gwpPerUnit`**, **`ont:declaredUnit`**, **`ont:density`** copied into `data/<projectId>-kb.ttl` — same as other sources.

## Required triple shape (minimal)

Same pattern as ICE/KBOB rows:

- Subject IRI: `https://tabulas.eu/sources/epdhub#entry-<stable-id>` (prefix `hubsrc:` in files).
- `a ont:EPD`
- `schema:name`
- `ont:gwpPerUnit` — **kg CO₂e per declared unit** as stored in the graph
- `ont:declaredUnit` — **must match** how `computeKgCO2e` interprets quantities (see below)
- `ont:matchText` — **pipe-separated** phrases / tokens that appear in IFC + normalisation (English + product + size + programme id helps)

Optional: `ont:density` (kg/m³) when GWP is per kg but IFC gives **volume**; `dct:identifier` for programme id (e.g. `HUB-4855`).

## Declared unit vs PDF (important)

The calculate API (`src/app/api/calculate/route.ts`) expects **per-kg GWP** when `ont:declaredUnit` is **`kg`** (or empty, with fallbacks). Many EPDs report **per tonne**.

Example: PDF says **234 kg CO₂e per 1 t** product (A1–A3). Store:

- `ont:declaredUnit "kg"`
- `ont:gwpPerUnit` = **234 / 1000 = 0.234** (kg CO₂e per kg product)

Put the PDF reference in `ont:sourceFileName` or a comment above the block in TTL.

## Example file

See `data/sources/epd-hub/epd-hub-handpick-2026-03-23.ttl` (`HUB-4855` portfolio brick, **0.234** kg/kg).

Resulting BIM slug: fragment `entry-hub-4855` → **`hub-4855`** → `bim:epd-hub-4855`.

## B-EPD / Environdec

There is **no separate importer** yet: **copy the published GWP + declared unit + product name** into the same TTL pattern, set `ont:matchText` from official **name + synonyms + geography**, and add `dct:identifier` with the registration id. Keep licence/ToS in your records (`kg-expansion-sources-benelux-eu.md`).

## Related

- [`sources-contract.md`](./sources-contract.md) — folders, `config.json`, reports  
- [`kg-dictionary-source-hydration.md`](./kg-dictionary-source-hydration.md) — dictionary routes + source hydration  
- [`kg-expansion-sources-benelux-eu.md`](./kg-expansion-sources-benelux-eu.md) — where to find official data  
