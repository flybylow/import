# Bestek template — material-based structure (NL)

Flemish-style specification article layout: one block per material article, Dutch headings, measurement state as a line item.

---

## Template

```
================================================================================
ARTIKEL [number] — [MATERIAL CATEGORY in Dutch]
================================================================================

[article number] — [Location/Application in Dutch]

Materiaalbeschrijving:
[Material Dutch name] [dimension/quality] (of gelijkwaardig)

Uitvoering:
[Standard reference: DIN/NEN/EN number]
[Execution details: mortar type, joint thickness, finish type]

Opmetingsstaat:
Art. [number] | [Material Dutch name] | [quantity] [unit] | € [price/unit] | = € [total]

---

ARTIKEL [number] — [NEXT MATERIAL CATEGORY]

[repeat pattern above]
```

---

## Reference — typical units (Flemish bestek)

| NL category (concept) | Application | Unit |
|----------------------|-------------|------|
| Metselwerk | Walls, facades | m² |
| Beton | Beams, slabs, floors | m³ or m² (IFC: beams/columns/slabs/stairs → m³; walls → m²) |
| Hout | Timber, roofs | m² (doors/windows → **stuks**) |
| Staal | Columns, railings, frames | kg or **stuks** (countable pieces → stuks) |
| Aluminium | Windows, frames | **stuks** or m² |
| Zinkwerk | Roofing, cladding | m² |
| Glas | Railings, glazing | m² (countable glazing → **stuks** where IFC = window) |
| Keramiek | Tiles, finishes | m² |
| Gips | Plasterboard, ceilings | m² |
| Mortel / screed | Flooring, joints | m² or m³ |
| Natuursteen | Facade, cladding | m² |
| Isolatie | Insulation layers | m² or m³ |
| Kunststof | Polymer sheets | m² |

Autofill implements this via **`src/lib/bestek/bestek-autofill-units.ts`** (dictionary **category** + **IFC type** + slug overrides, e.g. `zinc_work` → m²).

---

## Mapping to BIMimport (today)

| Template field | Where it lives / notes |
|----------------|-------------------------|
| **ARTIKEL number** / **Art. [number]** | Bestek bindings: `article_number` (per IFC-type group). Category numbering may be manual or derived later. |
| **Unit** (`[quantity] [unit]`) | Bestek bindings: `article_unit` (e.g. m², m³, st, kg) — architect-set order/measurement unit for the opmetingsstaat line. |
| **Quantity** | Bestek bindings: `article_quantity` (string). **Autofill** (Deliveries → Bestek, next to “shown · total”) suggests values from IFC group `element_count` and dictionary `declaredUnit` heuristics. |
| **MATERIAL CATEGORY (NL)** | `material-dictionary.json` → `category` (often English today); NL labels can align with **`material-label-translations.json`** / future category translations. |
| **Location/Application** | Not a first-class binding yet; could use notes, timeline, or future `application` field. |
| **Materiaalbeschrijving** | **`architect_name`** + optional **`approved_brands`**; Dutch product name from **`material-label-translations.json`** (`nl` by `epdSlug` + dictionary `standardName`) + free-text dimensions/quality. |
| **(of gelijkwaardig)** | Bestek **`or_equivalent`** checkbox on bindings. |
| **Uitvoering** (NEN/EN, mortar, joints, finish) | Not stored in Bestek JSON yet; candidate for new fields or linked spec PDF. |
| **Opmetingsstaat** (qty, unit, price) | Quantities: IFC / KB (`ont:hasIfcQuantity` etc.) and Phase 3 calc; **price** is outside current pipeline (manual or ERP). |

---

## Related assets

- `src/data/material-dictionary.json` — EPD slug, `standardName`, `category`, match patterns.
- `src/data/material-label-translations.json` — NL display labels keyed by `epdSlug` (beside Turtle KB).
- `data/<projectId>-bestek-bindings.json` — per-group `architect_name`, `material_slug`, `approved_brands`, `article_number`, `or_equivalent`.

Future: export this template filled from bindings + KB quantities; separate **contractor/trade** label pack as discussed for execution-side wording.
