# Reset / clean slate (flush generated artifacts)

Use this when you want to **re-run the pipeline from scratch** without old enriched / KB / calc files.

## What gets generated (per `projectId`)

| File | Phase |
|------|--------|
| `data/<projectId>.ttl` | Phase 1 parse (IFC → triples) |
| `data/<projectId>-enriched.ttl` | Phase 1 enrich |
| `data/<projectId>-translated.ttl` | Phase 2 translate |
| `data/<projectId>-kb.ttl` | Phase 2 link (KB) |
| `data/<projectId>-calc.ttl` | Phase 3 calc |
| `data/<projectId>-calc-latest.json` | Phase 3 calc (JSON mirror) |

## From the app (Phase 1 home)

On **`/`** (Phase 1), use **Reset pipeline data** next to the page title. It calls **`POST /api/clean-pipeline`** with the current **Project ID** (same file list as below). Confirm the dialog first.

## Fastest: cleanup script

From the repo root (default `projectId` is `example`):

```bash
node scripts/clean-pipeline.js
```

For another project:

```bash
node scripts/clean-pipeline.js myproject
# or
PROJECT_ID=myproject node scripts/clean-pipeline.js
```

npm:

```bash
npm run clean:pipeline
```

## Manual delete

If you prefer:

```bash
rm -f data/example.ttl data/example-enriched.ttl data/example-translated.ttl \
  data/example-kb.ttl data/example-calc.ttl data/example-calc-latest.json
```

(Replace `example` with your `projectId`.)

## What this does **not** remove

- **`data/sources/**`** — KBOB / ICE snapshots (re-import with `npm run import:sources` if needed).
- **`config.json`** — active source order / paths (edit by hand or via `/sources`).
- **Large IFC fixtures** (e.g. `data/*.ifc`) — delete only if you want them gone.
- **Docs / xlsx** under `docs/DataSetMaterials/`.

## Browser UI state

The app **persists `projectId`** in `localStorage` under key **`bimimport.projectId`**.

To “start over” with a **new** id in the UI: change **Project ID** on Phase 1, or clear in DevTools (Application → Local Storage) for your dev origin.

## Full nuclear option (repo data folder)

Only if you really want an empty `data/` (you will lose **everything** there, including IFC copies and source TTLs):

```bash
# DANGEROUS — backup first
rm -rf data/*
```

Then restore **source snapshots** with `npm run import:sources` and re-copy any IFC you need.
