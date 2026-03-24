# Lesson: Phase 3 Calculate Prep (KB Overview)

## Why we need this screen
Before running carbon calculation we need an explicit overview of:
- what materials are ready (have EPD)
- what is missing (no EPD) so we can create data gaps / prompts for manual resolution.

## MVP behavior (current repo)
Phase 3 prep screen (`/calculate`) now focuses on calculation scope definition from KB data.

`/calculate` loads KB status from:
- `GET /api/kb/status?projectId=<id>`
- source file: `data/<projectId>-kb.ttl`

And shows:
- materials with EPD / without EPD counters
- pipeline status + KPI cards (elements/materials/coverage/selection/total)
- grouped trace rows (group by material id / material name / EPD)
- quantity-based selection list (only rows with `Qty records > 0`)
- selected output preview for calculation
- optional full trace-table toggle (hidden by default)
- result view toggle (summary layout vs raw JSON)

`/calculate` can now send the selected scope to:
- `POST /api/calculate`
with payload:
- `projectId`
- `selection[]` entries containing material label, EPD label, element count, quantity-record count, and compact quantity summary.

Important:
- endpoint now returns a successful MVP estimate response.
- results are persisted to:
  - `data/<projectId>-calc-latest.json`
  - `data/<projectId>-calc.ttl`
- response includes artifact paths (`latestPath`, `ttlPath`) for traceability.

## Knowledge-graph preview (react-force-graph-2d)
The interactive graph + inspector lives in Phase 2 (`/kb`) and is used before Phase 3.

Node meaning:
- `KB` hub node (center): a visual anchor for the preview
- matched materials: nodes labeled with the material name, colored as “matched”
- EPD nodes: one per `epdSlug`, labeled with `epdName` (or slug fallback)
- unmatched materials: nodes labeled with the material name, colored as “unmatched”

Edge meaning:
- A link from a matched material node to an EPD node represents the KB relationship:
  - `bim:material-<id> ont:hasEPD bim:epd-<slug>`

Interaction:
- hover a node to see its name (tooltip)
- drag nodes
- pinch/scroll zoom and pan

## Force-graph hit-testing rule (important)
When clicking nodes in `react-force-graph-2d`, avoid “tuning” by constantly increasing sizes or hit-test radii.
Instead, keep the hit-test math consistent with the library’s default:

- The force-graph shadow hit-test radius uses:
  - `r = sqrt(val) * nodeRelSize + padAmount`
  - where `padAmount` behaves like `1 / globalScale` on the shadow canvas.
- Our goal is that the clickable area matches what the library considers the node size.
This prevents situations where nodes appear, hover works inconsistently, and only a few nodes trigger `onNodeClick`.

Important MVP limitation:
- carbon math is still an MVP estimate using placeholder EPD factors and compact quantity extraction.
- The authoritative linked data remains in `data/<projectId>-kb.ttl`.

## Next improvements
- implement real carbon compute in `/api/calculate` using selected rows
- add data gap creation UI tied to element IDs/properties
- show carbon preview once implemented

