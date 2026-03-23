# Lesson: Preserve BaseQuantities in Phase 2 Step 1

## Problem
Phase 2 Step 1 (Enrich) needs to extract quantities from IFC `BaseQuantities` so later steps (Translate/Calculate) can work. We also must avoid information loss: even if a quantity does not map to our “priority” predicates (like `ont:grossVolume`), it still needs to be represented in the enriched graph.

## Rule (Option B, no-loss)
For every IFC `BaseQuantities` numeric value found on an element:
- Store the value in the element using the priority predicates when the quantity name is recognized (e.g. `Length`, `GrossVolume`, etc.).
- Additionally, store *all* BaseQuantities numerics as generic quantity nodes so nothing is dropped:
  - `bim:qty-<elementExpressId>-<i>`
  - `ont:ifcQuantityName "..."`,
  - `ont:ifcQuantityValue <number>`,
  - optional `ont:ifcQuantityUnit`.
- Link them to the element via `ont:hasIfcQuantity`.

## Implementation reference
- Backend extraction lives in `src/lib/layer1-enrich.ts` (`extractBaseQuantitiesFromElement()` and the element enrichment loop).
- The UI “Quantities preview” parses those generic nodes:
  - it expects headers like `bim:qty-<elementId>-<i>`,
  - then reads `ont:ifcQuantityName` and `ont:ifcQuantityValue`.

## Bug to avoid
If you collect quantities into an array, do not accidentally shadow the variable name inside the BaseQuantities loop (this can cause the returned `quantities` list to be empty even though values were computed).

## Verification checklist (quick)
After rerunning Step 1 Enrich:
- Ensure the enriched Turtle contains `bim:qty-...` nodes.
- Ensure the element-level priority predicates exist for recognized names (like `ont:length`, `ont:grossVolume`).
- Ensure the Quantities preview shows numeric rows for multiple elements.

