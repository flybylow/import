# Data sources: KBOB + ICE (Educational)

**Contract (folders, `config.json`, reports, reproducibility):** [`sources-contract.md`](./sources-contract.md)

## Purpose

Phase 2 matching uses **immutable Turtle snapshots** under `data/sources/` plus the existing **dictionary** (`src/data/material-dictionary.json`). The demo enables **both** KBOB and ICE by default via [`config.json`](../config.json).

## Matching order

1. **Dictionary** (curated patterns in `material-dictionary.json`)
2. **Each enabled source** in `config.json` **in array order** (default: KBOB, then ICE)
3. Unmatched materials stay without `ont:hasEPD` until manually overridden on `/kb`

## Import commands

From the repository root:

```bash
npm run import:kbob
npm run import:ice
# or both:
npm run import:sources
```

Outputs:

- `data/sources/kbob/kbob-2026-03-16-v8.02.ttl` + `.report.json`
- `data/sources/ice/ice-educational-2025-10-v4.1.ttl` + `.report.json`

## Provenance

- KBOB rows are taken from sheet **Baumaterialien Matériaux** in the official Liste (v8.02).
- ICE rows are taken from sheet **ICE Summary** (Embodied Carbon, kgCO2e/kg) in the Educational workbook.

## ICE terms

The Educational ICE package includes PDFs under `docs/DataSetMaterials/ICE DB Educational V4.1 - Oct 2025/`. Review **Please Read First** and **Terms of Use** before publishing ICE-derived numbers or redistributing data.

## Snapshot lifecycle

1. Place or update the **input xlsx** under `docs/DataSetMaterials/` (KBOB Liste; ICE Educational workbook).
2. Run `npm run import:kbob` / `import:ice` (or `import:sources`). Scripts write **new** `*.ttl` + `*.report.json` (see importer defaults for output names).
3. Update **`config.json`** `ttlPath` to the snapshot you want **active** (or keep paths if importers overwrite the same filename—prefer versioned names per `sources-contract.md`).
4. Commit TTL + report for reproducible CI/builds.
5. **ICE**: do not redistribute raw workbook contents without complying with bundled **Terms of Use** PDFs under `docs/DataSetMaterials/ICE DB Educational V4.1 - Oct 2025/`.

## UI

- **Sources** (`/sources`): snapshot paths, report metadata, **import** and **enable / order** controls.
- **Phase 2 - Link** (`/kb`): active source **version** hints, **warnings** if TTL missing or source disabled.
