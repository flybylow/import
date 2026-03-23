# Lesson: Phase 2 Knowledge Base Build

## Goal
After Phase 1 enrichment, build a “knowledge base” graph by matching materials to available EPD/product environmental data.

## MVP behavior (current repo)
The Knowledge Base build uses Phase 2 Step 2 Translate (dictionary-based MVP matching) and writes a new Turtle file:

- `data/<projectId>-kb.ttl`

## Data flow
1. Load last enriched TTL:
   - `data/<projectId>-enriched.ttl`
2. Match materials and attach EPD nodes:
   - `bim:material-<id> ont:hasEPD bim:epd-<slug>`
3. Write the KB TTL:
   - `data/<projectId>-kb.ttl`

## UI
- New screen: `/kb`
- Button: “Build KB (from enriched)”
- Shows:
  - KB write path
  - semantic diff preview (triple-level)
  - EPD coverage (`materialsWithEPD` vs `materialsTotal`)

## Next (future)
- Replace dictionary MVP with real KBOB/Oekobaudat fetch-based EPD lookup
- Add manual override UI (confidence, remap, provenance edits)
- Extend KB diff to include EPD provenance fields once APIs are wired

