# Lesson: Phase 2 Step 2 EPD MVP

## What “EPD” means here
In this project, `EPD` is the Environmental Product Declaration data we attach to `bim:material-*` nodes so later we can compute carbon per element.

## What we implemented (MVP)
Phase 2 Step 2 “Translate” now generates EPD nodes and links them like:
- `bim:material-<id> ont:hasEPD bim:epd-<epdSlug>`

Each created EPD node includes (best-effort for now):
- `a ont:EPD`
- `schema:name`
- `ont:source` (currently `dictionary-mvp`)
- optional numeric fields like `ont:gwpPerUnit` and `ont:density`
- `ont:resolvedAt` timestamp

## Matching strategy (current)
Because the KBOB API requires a Bearer token and ÖKOBAUDAT integration is not wired yet, we used a local dictionary MVP (`src/data/material-dictionary.json`):
- match by keywords in `schema:name` and/or `ont:layerSetName`
- attach the corresponding placeholder EPD values
- preserve traceability in the graph via the `ont:source` and the material match metadata

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

