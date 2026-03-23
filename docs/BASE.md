# Knowledge Base

This file stores persistent project conventions and lessons learned.

## Core Rule 001 - Documentation Location

- Never place documentation files in the project root.
- Always place documentation in the `docs/` folder.
- Keep lessons in Markdown files and organize them by topic.

## Update Routine

- Add new lessons as soon as we learn them.
- Keep entries short, clear, and practical.
- Review and refresh old entries periodically so guidance stays current.

## Notes Log

- 2026-03-23: Initialized knowledge base with Rule 001 (all docs live in `docs/`).
- 2026-03-23: Added PRD-derived project knowledge in `docs/PRD-SUMMARY.md` (architecture, modules, phases, and success criteria).
- 2026-03-23: Phase 2 Step 1 enrichment stores all IFC `BaseQuantities` in `bim:qty-*` nodes (no-loss / Option B) and links them via `ont:hasIfcQuantity` so UI preview can display numbers and later steps can compute carbon reliably.
- 2026-03-23: Phase 2 Step 2 Translate MVP generates EPD nodes and links them via `ont:hasEPD` using a local dictionary (`src/data/material-dictionary.json`) since external EPD APIs are not yet authenticated/integrated.
- 2026-03-23: Added Phase 2 Knowledge Base screen (`/kb`) that loads the last enriched TTL and builds `data/<projectId>-kb.ttl` by matching materials to EPD data (MVP dictionary matcher for now).
- 2026-03-23: Added manual matching UI + endpoint for unmatched KB materials (`POST /api/kb/override`) so we can gap-fill by selecting an EPD from `epdCatalog`.
- 2026-03-23: Added Phase 3 Calculate prep screen (`/calculate`) and `GET /api/kb/status` so we can show what’s matched vs missing before running carbon calculation.
- 2026-03-23: Standardized UX naming to `Phase 2 - Link`; top navigation now points Phase 2 to `/kb`, and `/calculate` is the Phase 3 handoff page while calculation remains a stub.
