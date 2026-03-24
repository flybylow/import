# Debug 0 kgCO2e — one material at a time

Use this as a **single run** before changing `material-dictionary.json` or norms. Replace `<projectId>` with your Phase 1 id.

## 1. Pick **one** IFC material

- From Phase 3 → expanded **materials** table, copy **one** row: **IFC expressId** (number) and the **human label** (e.g. kalkzandsteen layer name).
- Or from the calculate result JSON: `ifcMaterialExpressId` on a `byMaterial` line with **0** kg.

**Write it here (one line):**

- ExpressId: `________________`
- Label (as shown): `________________`

### Worked example: high-quantity pick (`example` project)

Use **`243`** as the default test case — **largest quantity footprint** in `data/example-materials-extract.json`:

| Field | Value |
|--------|--------|
| **IFC expressId** | `243` |
| **Label** | `03 Metselwerk - kalkzandsteen C` |
| **EPD slug** | `kalkzandsteen` |
| **Usage** | 92 elements, **828** quantity records |

From `data/example-calc-latest.json` (same project), the `byMaterial` line for `mat-243` shows:

- `quantityKind`: `volume`, `quantityValue` ≈ **97.7** m³ (from `NetVolume` in `compactQuantities`)
- `declaredUnitFromKb`: **`kg`**, `gwpPerUnitFromKb`: **0.106**
- `densityKgPerM3FromKb`: **`null`**
- `calculationNote`: **`volume_need_density_for_per_kg_gwp`**
- `kgCO2e`: **0**

In `data/example-kb.ttl`, `bim:epd-kalkzandsteen` has `ont:gwpPerUnit` and `ont:declaredUnit "kg"` but **no `ont:density`** on that EPD node — so Calculate cannot convert **volume → mass → kgCO2e** for per-kg GWP.

**Single next step to try:** hydrate or attach **`ont:density`** for `bim:epd-kalkzandsteen` from the KBOB row (when the source provides it), **or** switch this EPD to a declared unit that matches volume (e.g. per m³) if the dataset supports it — **one change**, then rebuild KB and re-run Calculate for material `243` only.

## 2. Confirm it exists in the KB graph

File: `data/<projectId>-kb.ttl`

Search for the material node and its EPD link:

```bash
rg "bim:material-<EXPRESS_ID>|bim:epd-" "data/<projectId>-kb.ttl" | head -40
```

Check:

- `bim:material-<EXPRESS_ID>` has `ont:hasEPD` → some `bim:epd-<slug>`.
- Note **`epd-<slug>`** — you need that slug in step 3.

## 3. Inspect the EPD node (LCA literals)

Still in the same TTL, find the block for `bim:epd-<slug>` (same slug as step 2).

Confirm **all** of:

| Predicate (Turtle) | Why it matters |
|--------------------|----------------|
| `ont:gwpPerUnit` | If missing → no factor to apply. |
| `ont:declaredUnit` | Must match how quantity is interpreted (per kg vs per m³). |
| `ont:density` | Needed when GWP is per kg but quantity is **volume**. |
| `ont:epdDataProvenance` | If `dictionary-no-lca-data` / `dictionary-placeholder` → Phase 3 may block or treat as non-LCA. |

If GWP is missing but the EPD “should” exist in KBOB/ICE, the gap is **translate/hydration**, not Calculate.

## 4. Inspect one calculate line

File: `data/<projectId>-calc-latest.json`

Find the `byMaterial` object where `ifcMaterialExpressId` matches (or `materialLabel` contains that id).

Read:

- `kgCO2e`
- `quantityKind` / `quantityValue` (from the pipeline)
- `calculationNote` (if present — **this is the machine reason for 0**)
- `gwpPerUnitFromKb`, `declaredUnitFromKb`, `densityKgPerM3FromKb`

**Typical meanings of `calculationNote`:**

- `volume_need_density_for_per_kg_gwp` → need density on EPD or per-m³ GWP.
- `missing_gwp_in_kb` → EPD node has no usable `ont:gwpPerUnit` in KB.
- `cannot_map_quantity_to_gwp` → quantity kind doesn’t match declared unit rules.

## 5. Decide the **one** next change

| Symptom | Likely fix (one sprint item) |
|--------|------------------------------|
| Wrong/missing EPD link on material | `material-dictionary.json` route + rebuild KB, or manual override in `/kb`. |
| EPD linked but no GWP in TTL | `layer2-translate` / source hydration; check KBOB/ICE TTL for that slug. |
| GWP present but quantity 0 or kind `none` | Enriched graph / `compactQuantities` — Phase 1/2 quantities. |
| Volume + per-kg GWP, no density | EPD dataset or add density in graph if your policy allows. |

## 6. Re-test

1. Rebuild KB (Phase 2) if dictionary/translate changed.  
2. Run Calculate again for the **same** selection.  
3. Re-open `calc-latest.json` for **that expressId** only.

---

**Stop after one material** — if the pattern repeats (e.g. five kalkzandsteen lines share one EPD slug), fix the **route + one EPD**, then batch the same change for siblings.

---

## Batch check (`example` project, `example-calc-latest.json`)

For a **300-row** `byMaterial` selection, `calculationNote` aggregates as:

| Count | `calculationNote` | Meaning |
|------:|-------------------|--------|
| 152 | `volume_need_density_for_per_kg_gwp` | Volume qty, GWP per **kg**, **`ont:density` missing** on EPD → 0 kg. Same fix class as material **243**. |
| 91 | *(empty / success)* | Non-zero kg (or zero for other reasons); **no** gap note — e.g. concrete with **density** on EPD. |
| 51 | `assumed_per_kg_gwp_via_density` | **Success**: volume × density × per-kg GWP; note marks the assumption path. |
| 4 | `quantity_area_unsupported_for_per_kg` | **Area** (m²) in trace, GWP per **kg** only — no area→mass rule in calculator yet. Example: **32780** (Glaswol 115mm), `NetArea`/`GrossArea` only. |
| 1 | `quantity_length_unsupported_for_per_kg` | **Length** wins in `parsePrimaryQuantity` but per-kg GWP has no length rule. Example: **73081** (steel), compact qty `Width`/`Height` only. |
| 1 | `cannot_map_quantity_to_gwp` | Edge case: **87624** aluminium — EPD is **per m²** (`declaredUnit`) but **area quantity is 0** in compact string → nothing to multiply. |

So the **density** story (152 rows) is the dominant zero cluster; **area** (4) and **length** (1) are **different** follow-ups (calculator / quantity priority, not KBOB lookup).

### Quick references (expressIds)

| ExpressId | Pattern | One-line read |
|-----------|---------|----------------|
| **482** | Works | Volume + `densityKgPerM3FromKb` **2252.8** → non-zero kg. |
| **243** | Density gap | Volume + per-kg GWP, **density `null`** → 0 kg. |
| **32780** | Area vs per-kg | `quantity_area_unsupported_for_per_kg` — needs m² pathway or Mass/Volume in IFC. |
| **73081** | Length vs per-kg | `quantity_length_unsupported_for_per_kg` — needs Mass or sheet rules. |
| **87624** | Bad/zero qty | `cannot_map` — check enriched quantities for that element (areas are 0). |
