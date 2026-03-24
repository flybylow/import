# From BIM (IFC) to the current knowledge graph

This document describes **how data flows** from the authoring model to Phase 3 outputs. The app mirrors this as **Phase 1 → Phase 2 → Phase 3** in the header nav.

## High-level flow

```text
IFC file (.ifc)
    │
    ▼
┌───────────────────────────────────────┐
│ Phase 1 – Import (/)                  │
│  • Parse IFC → RDF (BOT + materials)   │
│  • Enrich (quantities, layer names)    │
└───────────────────────────────────────┘
    │  data/<projectId>.ttl
    │  data/<projectId>-enriched.ttl
    ▼
┌───────────────────────────────────────┐
│ Side inputs (not IFC)                  │
│  • material-dictionary.json (routing) │
│  • data/sources/*.ttl (KBOB, ICE, …)  │
│  • config.json (source order)         │
└───────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────┐
│ Phase 2 – Link (/kb)                  │
│  • Translate layer: match materials    │
│    to EPD nodes (dictionary + sources) │
│  • Build KB TTL (material ↔ EPD)       │
└───────────────────────────────────────┘
    │  data/<projectId>-translated.ttl (optional artifact)
    │  data/<projectId>-kb.ttl
    ▼
┌───────────────────────────────────────┐
│ Phase 3 – Calculate (/calculate)      │
│  • Read quantities from enriched path  │
│  • Read GWP/density from KB per EPD    │
│  • Emit calc TTL + JSON                │
└───────────────────────────────────────┘
    │  data/<projectId>-calc.ttl
    │  data/<projectId>-calc-latest.json
```

## Artifacts (per `projectId`)

| Step | Typical file | What it contains |
|------|----------------|------------------|
| Parse | `data/<projectId>.ttl` | Building topology, elements, basic `ont:Material`, IFC types |
| Enrich | `data/<projectId>-enriched.ttl` | Quantities (`bim:qty-*`), layer names, thickness |
| Translate | `data/<projectId>-translated.ttl` | Materials linked to EPD nodes (intermediate) |
| KB | `data/<projectId>-kb.ttl` | Same graph + stable KB view for linking UI |
| Calculate | `data/<projectId>-calc.ttl` | Calculation trace / results graph |
| Calculate | `data/<projectId>-calc-latest.json` | JSON mirror for tooling |

See also `docs/reset-and-clean.md` for the same file list and cleanup commands.

## Debug: what’s on disk (per phase)

Use **`GET /api/pipeline/trace?projectId=<id>`** (JSON) to see **which pipeline files exist**, **byte sizes**, **mtimes**, **`material-dictionary.json` version**, **`config.json`**, and **source TTL** status — plus **hints** (e.g. enriched exists but KB missing).

In the app, open **Debug trace** from the **avatar (A) admin menu** (top right) — it opens a modal with the same data and **Copy JSON** for support logs.

## What “matching” adds

- **IFC** gives **geometry-linked material names** (often Dutch/English mix).
- The **dictionary** turns names into **routing slugs** (e.g. `precast_breedplaat`), not invented LCA numbers.
- **Source KGs** (KBOB, ICE, …) supply **real EPD rows** where text overlap scores above the floor; those literals hydrate `bim:epd-*` nodes when possible.

## UI map

| Nav label | Route | Role in the journey |
|-----------|-------|---------------------|
| Phase 1 | `/` | IFC → parse + enrich TTL |
| Phase 2 - Link | `/kb` | Build / inspect KB, manual overrides |
| Phase 3 - Calculate | `/calculate` | Gate + run carbon using KB LCA; **product passport** cards (per IFC element: quantities + material/EPD stack) from `GET /api/kb/status` (`elementPassports*`) |
| Pipeline | `/pipeline` | **This flow** in one screen (in-app) |
