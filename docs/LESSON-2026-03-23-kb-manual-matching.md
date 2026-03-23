# Lesson: Manual Matching for Unmatched Materials

## Why this exists
After KB build, some `bim:material-*` nodes may remain without an attached `ont:hasEPD`.
This happens because the current MVP matcher (dictionary based) cannot map certain IFC material names/layer sets to known EPDs.

## MVP behavior (text-only)
On the `/kb` screen:
- Under **Unmatched materials (no EPD)** you can:
  - pick an EPD from a dropdown
  - click **Apply manual match**

## What the backend does
The form calls:
`POST /api/kb/override`

For each override it:
- removes existing `ont:hasEPD` links for the material (if any)
- adds `ont:hasEPD` pointing to the selected `bim:epd-*` node
- sets:
  - `ont:matchType "manual"`
  - `ont:matchConfidence 0.5`
  - `ont:source "manual-override"`
  - `ont:resolvedAt <timestamp>`
- rewrites `data/<projectId>-kb.ttl`

## UI note
Rebuilding the KB again (`Build KB`) will overwrite manual overrides (MVP). Manual overrides are intended to be applied after a KB build, for preview and gap-filling.

