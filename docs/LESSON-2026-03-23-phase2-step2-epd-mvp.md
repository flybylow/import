# Lesson: Phase 2 Step 2 EPD MVP

## What “EPD” means here
In this project, `EPD` is the Environmental Product Declaration data we attach to `bim:material-*` nodes so later we can compute carbon per element.

## What we implemented (MVP)
Phase 2 Step 2 “Translate” now generates EPD nodes and links them like:
- `bim:material-<id> ont:hasEPD bim:epd-<epdSlug>`

Each created EPD node includes (best-effort for now):
- `a ont:EPD`
- `schema:name`
- `ont:source` on the **material**: `dictionary-routed` (dictionary + KBOB/ICE data) or `dictionary-no-lca` (routing only — no GWP in graph)
- `ont:sourceMatchScore` on the **material** when a source row wins: **raw** overlap score from the matcher (not LCA)
- `ont:epdDataProvenance` on the **EPD**: `source-import` or `dictionary-no-lca-data`
- optional **`ont:gwpPerUnit` / `ont:density` only when** copied from source TTL (or absent if no source match)
- `ont:resolvedAt` on dictionary-no-LCA nodes; source copies set their own

## Matching strategy (current)
Local dictionary **routes** materials to `bim:epd-{epdSlug}` by keywords in `schema:name` / `ont:layerSetName` (no invented LCA in JSON). **GWP/density** come from **merged KBOB/ICE TTL** when `pickFirstOrderedSourceMatch` finds a hit; otherwise the link exists without LCA triples. See `docs/kg-dictionary-source-hydration.md`.

## Outputs
Step 2 Translate writes:
- `data/<projectId>-translated.ttl`

and the UI can show:
- diff preview vs `data/<projectId>-enriched.ttl`
- an updated enriched Turtle preview (including EPD triples)

## Next (when APIs are ready)
Replace the dictionary MVP with real fetch-based lookups:
- KBOB / lcadata.ch API (Bearer token)
- ÖKOBAUDAT interface for matching + retrieving EPD fields
- keep the same triple structure and only swap the value source/provenance

