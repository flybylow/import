# PRD Summary - bimimport

## Product Goal

Build a standalone Next.js tool that:
- imports IFC/BIM files,
- extracts spatial hierarchy, elements, and materials,
- enriches with EPD and carbon data,
- stores results as RDF triples in Turtle files,
- exports Turtle and JSON-LD for manual import into tabulas-eu.

No database server is required. `.ttl` files are the source of truth.

## Core Architecture

1. Upload IFC in browser.
2. Parse server-side via `/api/parse` using `web-ifc` (WASM).
3. Enrich via `/api/enrich` with material classification, EPD lookup, and carbon estimation.
4. Convert to triples via `/api/triples` and write to `data/{project-id}.ttl`.
5. Load and query triples in UI using `rdflib.js` + SPARQL.
6. Export `.ttl` and `.jsonld` via `/api/export`.

## Data and Ontology Highlights

- Spatial model uses BOT (`bot:Building`, `bot:Storey`, `bot:Space`, `bot:Element`).
- Tabulas properties extend data with `tab:*` predicates.
- Key linked entities:
  - `tab:Material`
  - `tab:EPD`
  - `tab:CarbonFootprint`
  - `tab:DigitalProductPassport`

Key chain:
`Building -> Storey -> Space -> Element -> Material/Carbon/DPP -> EPD`

## Main Modules

- `ifc-parser`: reads IFC and extracts hierarchy/elements/materials/psets/qtos.
- `material-classifier`: maps free-text material names to known IDs.
- `epd-lookup`: local cache + Oekobaudat + KBOB fallback chain.
- `carbon-calculator`: quantity + unit conversion + lifecycle GWP totals.
- `triple-generator`: converts data to RDF and serializes Turtle.
- `sparql-engine`: executes in-memory SPARQL against loaded Turtle.
- `exporter`: emits Turtle and JSON-LD.

## UI Scope

- Upload page with project list.
- Project dashboard containing:
  - building tree,
  - triple graph,
  - carbon summary,
  - material table,
  - SPARQL console,
  - export controls.

## Delivery Phases

- Phase 1: parse and store.
- Phase 2: visualize.
- Phase 3: enrich.
- Phase 4: export.

## Success Criteria (PRD)

- IFC upload produces complete triple output.
- Graph and SPARQL views work for core queries.
- At least one material has EPD and computed carbon.
- JSON-LD export is valid.
- Mid-size model processing under 30 seconds.

## Notes for This Repo

- Keep all project docs in `docs/`.
- Treat this summary as the actionable reference.
- If requirements change, update this file and `docs/BASE.md`.
