# Dictionary + source hydration (Phase 2 translate)

The **material dictionary** (`src/data/material-dictionary.json`) is **routing-only**: patterns, labels, categories, and declared unit **strings**. It does **not** carry **GWP** or **density** — those must come from **KBOB/ICE** source TTL when a row matches, or stay **absent** if only the dictionary matched.

## Flow

1. **Preferred:** `pickFirstOrderedSourceMatch` scores IFC text against each source EPD’s `ont:matchText` / name. The **raw score** is stored on the material as **`ont:sourceMatchScore`** (real overlap statistic from `src/lib/source-match.ts`). **`ont:matchConfidence`** for source-backed rows is derived from that score (not an LCA number).
2. **EPD literals:** `copyEpdFromSourceToBim` copies **GWP/density/name** from the source graph when available.
3. **Dictionary-only path (no source above `MIN_SOURCE_SCORE`):** the material still gets `bim:epd-{slug}` with **name / declared unit / programme hint** only; **`ont:epdDataProvenance`** = `dictionary-no-lca-data` — **no** `ont:gwpPerUnit` in the graph until you add a source match or manual data.

4. **Optional `kbobUuid` on a dictionary entry** (same `epdSource: "kbob"`): if text overlap fails but the KBOB snapshot contains that UUID, Phase 2 still resolves the **Hunziker** (or other) row and copies LCA literals — same as a normal source hit. **`epdName`** should match the real KBOB `schema:name` when possible.

**Upgrade:** If that EPD was `dictionary-no-lca-data` and a later material gets a **source** hit for the same slug, triples are replaced with **source-import** data.

## Material `ont:source`

| Value | Meaning |
|-------|---------|
| `dictionary-routed` | Dictionary matched; EPD body from **source** TTL. |
| `dictionary-no-lca` | Dictionary matched; **no** qualifying source row — EPD has **no LCA numbers** in graph. |
| `{id}-source` | Direct source match (no dictionary), e.g. `kbob-source`. |

## EPD `ont:epdDataProvenance`

| Value | Meaning |
|-------|---------|
| `source-import` | Copied from KBOB/ICE. |
| `dictionary-no-lca-data` | Routing only; no GWP/density in TTL. |

Legacy graphs may still show `dictionary-placeholder` on old EPD nodes; new exports use the labels above.

## Phase A — calculation gate (no placeholder LCA)

`POST /api/calculate` **rejects** the whole request (**HTTP 422**) if any selected row points at an EPD that is:

- `ont:epdDataProvenance` ∈ `{ dictionary-no-lca-data, dictionary-placeholder }`, or  
- missing `ont:gwpPerUnit` (nothing to multiply by quantities).

Implementation: `calculationBlockedReason` in `src/lib/kb-read-epd.ts`. KB status (`/api/kb/status`) exposes **`lcaReady`** per EPD so Phase 3 UI only lists **calculable** rows with quantity + real GWP.

## `ont:sourceMatchScore`

Present when a **source** candidate was selected (dictionary+routed or pure source). This is the **raw matcher score** (text overlap), documented in `src/lib/source-match.ts`.
