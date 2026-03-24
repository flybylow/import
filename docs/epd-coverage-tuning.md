# EPD coverage (Phase 2) — how to improve it

## Quick check

Run **one** of these (nothing after the project id — no pasted comments):

```bash
npm run report:epd
```

```bash
npm run report:epd -- example
```

The second argument must match a real file: `data/<projectId>-enriched.ttl` (e.g. `example`).

Do **not** paste documentation text after the command (words like `exists`, `explicit`, `when` were mistaken for a project id in older versions). Use a **newline** before `#` comments in shell.

Reads `data/<projectId>-enriched.ttl`, runs the same translate as **Build KB**, writes a temp KB only, prints JSON: `materialsMatched`, `materialsTotal`, `unmatched`.

## What changes the numbers

1. **`src/lib/material-norm.ts`** — Normalizes IFC `schema:name` + `ont:layerSetName` the same way for **dictionary** and **source** scoring. Dutch/Belgian layer labels are mapped toward English tokens that appear in ICE/KBOB `ont:matchText` (e.g. insulation, brick, timber frame).

2. **`src/data/material-dictionary.json`** — Routing patterns (`entries`); version string in `version`. Add patterns for recurring IFC strings; keep **longer/specific entries before generic ones** where order matters.

3. **`src/lib/source-match.ts`** — `MIN_SOURCE_SCORE` is a floor on **raw overlap** (not LCA). Lower = more links, higher risk of weak matches.

4. **`config.json`** — Source order (KBOB vs ICE) affects which **first** source wins when both score above the floor.

5. **Re-run** — **Build KB** on `/kb` after changing the above.

## When half the model is still unmatched

- IFC **material names** are generic (`Material 1`) or **not** in any snapshot — add **manual** EPD on `/kb` or extend sources (see `kg-expansion-sources-benelux-eu.md`).
