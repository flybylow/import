# Lesson: Phase 3 Calculate Prep (KB Overview)

## Why we need this screen
Before running carbon calculation we need an explicit overview of:
- what materials are ready (have EPD)
- what is missing (no EPD) so we can create data gaps / prompts for manual resolution.

## MVP behavior (current repo)
Phase 3 prep screen (`/calculate`) is currently a stub.

The KB overview UI (materials-ready/missing + the interactive knowledge graph + properties inspector)
lives on Phase 2 Knowledge Base (`/kb`).

`/kb` loads the existing KB summary from:
- `data/<projectId>-kb.ttl`

And shows:
- materials with EPD / without EPD
- a short matching preview (top examples)
- an interactive knowledge-graph preview (materials + EPD links)

It does not yet run carbon (Step 3 calculate is coming soon).

## Knowledge-graph preview (react-force-graph-2d)
The `/kb` screen renders a force-graph based on the KB API’s `kbGraph` payload (full materials + EPD nodes for the KB).

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
- this is still only a *graph visualization*; carbon calculation is not implemented yet.
- The authoritative data remains in `data/<projectId>-kb.ttl`.

## Next improvements
- connect to the real `/api/calculate` endpoint when it exists
- add data gap creation UI tied to element IDs/properties
- show carbon preview once implemented

